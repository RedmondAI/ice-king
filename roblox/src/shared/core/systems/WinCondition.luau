--!strict
-- Match resolution: time win, overtime, forfeit, train year.
-- Ported from packages/game-core/src/systems/winConditionSystem.ts.
-- Win metric is total MONEY summed per team (net worth is display-only).

local Helpers = require(script.Parent.Parent.Helpers)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState

local WinCondition = {}

export type MatchOutcome = {
	ended: boolean,
	winnerId: string?,
	reason: string?,
}

type TeamEntry = { teamId: string, money: number, playerIds: { string } }

-- Teams in first-seen (playerOrder) order.
local function buildTeamScores(state: GameState): { TeamEntry }
	local order: { TeamEntry } = {}
	local byTeam: { [string]: TeamEntry } = {}
	for _, playerId in state.playerOrder do
		local player = state.players[playerId]
		if not player then
			continue
		end
		local teamId = Helpers.playerTeam(state, playerId)
		local entry = byTeam[teamId]
		if not entry then
			entry = { teamId = teamId, money = 0, playerIds = {} }
			byTeam[teamId] = entry
			table.insert(order, entry)
		end
		entry.money += player.money
		table.insert(entry.playerIds, playerId)
	end
	return order
end

function WinCondition.syncTrainYear(state: GameState)
	state.trainSales.currentYear = math.floor(state.season.seasonFlipCount / 2) + 1
end

function WinCondition.evaluateTimeWin(state: GameState, config: any): MatchOutcome
	if state.match.ended then
		return {
			ended = true,
			winnerId = state.match.winnerId,
			reason = if state.match.winnerId then "TIME" else "DRAW",
		}
	end

	if state.nowMs - state.match.startedAtMs < state.match.durationMs then
		return { ended = false, winnerId = nil, reason = nil }
	end

	local ranked = {}
	for _, entry in buildTeamScores(state) do
		table.insert(ranked, {
			playerId = entry.playerIds[1] or entry.teamId,
			teamId = entry.teamId,
			money = entry.money,
			members = entry.playerIds,
		})
	end
	table.sort(ranked, function(a, b)
		return a.money > b.money
	end)

	local first = ranked[1]
	local second = ranked[2]

	if not first or not second then
		state.match.ended = true
		state.match.winnerId = nil
		Helpers.addLog(state, "match.ended", { reason = "DRAW", score = ranked })
		return { ended = true, winnerId = nil, reason = "DRAW" }
	end

	if first.money > second.money then
		state.match.ended = true
		state.match.winnerId = first.playerId
		Helpers.addLog(state, "match.ended", {
			reason = "TIME",
			winnerId = first.playerId,
			winnerTeam = first.teamId,
			winnerTeamMembers = first.members,
			score = ranked,
		})
		return { ended = true, winnerId = first.playerId, reason = "TIME" }
	end

	if config.win.overtimeEnabled and not state.match.overtime then
		state.match.overtime = true
		state.match.durationMs += config.win.overtimeDurationMs
		Helpers.addLog(state, "match.overtimeStarted", {
			overtimeDurationMs = config.win.overtimeDurationMs,
			newDurationMs = state.match.durationMs,
		})
		return { ended = false, winnerId = nil, reason = nil }
	end

	state.match.ended = true
	state.match.winnerId = nil
	Helpers.addLog(state, "match.ended", { reason = "DRAW", score = ranked })
	return { ended = true, winnerId = nil, reason = "DRAW" }
end

function WinCondition.forfeitMatch(state: GameState, loserId: string): MatchOutcome
	if state.match.ended then
		return {
			ended = true,
			winnerId = state.match.winnerId,
			reason = if state.match.winnerId then "FORFEIT" else "DRAW",
		}
	end

	local loserTeam = state.teamByPlayerId and state.teamByPlayerId[loserId]
	local winnerId: string? = nil
	if loserTeam then
		for _, id in state.playerOrder do
			if Helpers.playerTeam(state, id) ~= loserTeam then
				winnerId = id
				break
			end
		end
	else
		for _, id in state.playerOrder do
			if id ~= loserId then
				winnerId = id
				break
			end
		end
	end

	state.match.ended = true
	state.match.winnerId = winnerId

	Helpers.addLog(
		state,
		"match.ended",
		{ reason = "FORFEIT", winnerId = winnerId, loserId = loserId }
	)

	return { ended = true, winnerId = winnerId, reason = "FORFEIT" }
end

return WinCondition
