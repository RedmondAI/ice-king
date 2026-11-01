--!strict
-- Owns every authoritative match on this server: solo matches (one player vs the
-- heuristic bot) and two-player matches (two humans sharing one engine). Ticks them
-- and replicates trimmed snapshots to each seat from that seat's point of view.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Engine = require(IceKing.core.Engine)
local Remotes = require(IceKing.Remotes)

local MatchService = {}

local REPLICATE_INTERVAL = 0.1 -- seconds between snapshots
local SOLO_HUMAN_ID = "P1"

type MatchKind = "SOLO" | "PVP"

type Match = {
	kind: MatchKind,
	engine: any,
	-- Which engine player id each connected Roblox player controls.
	seats: { [Player]: string },
	accum: number,
	endedNotified: boolean,
	opponentLeft: boolean,
}

type QueueEntry = { player: Player, mode: string }

local matchByPlayer: { [Player]: Match } = {}
local activeMatches: { [Match]: boolean } = {}
local queue: { QueueEntry } = {}

local function resolveMode(mode: any): string
	return if mode == "DEV_FAST" then "DEV_FAST" else "PROD"
end

local function makeSeed(player: Player): string
	return "seed-"
		.. player.UserId
		.. "-"
		.. tostring(os.time())
		.. "-"
		.. tostring(math.random(1, 1e6))
end

local function buildSnapshot(match: Match, seatId: string)
	local engine = match.engine
	local state = engine:getState()
	return {
		matchId = state.seed, -- unique per match
		nowMs = state.nowMs,
		width = state.width,
		height = state.height,
		tiles = state.tiles,
		players = state.players,
		playerOrder = state.playerOrder,
		teamByPlayerId = state.teamByPlayerId,
		season = state.season,
		ponds = state.ponds,
		factoryJobs = state.factoryJobs,
		trainSales = state.trainSales,
		summerSkipVotes = state.summerSkipVotesByPlayerId,
		match = state.match,
		matchKind = match.kind,
		opponentLeft = match.opponentLeft,
		humanId = seatId,
		economy = engine.config.economy,
		pondHarvestDurationMs = engine.config.timing.pondHarvestDurationMs,
		netWorth = engine:getNetWorth(),
	}
end

local function replicate(match: Match)
	local stateUpdate = Remotes.event("StateUpdate")
	for player, seatId in match.seats do
		stateUpdate:FireClient(player, buildSnapshot(match, seatId))
	end
end

local function sendStatus(player: Player, status: string, mode: string?)
	Remotes.event("MatchmakingStatus"):FireClient(player, { status = status, mode = mode })
end

local function removeFromQueue(player: Player): boolean
	for index, entry in queue do
		if entry.player == player then
			table.remove(queue, index)
			return true
		end
	end
	return false
end

-- Detaches a player from their current match. Leaving a live two-player match
-- forfeits it, so the remaining player is told they won.
local function leaveMatch(player: Player)
	local match = matchByPlayer[player]
	if not match then
		return
	end
	matchByPlayer[player] = nil
	local seatId = match.seats[player]
	match.seats[player] = nil

	local state = match.engine:getState()
	if match.kind == "PVP" and seatId and not state.match.ended then
		match.engine:applyAction({ type = "player.forfeit", playerId = seatId }, "PLAYER")
		match.opponentLeft = true
		match.endedNotified = true
		replicate(match)
	end

	if next(match.seats) == nil then
		activeMatches[match] = nil
	end
end

local function register(match: Match)
	activeMatches[match] = true
	for player in match.seats do
		matchByPlayer[player] = match
	end
	replicate(match)
end

function MatchService.start(player: Player, mode: string)
	removeFromQueue(player)
	leaveMatch(player)
	local engine = Engine.createPlayVsComputer(
		makeSeed(player),
		player.DisplayName,
		resolveMode(mode),
		"INTERNAL_HEURISTIC"
	)
	register({
		kind = "SOLO",
		engine = engine,
		seats = { [player] = SOLO_HUMAN_ID },
		accum = 0,
		endedNotified = false,
		opponentLeft = false,
	})
end

-- Joins the two-player queue. The first waiting player hosts, so the match uses
-- their mode (normal or fast); the second player is told which one they got.
function MatchService.findMatch(player: Player, mode: string)
	removeFromQueue(player)
	leaveMatch(player)

	local host = table.remove(queue, 1)
	if not host then
		table.insert(queue, { player = player, mode = resolveMode(mode) })
		sendStatus(player, "SEARCHING", resolveMode(mode))
		return
	end

	local engine = Engine.createPlayVsPlayer(
		makeSeed(host.player),
		host.player.DisplayName,
		player.DisplayName,
		host.mode
	)
	sendStatus(host.player, "IDLE", host.mode)
	sendStatus(player, "IDLE", host.mode)
	register({
		kind = "PVP",
		engine = engine,
		seats = { [host.player] = "P1", [player] = "P2" },
		accum = 0,
		endedNotified = false,
		opponentLeft = false,
	})
end

function MatchService.cancelFind(player: Player)
	removeFromQueue(player)
	sendStatus(player, "IDLE")
end

function MatchService.handleAction(player: Player, action: any)
	local match = matchByPlayer[player]
	if not match or type(action) ~= "table" then
		return
	end
	-- Force the sender's own seat so a client can never act as anyone else.
	action.playerId = match.seats[player]
	local result = match.engine:applyAction(action, "PLAYER")
	Remotes.event("ActionFeedback"):FireClient(player, {
		ok = result.ok,
		code = result.code,
		message = result.message,
		-- Lets the client play an on-board effect (e.g. a tile purchase) instead of a toast.
		actionType = action.type,
		x = action.x,
		y = action.y,
	})
	replicate(match) -- immediate feedback after a player action
end

-- Testing helper: grant ice directly (bypasses the action system on purpose).
function MatchService.debugGiveIce(player: Player, amount: number)
	local match = matchByPlayer[player]
	if not match then
		return
	end
	local p = match.engine:getState().players[match.seats[player]]
	if p then
		p.ice += amount
		replicate(match)
	end
end

function MatchService.remove(player: Player)
	removeFromQueue(player)
	leaveMatch(player)
end

function MatchService.step(dt: number)
	for match in activeMatches do
		match.engine:tick(dt * 1000)
		match.accum += dt
		local ended = match.engine:getState().match.ended
		if match.accum >= REPLICATE_INTERVAL or (ended and not match.endedNotified) then
			match.accum = 0
			if ended then
				match.endedNotified = true
			end
			replicate(match)
		end
	end
end

return MatchService
