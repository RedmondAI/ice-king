--!strict
-- Small pure helpers shared by the systems. Ported from packages/game-core/src/helpers.ts.
--
-- Coordinate system: tiles use 0-based (x, y) like the original. The flat `tiles`
-- array is 1-indexed (Luau arrays start at 1), so tileIndex adds +1.

local Types = require(script.Parent.Types)

type GameState = Types.GameState
type PlayerState = Types.PlayerState
type TileState = Types.TileState
type Season = Types.Season

local Helpers = {}

function Helpers.tileIndex(width: number, x: number, y: number): number
	return y * width + x + 1
end

function Helpers.inBounds(state: { width: number, height: number }, x: number, y: number): boolean
	return x >= 0 and y >= 0 and x < state.width and y < state.height
end

function Helpers.getTile(
	state: { width: number, tiles: { TileState } },
	x: number,
	y: number
): TileState
	return state.tiles[Helpers.tileIndex(state.width, x, y)]
end

function Helpers.getPlayer(state: GameState, playerId: string): PlayerState?
	return state.players[playerId]
end

function Helpers.oppositeSeason(season: Season): Season
	if season == "SUMMER" then
		return "WINTER"
	end
	return "SUMMER"
end

function Helpers.clamp(value: number, min: number, max: number): number
	return math.max(min, math.min(max, value))
end

local BASE36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

-- Matches JS Number.prototype.toString(36) for non-negative integers.
local function toBase36(value: number): string
	local n = math.floor(value)
	if n <= 0 then
		return "0"
	end
	local out = ""
	while n > 0 do
		local remainder = n % 36
		out = string.sub(BASE36_DIGITS, remainder + 1, remainder + 1) .. out
		n = math.floor(n / 36)
	end
	return out
end

function Helpers.createId(prefix: string, nowMs: number, randomSeed: number): string
	return prefix .. "_" .. toBase36(nowMs) .. "_" .. toBase36(randomSeed)
end

function Helpers.roundDown(value: number): number
	return math.floor(value)
end

function Helpers.addLog(
	state: GameState,
	logType: string,
	payload: { [string]: any },
	keepCount: number?
)
	local keep = keepCount or 500
	local priorCount = #state.actionLog
	table.insert(state.actionLog, {
		id = logType .. "_" .. tostring(state.nowMs) .. "_" .. tostring(priorCount),
		atMs = state.nowMs,
		type = logType,
		payload = payload,
	})
	local overflow = #state.actionLog - keep
	if overflow > 0 then
		for _ = 1, overflow do
			table.remove(state.actionLog, 1)
		end
	end
end

export type StorageSplit = {
	refrigeratedCapacity: number,
	refrigeratedIce: number,
	unrefrigeratedIce: number,
}

function Helpers.playerStorageSplit(
	player: { ice: number, refrigerators: number },
	fridgePerUnit: number
): StorageSplit
	local refrigeratedCapacity = player.refrigerators * fridgePerUnit
	local refrigeratedIce = math.min(player.ice, refrigeratedCapacity)
	local unrefrigeratedIce = math.max(player.ice - refrigeratedCapacity, 0)
	return {
		refrigeratedCapacity = refrigeratedCapacity,
		refrigeratedIce = refrigeratedIce,
		unrefrigeratedIce = unrefrigeratedIce,
	}
end

function Helpers.playerTeam(
	state: { teamByPlayerId: { [string]: string }? },
	playerId: string
): string
	local map = state.teamByPlayerId
	if map and map[playerId] then
		return map[playerId]
	end
	return playerId
end

function Helpers.arePlayersTeammates(
	state: { teamByPlayerId: { [string]: string }? },
	playerAId: string,
	playerBId: string
): boolean
	return Helpers.playerTeam(state, playerAId) == Helpers.playerTeam(state, playerBId)
end

function Helpers.isTileOwnedByPlayerOrTeammate(
	state: { teamByPlayerId: { [string]: string }? },
	ownerId: string?,
	playerId: string
): boolean
	if ownerId == nil then
		return false
	end
	return ownerId == playerId or Helpers.arePlayersTeammates(state, ownerId, playerId)
end

return Helpers
