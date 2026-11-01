--!strict
-- Heuristic bot (profile TESTER_V1). Ported from packages/game-core/src/systems/botSystem.ts.
--
-- IMPORTANT: with maxActions = 1 (chooseHeuristicBotAction), addAction caps the
-- list at the first candidate, so the bot's actual pick is driven by ENUMERATION
-- ORDER (claim > harvest > sell > train > craft > build > expand), not by score.
-- The score ranking only matters when enumerating a larger candidate set.

local Helpers = require(script.Parent.Parent.Helpers)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState
type GameAction = Types.GameAction
type TileState = Types.TileState
type ActionResult = Types.ActionResult
type Point = { x: number, y: number }

local Bot = {}

local BOT_ACTION_COOLDOWN_MIN_MS = 20000
local BOT_ACTION_COOLDOWN_MAX_MS = 30000

local function deterministicJitterMs(nowMs: number, playerId: string, maxJitter: number): number
	local hash = 0
	local key = playerId .. ":" .. nowMs
	for i = 1, #key do
		hash = (hash * 31 + string.byte(key, i)) % 4294967296
	end
	return hash % math.max(1, maxJitter)
end

local function deterministicActionCooldownMs(nowMs: number, playerId: string): number
	local spread = BOT_ACTION_COOLDOWN_MAX_MS - BOT_ACTION_COOLDOWN_MIN_MS
	local jitter = deterministicJitterMs(nowMs, playerId .. ":cooldown", spread + 1)
	return BOT_ACTION_COOLDOWN_MIN_MS + jitter
end

-- Stable serialization used only for de-duplicating candidate actions.
local function canonicalize(value: any): string
	if type(value) == "table" then
		local keys = {}
		for key in pairs(value) do
			table.insert(keys, key)
		end
		table.sort(keys)
		local parts = {}
		for _, key in ipairs(keys) do
			table.insert(parts, '"' .. tostring(key) .. '":' .. canonicalize(value[key]))
		end
		return "{" .. table.concat(parts, ",") .. "}"
	elseif type(value) == "string" then
		return '"' .. value .. '"'
	else
		return tostring(value)
	end
end

local function allTilesByOwner(state: GameState, ownerId: string): { TileState }
	local out: { TileState } = {}
	for _, tile in state.tiles do
		if tile.ownerId == ownerId then
			table.insert(out, tile)
		end
	end
	return out
end

local function neighbors(state: GameState, x: number, y: number): { Point }
	local points: { Point } = {}
	for dy = -1, 1 do
		for dx = -1, 1 do
			if dx == 0 and dy == 0 then
				continue
			end
			local nx = x + dx
			local ny = y + dy
			if nx >= 0 and ny >= 0 and nx < state.width and ny < state.height then
				table.insert(points, { x = nx, y = ny })
			end
		end
	end
	return points
end

local function tileAt(state: GameState, x: number, y: number): TileState
	return Helpers.getTile(state, x, y)
end

local function isPlayableTile(tile: TileState): boolean
	return tile.type ~= "VOID"
end

local function ownStructure(state: GameState, playerId: string, structureType: string): Point?
	for _, tile in allTilesByOwner(state, playerId) do
		if tile.type == structureType then
			return { x = tile.x, y = tile.y }
		end
	end
	return nil
end

local function ownBuildableTiles(state: GameState, playerId: string, limit: number): { Point }
	local points: { Point } = {}
	for _, tile in allTilesByOwner(state, playerId) do
		if tile.type == "GRASS" or tile.type == "FOREST" then
			table.insert(points, { x = tile.x, y = tile.y })
			if #points >= limit then
				break
			end
		end
	end
	return points
end

local function availableFactories(state: GameState, playerId: string, limit: number): { Point }
	local points: { Point } = {}
	for _, factory in allTilesByOwner(state, playerId) do
		if factory.type ~= "FACTORY" then
			continue
		end
		local busy = false
		for _, job in state.factoryJobs do
			if
				job.x == factory.x
				and job.y == factory.y
				and (job.status == "ACTIVE" or job.status == "COMPLETE")
			then
				busy = true
				break
			end
		end
		if not busy then
			table.insert(points, { x = factory.x, y = factory.y })
			if #points >= limit then
				break
			end
		end
	end
	return points
end

local function ownHouses(state: GameState, playerId: string): { Point }
	local points: { Point } = {}
	for _, tile in allTilesByOwner(state, playerId) do
		if tile.type == "HOUSE" then
			table.insert(points, { x = tile.x, y = tile.y })
		end
	end
	return points
end

local function ownPondsWithoutJobs(state: GameState, playerId: string, limit: number): { Point }
	local points: { Point } = {}
	for _, pond in allTilesByOwner(state, playerId) do
		if pond.type ~= "POND" then
			continue
		end
		local hasJob = false
		for _, job in state.ponds do
			if
				job.pondX == pond.x
				and job.pondY == pond.y
				and job.ownerId == playerId
				and (job.status == "ACTIVE" or job.status == "CLAIMABLE")
			then
				hasJob = true
				break
			end
		end
		if not hasJob then
			table.insert(points, { x = pond.x, y = pond.y })
			if #points >= limit then
				break
			end
		end
	end
	return points
end

type ExpansionTarget = { x: number, y: number, buyout: boolean }

local function collectExpansionTargets(
	state: GameState,
	playerId: string,
	includeFallback: boolean,
	limit: number
): { ExpansionTarget }
	local targets: { ExpansionTarget } = {}
	local seen: { [string]: boolean } = {}

	local function push(target: ExpansionTarget)
		local key = target.x .. "," .. target.y .. "," .. (if target.buyout then "B" else "U")
		if seen[key] then
			return
		end
		seen[key] = true
		table.insert(targets, target)
	end

	for _, tile in allTilesByOwner(state, playerId) do
		for _, point in neighbors(state, tile.x, tile.y) do
			local candidate = tileAt(state, point.x, point.y)
			if not isPlayableTile(candidate) then
				continue
			end
			if candidate.ownerId == nil then
				push({ x = candidate.x, y = candidate.y, buyout = false })
			elseif candidate.ownerId ~= playerId then
				push({ x = candidate.x, y = candidate.y, buyout = true })
			end
			if #targets >= limit then
				return targets
			end
		end
	end

	for _, tile in state.tiles do
		if not isPlayableTile(tile) then
			continue
		end
		if tile.type == "POND" or tile.type == "HOUSE" or tile.type == "TRAIN" then
			if tile.ownerId == nil then
				push({ x = tile.x, y = tile.y, buyout = false })
			elseif tile.ownerId ~= playerId then
				push({ x = tile.x, y = tile.y, buyout = true })
			end
		end
		if #targets >= limit then
			return targets
		end
	end

	if not includeFallback then
		return targets
	end

	for _, tile in state.tiles do
		if not isPlayableTile(tile) then
			continue
		end
		if tile.ownerId == nil then
			push({ x = tile.x, y = tile.y, buyout = false })
		end
		if #targets >= limit then
			break
		end
	end

	return targets
end

local function addAction(
	actions: { GameAction },
	seen: { [string]: boolean },
	action: GameAction,
	maxActions: number
)
	if #actions >= maxActions then
		return
	end
	local key = canonicalize(action)
	if seen[key] then
		return
	end
	seen[key] = true
	table.insert(actions, action)
end

local function tileStrategicValue(tile: TileState): number
	if tile.type == "TRAIN" then
		return 80
	elseif tile.type == "HOUSE" then
		return 68
	elseif tile.type == "POND" then
		return 52
	elseif tile.type == "FACTORY" then
		return 44
	elseif tile.type == "FOREST" then
		return 26
	elseif tile.type == "VOID" then
		return 0
	end
	return 22
end

local function seasonMsUntilFlip(state: GameState): number
	local flipAtMs = state.season.cycleStartMs + state.season.cycleDurationMs
	return math.max(0, flipAtMs - state.nowMs)
end

local function ownedCountByType(state: GameState, playerId: string, tileType: string): number
	local count = 0
	for _, tile in state.tiles do
		if tile.ownerId == playerId and tile.type == tileType then
			count += 1
		end
	end
	return count
end

local function scoreBotAction(
	state: GameState,
	config: any,
	botPlayerId: string,
	action: GameAction
): number
	local player = state.players[botPlayerId]
	if not player then
		return 0
	end

	local storage = Helpers.playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit)
	local msToFlip = seasonMsUntilFlip(state)
	local ownedFactories = ownedCountByType(state, botPlayerId, "FACTORY")
	local ownedPonds = ownedCountByType(state, botPlayerId, "POND")
	local kind = action.type

	if kind == "pond.harvest.claim" then
		return 160
	elseif kind == "structure.factory.collect" then
		return 150
	elseif kind == "pond.harvest.start" then
		if state.season.logicSeason ~= "WINTER" then
			return 0
		end
		return 128
	elseif kind == "structure.train.sellAnnualShipment" then
		return 112 + math.max(0, 8 - player.money)
	elseif kind == "tile.buy" or kind == "tile.buyFromPlayer" then
		local tile = tileAt(state, action.x :: number, action.y :: number)
		local isBuyout = kind == "tile.buyFromPlayer"
		local cost = if kind == "tile.buy"
			then config.economy.buyUnownedTileCost
			else tile.currentPrice + config.economy.buyoutTransferFee
		return 76
			+ tileStrategicValue(tile)
			+ (if isBuyout then -math.min(25, cost * 2) else 18)
			+ math.max(-24, 10 - cost)
	elseif kind == "tile.buildFactory" then
		return 102 + (if ownedFactories == 0 then 24 else 0)
	elseif kind == "tile.buildManMadePond" then
		return 94
			+ (if ownedPonds < 2 then 18 else 0)
			+ (if state.season.logicSeason == "WINTER" then 8 else 0)
	elseif kind == "structure.factory.craftRefrigerator" then
		return 88 + storage.unrefrigeratedIce * 7 + (if msToFlip < 25000 then 12 else 0)
	elseif kind == "structure.factory.craftBlueIce" then
		return 80
			+ (if player.money < 8 then 8 else 0)
			+ (if state.season.logicSeason == "SUMMER" then 6 else 0)
	elseif kind == "structure.house.sellIce" then
		if state.season.logicSeason ~= "SUMMER" then
			return 0
		end
		return 72
			+ math.min(24, (action.quantity :: number) * 4)
			+ (if msToFlip < 20000 then 10 else 0)
	elseif kind == "structure.house.sellBlueIce" then
		if state.season.logicSeason ~= "SUMMER" then
			return 0
		end
		return 66
			+ math.min(18, (action.quantity :: number) * 5)
			+ (if player.money < 10 then 10 else 0)
	end

	return 0
end

function Bot.enumerateCandidateBotActions(
	state: GameState,
	config: any,
	botPlayerId: string,
	maxActions: number?
): { GameAction }
	local cap = maxActions or 28
	local player = state.players[botPlayerId]
	if not player then
		return {}
	end

	local actions: { GameAction } = {}
	local seen: { [string]: boolean } = {}
	local storage = Helpers.playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit)

	for _, job in state.ponds do
		if job.ownerId == botPlayerId and job.status == "CLAIMABLE" then
			addAction(
				actions,
				seen,
				{ type = "pond.harvest.claim", playerId = botPlayerId, pondJobId = job.id },
				cap
			)
		end
	end

	for _, job in state.factoryJobs do
		if job.ownerId == botPlayerId and job.status == "COMPLETE" then
			addAction(
				actions,
				seen,
				{ type = "structure.factory.collect", playerId = botPlayerId, x = job.x, y = job.y },
				cap
			)
		end
	end

	if state.season.logicSeason == "WINTER" and player.money >= config.economy.pondHarvestCost then
		for _, pond in ownPondsWithoutJobs(state, botPlayerId, 8) do
			addAction(
				actions,
				seen,
				{ type = "pond.harvest.start", playerId = botPlayerId, x = pond.x, y = pond.y },
				cap
			)
		end
	end

	local houses = ownHouses(state, botPlayerId)
	local canSellAtHouse = state.season.logicSeason == "SUMMER"
	for i = 1, math.min(2, #houses) do
		local house = houses[i]
		if canSellAtHouse then
			if storage.unrefrigeratedIce > 0 then
				addAction(actions, seen, {
					type = "structure.house.sellIce",
					playerId = botPlayerId,
					x = house.x,
					y = house.y,
					quantity = storage.unrefrigeratedIce,
				}, cap)
			end
			if player.ice > 0 then
				addAction(actions, seen, {
					type = "structure.house.sellIce",
					playerId = botPlayerId,
					x = house.x,
					y = house.y,
					quantity = 1,
				}, cap)
				if player.ice > 1 then
					addAction(actions, seen, {
						type = "structure.house.sellIce",
						playerId = botPlayerId,
						x = house.x,
						y = house.y,
						quantity = player.ice,
					}, cap)
				end
			end
			if player.blueIce > 0 then
				addAction(actions, seen, {
					type = "structure.house.sellBlueIce",
					playerId = botPlayerId,
					x = house.x,
					y = house.y,
					quantity = 1,
				}, cap)
				if player.blueIce > 1 then
					addAction(actions, seen, {
						type = "structure.house.sellBlueIce",
						playerId = botPlayerId,
						x = house.x,
						y = house.y,
						quantity = player.blueIce,
					}, cap)
				end
			end
		end
	end

	local trainTile = ownStructure(state, botPlayerId, "TRAIN")
	if
		trainTile
		and player.ice >= config.economy.trainShipmentIceCost
		and state.trainSales.usedByPlayerId[botPlayerId] ~= state.trainSales.currentYear
	then
		addAction(actions, seen, {
			type = "structure.train.sellAnnualShipment",
			playerId = botPlayerId,
			x = trainTile.x,
			y = trainTile.y,
		}, cap)
	end

	if
		player.money >= config.economy.factoryCraftMoneyCost
		and player.ice >= config.economy.factoryCraftIceCost
	then
		for _, factory in availableFactories(state, botPlayerId, 4) do
			addAction(actions, seen, {
				type = "structure.factory.craftBlueIce",
				playerId = botPlayerId,
				x = factory.x,
				y = factory.y,
			}, cap)
			addAction(actions, seen, {
				type = "structure.factory.craftRefrigerator",
				playerId = botPlayerId,
				x = factory.x,
				y = factory.y,
			}, cap)
		end
	end

	local ownedFactories = ownedCountByType(state, botPlayerId, "FACTORY")
	local ownedPonds = ownedCountByType(state, botPlayerId, "POND")

	for _, tile in ownBuildableTiles(state, botPlayerId, 10) do
		if
			ownedFactories == 0
			and player.money >= config.economy.buildFactoryMoneyCost
			and player.ice >= config.economy.buildFactoryIceCost
		then
			addAction(
				actions,
				seen,
				{ type = "tile.buildFactory", playerId = botPlayerId, x = tile.x, y = tile.y },
				cap
			)
		end
		if
			player.money >= config.economy.buildManMadePondMoneyCost
			and player.ice >= config.economy.buildManMadePondIceCost
		then
			addAction(
				actions,
				seen,
				{ type = "tile.buildManMadePond", playerId = botPlayerId, x = tile.x, y = tile.y },
				cap
			)
		end
		if
			ownedPonds >= 2
			and player.money >= config.economy.buildFactoryMoneyCost
			and player.ice >= config.economy.buildFactoryIceCost
		then
			addAction(
				actions,
				seen,
				{ type = "tile.buildFactory", playerId = botPlayerId, x = tile.x, y = tile.y },
				cap
			)
		end
	end

	for _, target in collectExpansionTargets(state, botPlayerId, true, 18) do
		if not target.buyout then
			if player.money >= config.economy.buyUnownedTileCost then
				addAction(
					actions,
					seen,
					{ type = "tile.buy", playerId = botPlayerId, x = target.x, y = target.y },
					cap
				)
			end
			continue
		end
		local tile = tileAt(state, target.x, target.y)
		local buyoutCost = tile.currentPrice + config.economy.buyoutTransferFee
		if player.money >= buyoutCost then
			addAction(
				actions,
				seen,
				{ type = "tile.buyFromPlayer", playerId = botPlayerId, x = target.x, y = target.y },
				cap
			)
		end
	end

	local scored = {}
	for index, action in actions do
		table.insert(scored, {
			action = action,
			index = index,
			score = scoreBotAction(state, config, botPlayerId, action),
		})
	end
	table.sort(scored, function(a, b)
		if a.score ~= b.score then
			return a.score > b.score
		end
		return a.index < b.index
	end)

	local result: { GameAction } = {}
	for i = 1, math.min(cap, #scored) do
		table.insert(result, scored[i].action)
	end
	return result
end

function Bot.chooseHeuristicBotAction(
	state: GameState,
	config: any,
	botPlayerId: string
): GameAction?
	local ranked = Bot.enumerateCandidateBotActions(state, config, botPlayerId, 1)
	return ranked[1]
end

function Bot.tickBots(state: GameState, config: any, dispatchAction: (GameAction) -> ActionResult)
	if state.match.ended then
		return
	end

	-- Iterate bots in playerOrder (matches the original's insertion order).
	for _, playerId in state.playerOrder do
		local bot = state.bots[playerId]
		if not bot then
			continue
		end
		local player = state.players[bot.playerId]
		if not player or not player.connected then
			continue
		end

		if bot.pendingAction and state.nowMs >= bot.pendingAction.executeAtMs then
			local result = dispatchAction(bot.pendingAction.action)
			bot.pendingAction = nil
			if result.ok then
				bot.nextDecisionAtMs = state.nowMs
					+ deterministicActionCooldownMs(state.nowMs, bot.playerId)
			else
				bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs
			end
		end

		if bot.pendingAction then
			continue
		end
		if state.nowMs < bot.nextDecisionAtMs then
			continue
		end

		local action = Bot.chooseHeuristicBotAction(state, config, bot.playerId)
		if not action then
			bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs
			continue
		end

		local jitter =
			deterministicJitterMs(state.nowMs, bot.playerId, config.timing.botActionJitterMs)
		bot.pendingAction = {
			id = "bot_action_" .. bot.playerId .. "_" .. state.nowMs,
			executeAtMs = state.nowMs + config.timing.botReactionDelayMs + jitter,
			action = action,
		}
		bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs
	end
end

return Bot
