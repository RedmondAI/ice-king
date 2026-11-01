--!strict
-- Ownership + economy. Ported from packages/game-core/src/systems/economySystem.ts.

local Helpers = require(script.Parent.Parent.Helpers)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState
type ActionResult = Types.ActionResult
type TileState = Types.TileState
type PlayerState = Types.PlayerState
type NetWorthBreakdown = Types.NetWorthBreakdown

local Economy = {}

local function assertPlayer(state: GameState, playerId: string): ActionResult?
	if not state.players[playerId] then
		return { ok = false, code = "INVALID_PLAYER", message = "Player does not exist." }
	end
	if state.match.ended then
		return { ok = false, code = "MATCH_ENDED", message = "Match has already ended." }
	end
	return nil
end

function Economy.buyUnownedTile(
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

	if tile.type == "VOID" then
		return { ok = false, code = "INVALID_ACTION", message = "Border tiles cannot be purchased." }
	end
	if
		tile.ownerId ~= nil and Helpers.isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)
	then
		return {
			ok = false,
			code = "ALREADY_OWNER",
			message = "Tile is already owned by this player.",
		}
	end
	if tile.ownerId ~= nil then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Tile is already owned. Use tile.buyFromPlayer for a buyout.",
		}
	end
	if player.money < config.economy.buyUnownedTileCost then
		return {
			ok = false,
			code = "INSUFFICIENT_FUNDS",
			message = "Not enough money to buy this tile.",
		}
	end

	player.money -= config.economy.buyUnownedTileCost
	tile.ownerId = playerId
	tile.currentPrice = config.economy.buyUnownedTileCost

	Helpers.addLog(state, "tile.bought", {
		playerId = playerId,
		x = x,
		y = y,
		amountPaid = config.economy.buyUnownedTileCost,
	})

	return {
		ok = true,
		code = "OK",
		message = "Tile purchased.",
		payload = { x = x, y = y, ownerId = playerId, currentPrice = tile.currentPrice },
	}
end

function Economy.buyOwnedTile(
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
	local buyer = assert(state.players[playerId], "player missing")

	if tile.type == "VOID" then
		return { ok = false, code = "INVALID_ACTION", message = "Border tiles cannot be purchased." }
	end
	if tile.ownerId == nil then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Tile is unowned. Use tile.buy to buy unowned tiles.",
		}
	end
	if Helpers.isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId) then
		return {
			ok = false,
			code = "ALREADY_OWNER",
			message = "Tile is already owned by this player.",
		}
	end

	local seller = state.players[tile.ownerId]
	if not seller then
		return { ok = false, code = "INVALID_ACTION", message = "Tile seller is invalid." }
	end

	local purchasePrice = tile.currentPrice + config.economy.buyoutTransferFee
	if buyer.money < purchasePrice then
		return {
			ok = false,
			code = "INSUFFICIENT_FUNDS",
			message = "Need $" .. purchasePrice .. "c to buy out this tile.",
		}
	end

	buyer.money -= purchasePrice
	seller.money += tile.currentPrice
	tile.ownerId = playerId
	tile.currentPrice = purchasePrice

	Helpers.addLog(state, "tile.buyout", {
		buyerId = playerId,
		sellerId = seller.id,
		x = x,
		y = y,
		purchasePrice = purchasePrice,
		sellerReceived = purchasePrice - config.economy.buyoutTransferFee,
		transferFee = config.economy.buyoutTransferFee,
	})

	return {
		ok = true,
		code = "OK",
		message = "Tile bought from other player.",
		payload = {
			x = x,
			y = y,
			ownerId = playerId,
			currentPrice = tile.currentPrice,
			purchasePrice = purchasePrice,
		},
	}
end

function Economy.canBuildOnTile(state: GameState, tile: TileState, playerId: string): boolean
	if not Helpers.isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId) then
		return false
	end
	return tile.type == "GRASS" or tile.type == "FOREST"
end

function Economy.applyWinterToSummerMelt(state: GameState, config: any)
	for _, playerId in state.playerOrder do
		local player = state.players[playerId]
		if not player then
			continue
		end
		local split = Helpers.playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit)
		-- Melt rounds UP: e.g. 5 unrefrigerated ice -> ceil(2.5) = 3 melt.
		local melted = math.ceil(split.unrefrigeratedIce * 0.5)
		if melted > 0 then
			player.ice -= melted
			Helpers.addLog(state, "economy.iceMelted", {
				playerId = playerId,
				unrefrigeratedBefore = split.unrefrigeratedIce,
				melted = melted,
			})
		end
	end
end

function Economy.computeNetWorth(state: GameState, config: any): { NetWorthBreakdown }
	local ownedTileValueByPlayer: { [string]: number } = {}
	local landControlPremium = math.max(1, config.economy.buyUnownedTileCost)

	for _, tile in state.tiles do
		if tile.ownerId and tile.type ~= "VOID" then
			ownedTileValueByPlayer[tile.ownerId] = (ownedTileValueByPlayer[tile.ownerId] or 0)
				+ tile.currentPrice
				+ landControlPremium
		end
	end

	local result: { NetWorthBreakdown } = {}
	for _, playerId in state.playerOrder do
		local player = assert(state.players[playerId], "player missing")
		local iceValue = player.ice * config.win.regularIceNetWorthValue
		local blueIceValue = player.blueIce * config.win.blueIceNetWorthValue
		local refrigeratorValue = player.refrigerators * config.win.refrigeratorNetWorthValue
		local ownedTileValue = ownedTileValueByPlayer[playerId] or 0
		local value = player.money + iceValue + blueIceValue + refrigeratorValue + ownedTileValue
		table.insert(result, {
			playerId = playerId,
			value = value,
			money = player.money,
			iceValue = iceValue,
			blueIceValue = blueIceValue,
			refrigeratorValue = refrigeratorValue,
			ownedTileValue = ownedTileValue,
		})
	end
	return result
end

return Economy
