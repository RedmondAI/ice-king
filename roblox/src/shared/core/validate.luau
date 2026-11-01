--!strict
-- Runtime action validation, replacing the original's zod GameActionSchema.
-- Returns { success = true, data = action } or { success = false }.

local Types = require(script.Parent.Types)

type GameAction = Types.GameAction

local validate = {}

local VALID_TYPES: { [string]: boolean } = {
	["tile.buy"] = true,
	["tile.buyFromPlayer"] = true,
	["tile.buildFactory"] = true,
	["tile.buildManMadePond"] = true,
	["pond.harvest.start"] = true,
	["pond.harvest.claim"] = true,
	["season.skipSummerVote"] = true,
	["structure.house.sellIce"] = true,
	["structure.house.sellBlueIce"] = true,
	["structure.factory.craftRefrigerator"] = true,
	["structure.factory.craftBlueIce"] = true,
	["structure.factory.collect"] = true,
	["structure.train.sellAnnualShipment"] = true,
	["camera.move"] = true,
	["tile.select"] = true,
	["player.forfeit"] = true,
}

-- Actions carrying non-negative integer (x, y).
local COORD_TYPES: { [string]: boolean } = {
	["tile.buy"] = true,
	["tile.buyFromPlayer"] = true,
	["tile.buildFactory"] = true,
	["tile.buildManMadePond"] = true,
	["pond.harvest.start"] = true,
	["tile.select"] = true,
	["structure.factory.craftRefrigerator"] = true,
	["structure.factory.craftBlueIce"] = true,
	["structure.factory.collect"] = true,
	["structure.train.sellAnnualShipment"] = true,
}

-- Actions carrying (x, y) + positive integer quantity.
local SELL_TYPES: { [string]: boolean } = {
	["structure.house.sellIce"] = true,
	["structure.house.sellBlueIce"] = true,
}

local function isInteger(value: any): boolean
	return type(value) == "number" and value % 1 == 0
end

local function isNonNegInt(value: any): boolean
	return isInteger(value) and value >= 0
end

export type ValidateResult = { success: boolean, data: GameAction? }

function validate.validateGameAction(input: any): ValidateResult
	if type(input) ~= "table" then
		return { success = false }
	end

	local actionType = input.type
	if type(actionType) ~= "string" or not VALID_TYPES[actionType] then
		return { success = false }
	end

	if type(input.playerId) ~= "string" or #input.playerId < 1 then
		return { success = false }
	end

	if COORD_TYPES[actionType] then
		if not isNonNegInt(input.x) or not isNonNegInt(input.y) then
			return { success = false }
		end
	elseif SELL_TYPES[actionType] then
		if not isNonNegInt(input.x) or not isNonNegInt(input.y) then
			return { success = false }
		end
		if not (isInteger(input.quantity) and input.quantity > 0) then
			return { success = false }
		end
	elseif actionType == "pond.harvest.claim" then
		if type(input.pondJobId) ~= "string" or #input.pondJobId < 1 then
			return { success = false }
		end
	elseif actionType == "camera.move" then
		if type(input.x) ~= "number" or type(input.y) ~= "number" then
			return { success = false }
		end
	end
	-- season.skipSummerVote and player.forfeit require only type + playerId.

	return { success = true, data = input }
end

return validate
