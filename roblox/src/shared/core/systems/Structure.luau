--!strict
-- Structures: build factory/pond, house sales, factory crafting, train shipment.
-- Ported from packages/game-core/src/systems/structureSystem.ts.

local Helpers = require(script.Parent.Parent.Helpers)
local Economy = require(script.Parent.Economy)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState
type ActionResult = Types.ActionResult
type CraftKind = Types.CraftKind

local Structure = {}

-- Preserves the original's (typo'd) user-facing message verbatim.
local SUMMER_HOUSE_SALE_MESSAGE = "you have to waint until summer to sell the ice"

local function assertPlayer(state: GameState, playerId: string): ActionResult?
	if not state.players[playerId] then
		return { ok = false, code = "INVALID_PLAYER", message = "Player does not exist." }
	end
	if state.match.ended then
		return { ok = false, code = "MATCH_ENDED", message = "Match has already ended." }
	end
	return nil
end

local function assertHouseSaleSeason(state: GameState): ActionResult?
	if state.season.logicSeason ~= "SUMMER" then
		return { ok = false, code = "WRONG_SEASON", message = SUMMER_HOUSE_SALE_MESSAGE }
	end
	return nil
end

local function assertOwnedTileType(
	state: GameState,
	playerId: string,
	x: number,
	y: number,
	expected: string
): ActionResult?
	if not Helpers.inBounds(state, x, y) then
		return { ok = false, code = "INVALID_TILE", message = "Tile is out of bounds." }
	end
	local tile = Helpers.getTile(state, x, y)
	if not Helpers.isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId) then
		return { ok = false, code = "NOT_OWNER", message = "Player must own this tile." }
	end
	if tile.type ~= expected then
		return { ok = false, code = "INVALID_ACTION", message = "Tile is not " .. expected .. "." }
	end
	return nil
end

function Structure.buildFactory(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	if not Helpers.inBounds(state, x, y) then
		return { ok = false, code = "INVALID_TILE", message = "Tile is out of bounds." }
	end
	local tile = Helpers.getTile(state, x, y)
	local player = assert(state.players[playerId], "player missing")
	if not Economy.canBuildOnTile(state, tile, playerId) then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Factory can only be built on owned empty grass/forest tiles.",
		}
	end
	if player.money < config.economy.buildFactoryMoneyCost then
		return {
			ok = false,
			code = "INSUFFICIENT_FUNDS",
			message = "Not enough money to build a factory.",
		}
	end
	if player.ice < config.economy.buildFactoryIceCost then
		return {
			ok = false,
			code = "INSUFFICIENT_ICE",
			message = "Not enough ice to build a factory.",
		}
	end

	player.money -= config.economy.buildFactoryMoneyCost
	player.ice -= config.economy.buildFactoryIceCost
	tile.type = "FACTORY"
	tile.source = "PLAYER_BUILT"

	Helpers.addLog(state, "tile.factoryBuilt", { playerId = playerId, x = x, y = y })
	return {
		ok = true,
		code = "OK",
		message = "Factory built.",
		payload = { x = x, y = y, type = "FACTORY" },
	}
end

function Structure.buildManMadePond(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	if not Helpers.inBounds(state, x, y) then
		return { ok = false, code = "INVALID_TILE", message = "Tile is out of bounds." }
	end
	local tile = Helpers.getTile(state, x, y)
	local player = assert(state.players[playerId], "player missing")
	if not Economy.canBuildOnTile(state, tile, playerId) then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Man-made pond can only be built on owned empty grass/forest tiles.",
		}
	end
	if player.money < config.economy.buildManMadePondMoneyCost then
		return {
			ok = false,
			code = "INSUFFICIENT_FUNDS",
			message = "Not enough money to build a man-made pond.",
		}
	end
	if player.ice < config.economy.buildManMadePondIceCost then
		return {
			ok = false,
			code = "INSUFFICIENT_ICE",
			message = "Not enough ice to build a man-made pond.",
		}
	end

	player.money -= config.economy.buildManMadePondMoneyCost
	player.ice -= config.economy.buildManMadePondIceCost
	tile.type = "POND"
	tile.source = "PLAYER_BUILT"

	Helpers.addLog(state, "tile.manMadePondBuilt", { playerId = playerId, x = x, y = y })
	return {
		ok = true,
		code = "OK",
		message = "Man-made pond built.",
		payload = { x = x, y = y, type = "POND" },
	}
end

function Structure.sellIceAtHouse(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number,
	quantity: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	local ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, "HOUSE")
	if ownedTypeCheck then
		return ownedTypeCheck
	end
	local seasonCheck = assertHouseSaleSeason(state)
	if seasonCheck then
		return seasonCheck
	end

	local player = assert(state.players[playerId], "player missing")
	if quantity <= 0 or math.floor(quantity) ~= quantity then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Quantity must be a positive integer.",
		}
	end
	if player.ice < quantity then
		return { ok = false, code = "INSUFFICIENT_ICE", message = "Not enough regular ice to sell." }
	end

	player.ice -= quantity
	local moneyGained = quantity * config.economy.houseSellIcePrice
	player.money += moneyGained

	Helpers.addLog(
		state,
		"house.sellIce",
		{ playerId = playerId, quantity = quantity, moneyGained = moneyGained, x = x, y = y }
	)
	return {
		ok = true,
		code = "OK",
		message = "Regular ice sold at house.",
		payload = { quantity = quantity, moneyGained = moneyGained },
	}
end

function Structure.sellBlueIceAtHouse(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number,
	quantity: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	local ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, "HOUSE")
	if ownedTypeCheck then
		return ownedTypeCheck
	end
	local seasonCheck = assertHouseSaleSeason(state)
	if seasonCheck then
		return seasonCheck
	end

	local player = assert(state.players[playerId], "player missing")
	if quantity <= 0 or math.floor(quantity) ~= quantity then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Quantity must be a positive integer.",
		}
	end
	if player.blueIce < quantity then
		return { ok = false, code = "INSUFFICIENT_ICE", message = "Not enough blue ice to sell." }
	end

	player.blueIce -= quantity
	local moneyGained = quantity * config.economy.houseSellBlueIcePrice
	player.money += moneyGained

	Helpers.addLog(
		state,
		"house.sellBlueIce",
		{ playerId = playerId, quantity = quantity, moneyGained = moneyGained, x = x, y = y }
	)
	return {
		ok = true,
		code = "OK",
		message = "Blue ice sold at house.",
		payload = { quantity = quantity, moneyGained = moneyGained },
	}
end

-- A factory is busy while a job is crafting (ACTIVE) or finished but not yet
-- collected (COMPLETE) — the player must collect before starting another craft.
local function busyFactoryAt(state: GameState, x: number, y: number): boolean
	for _, job in state.factoryJobs do
		if job.x == x and job.y == y and (job.status == "ACTIVE" or job.status == "COMPLETE") then
			return true
		end
	end
	return false
end

function Structure.startFactoryCraft(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number,
	kind: CraftKind
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	local ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, "FACTORY")
	if ownedTypeCheck then
		return ownedTypeCheck
	end
	if busyFactoryAt(state, x, y) then
		return {
			ok = false,
			code = "ALREADY_ACTIVE",
			message = "This factory is busy — collect its output first.",
		}
	end

	local player = assert(state.players[playerId], "player missing")
	if player.money < config.economy.factoryCraftMoneyCost then
		return { ok = false, code = "INSUFFICIENT_FUNDS", message = "Not enough money to craft." }
	end
	if player.ice < config.economy.factoryCraftIceCost then
		return { ok = false, code = "INSUFFICIENT_ICE", message = "Not enough ice to craft." }
	end

	player.money -= config.economy.factoryCraftMoneyCost
	player.ice -= config.economy.factoryCraftIceCost

	local job = {
		id = Helpers.createId("factory", state.nowMs, x * 1000 + y),
		ownerId = playerId,
		x = x,
		y = y,
		kind = kind,
		status = "ACTIVE",
		startedAtMs = state.nowMs,
		completesAtMs = state.nowMs + config.timing.factoryCraftDurationMs,
		collectedAtMs = nil,
	}
	table.insert(state.factoryJobs, job)

	Helpers.addLog(state, "factory.craftStarted", {
		playerId = playerId,
		x = x,
		y = y,
		kind = kind,
		factoryJobId = job.id,
		completesAtMs = job.completesAtMs,
	})

	return {
		ok = true,
		code = "OK",
		message = (if kind == "REFRIGERATOR" then "Refrigerator" else "Blue ice")
			.. " craft started.",
		payload = { factoryJobId = job.id, completesAtMs = job.completesAtMs, kind = kind },
	}
end

function Structure.updateFactoryJobs(state: GameState)
	for _, job in state.factoryJobs do
		if job.status ~= "ACTIVE" or state.nowMs < job.completesAtMs then
			continue
		end
		local player = state.players[job.ownerId]
		if not player then
			continue
		end
		-- Mark ready-to-collect; the output is granted only when the player collects it.
		job.status = "COMPLETE"
		Helpers.addLog(state, "factory.craftComplete", {
			playerId = player.id,
			factoryJobId = job.id,
			kind = job.kind,
		})
	end
end

function Structure.collectFactoryCraft(
	state: GameState,
	_config: any,
	playerId: string,
	x: number,
	y: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	local ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, "FACTORY")
	if ownedTypeCheck then
		return ownedTypeCheck
	end

	local job = nil
	for _, entry in state.factoryJobs do
		if entry.x == x and entry.y == y and entry.status == "COMPLETE" then
			job = entry
			break
		end
	end
	if not job then
		return {
			ok = false,
			code = "NOT_CLAIMABLE",
			message = "Nothing to collect at this factory.",
		}
	end

	local player = assert(state.players[playerId], "player missing")
	job.status = "COLLECTED"
	job.collectedAtMs = state.nowMs
	local producedBlueIce = job.kind == "BLUE_ICE"
	if producedBlueIce then
		player.blueIce += 1
	else
		player.refrigerators += 1
	end

	Helpers.addLog(state, "factory.craftCollected", {
		playerId = playerId,
		factoryJobId = job.id,
		kind = job.kind,
	})

	return {
		ok = true,
		code = "OK",
		message = (if producedBlueIce then "Blue ice" else "Refrigerator") .. " collected.",
		payload = { kind = job.kind },
	}
end

function Structure.sellAnnualTrainShipment(
	state: GameState,
	config: any,
	playerId: string,
	x: number,
	y: number
): ActionResult
	local precheck = assertPlayer(state, playerId)
	if precheck then
		return precheck
	end
	local ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, "TRAIN")
	if ownedTypeCheck then
		return ownedTypeCheck
	end

	local player = assert(state.players[playerId], "player missing")
	if player.ice < config.economy.trainShipmentIceCost then
		return {
			ok = false,
			code = "INSUFFICIENT_ICE",
			message = "Need 3 regular ice for train shipment.",
		}
	end

	local year = state.trainSales.currentYear
	if state.trainSales.usedByPlayerId[playerId] == year then
		return {
			ok = false,
			code = "LIMIT_REACHED",
			message = "Annual train shipment already used this year.",
		}
	end

	player.ice -= config.economy.trainShipmentIceCost
	player.money += config.economy.trainShipmentMoneyGain
	state.trainSales.usedByPlayerId[playerId] = year

	Helpers.addLog(state, "train.shipmentSold", {
		playerId = playerId,
		year = year,
		iceSpent = config.economy.trainShipmentIceCost,
		moneyGained = config.economy.trainShipmentMoneyGain,
	})

	return {
		ok = true,
		code = "OK",
		message = "Annual train shipment sold.",
		payload = {
			year = year,
			iceSpent = config.economy.trainShipmentIceCost,
			moneyGained = config.economy.trainShipmentMoneyGain,
		},
	}
end

return Structure
