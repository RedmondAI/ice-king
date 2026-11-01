--!strict
-- Pond harvesting lifecycle. Ported from packages/game-core/src/systems/pondSystem.ts.

local Helpers = require(script.Parent.Parent.Helpers)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState
type ActionResult = Types.ActionResult

local Pond = {}

local function harvestDurationMs(config: any): number
	return math.max(1, config.timing.pondHarvestDurationMs)
end

local function harvestYield(): number
	return 1
end

local function hasActivePondJob(state: GameState, x: number, y: number): boolean
	for _, job in state.ponds do
		if
			job.pondX == x
			and job.pondY == y
			and (job.status == "ACTIVE" or job.status == "CLAIMABLE")
		then
			return true
		end
	end
	return false
end

function Pond.startPondHarvest(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number
): ActionResult
	local player = state.players[playerId]
	if not player then
		return { ok = false, code = "INVALID_PLAYER", message = "Player does not exist." }
	end
	if not Helpers.inBounds(state, x, y) then
		return { ok = false, code = "INVALID_TILE", message = "Tile is out of bounds." }
	end

	local tile = Helpers.getTile(state, x, y)
	if tile.type ~= "POND" then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Pond harvest can only start on pond tiles.",
		}
	end
	if not Helpers.isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId) then
		return {
			ok = false,
			code = "NOT_OWNER",
			message = "You must own this pond tile to harvest it.",
		}
	end
	if hasActivePondJob(state, x, y) then
		return {
			ok = false,
			code = "ALREADY_ACTIVE",
			message = "This pond already has an active or claimable harvest job.",
		}
	end
	if state.season.logicSeason ~= "WINTER" then
		return {
			ok = false,
			code = "WRONG_SEASON",
			message = "Pond harvest can only be started in winter.",
		}
	end
	-- Harvesting is winter-only: refuse if there isn't enough winter left for the
	-- 1-minute job to finish before summer arrives.
	local msUntilSummer = (state.season.cycleStartMs + state.season.cycleDurationMs) - state.nowMs
	if msUntilSummer < harvestDurationMs(config) then
		return {
			ok = false,
			code = "WRONG_SEASON",
			message = "You can't harvest ice because summer is coming soon.",
		}
	end
	if player.money < config.economy.pondHarvestCost then
		return {
			ok = false,
			code = "INSUFFICIENT_FUNDS",
			message = "Not enough money to start harvest job.",
		}
	end

	player.money -= config.economy.pondHarvestCost

	local durationMs = harvestDurationMs(config)
	local pondJob = {
		id = Helpers.createId("pond", state.nowMs, x * 1000 + y),
		pondX = x,
		pondY = y,
		ownerId = playerId,
		harvestIceYield = harvestYield(),
		status = "ACTIVE",
		createdAtMs = state.nowMs,
		claimAtMs = state.nowMs + durationMs,
		claimedAtMs = nil,
	}

	table.insert(state.ponds, pondJob)
	Helpers.addLog(state, "pond.harvest.started", {
		playerId = playerId,
		x = x,
		y = y,
		pondJobId = pondJob.id,
		claimAtMs = pondJob.claimAtMs,
	})

	return {
		ok = true,
		code = "OK",
		message = "Pond harvest started.",
		payload = { pondJobId = pondJob.id, claimAtMs = pondJob.claimAtMs },
	}
end

function Pond.updatePondHarvestJobs(state: GameState)
	for _, job in state.ponds do
		if job.status == "ACTIVE" and state.nowMs >= job.claimAtMs then
			job.status = "CLAIMABLE"
		end
	end
end

-- At winter -> summer, any uncollected harvest (ACTIVE or CLAIMABLE) melts and is lost.
function Pond.expireHarvestsAtSummer(state: GameState)
	local kept = {}
	for _, job in state.ponds do
		if job.status == "ACTIVE" or job.status == "CLAIMABLE" then
			Helpers.addLog(state, "pond.harvest.lost", {
				playerId = job.ownerId,
				pondX = job.pondX,
				pondY = job.pondY,
				lost = job.harvestIceYield,
			})
		else
			table.insert(kept, job)
		end
	end
	state.ponds = kept
end

function Pond.claimPondHarvest(
	state: GameState,
	_config: any,
	playerId: string,
	pondJobId: string
): ActionResult
	local player = state.players[playerId]
	if not player then
		return { ok = false, code = "INVALID_PLAYER", message = "Player does not exist." }
	end

	local job = nil
	for _, entry in state.ponds do
		if entry.id == pondJobId then
			job = entry
			break
		end
	end

	if not job or not Helpers.isTileOwnedByPlayerOrTeammate(state, job.ownerId, playerId) then
		return {
			ok = false,
			code = "NOT_CLAIMABLE",
			message = "Pond job not found for this player.",
		}
	end

	-- Ice can only be collected in winter; uncollected ice melts when summer arrives.
	if state.season.logicSeason ~= "WINTER" then
		return {
			ok = false,
			code = "WRONG_SEASON",
			message = "Ice can only be collected in winter.",
		}
	end

	if job.status == "ACTIVE" then
		if state.nowMs < job.claimAtMs then
			return { ok = false, code = "NOT_CLAIMABLE", message = "Pond job is not claimable yet." }
		end
		-- Allow immediate claim right at completion, before the tick flips the status.
		job.status = "CLAIMABLE"
	end

	if job.status ~= "CLAIMABLE" then
		return { ok = false, code = "NOT_CLAIMABLE", message = "Pond job is not claimable." }
	end

	job.status = "CLAIMED"
	job.claimedAtMs = state.nowMs
	local iceGained = job.harvestIceYield
	player.ice += iceGained

	Helpers.addLog(state, "pond.harvest.claimed", {
		playerId = playerId,
		pondJobId = pondJobId,
		pondX = job.pondX,
		pondY = job.pondY,
		iceGained = iceGained,
	})

	return {
		ok = true,
		code = "OK",
		message = "Pond ice claimed.",
		payload = { pondJobId = pondJobId, iceAdded = iceGained },
	}
end

return Pond
