--!strict
-- Tunable game configuration. Ported from packages/config/src/index.ts.

local Types = require(script.Parent.Types)

export type EconomyConfig = {
	buyUnownedTileCost: number,
	buyoutTransferFee: number,
	seasonFlipIncome: number,
	pondHarvestCost: number,
	houseSellIcePrice: number,
	houseSellBlueIcePrice: number,
	buildFactoryMoneyCost: number,
	buildFactoryIceCost: number,
	buildManMadePondMoneyCost: number,
	buildManMadePondIceCost: number,
	factoryCraftMoneyCost: number,
	factoryCraftIceCost: number,
	trainShipmentIceCost: number,
	trainShipmentMoneyGain: number,
	refrigeratorStoragePerUnit: number,
}

export type TimingConfig = {
	seasonDurationMs: number,
	transitionDurationMs: number,
	pondHarvestDurationMs: number,
	factoryCraftDurationMs: number,
	matchDurationMs: number,
	reconnectPauseMs: number,
	botDecisionCadenceMs: number,
	botReactionDelayMs: number,
	botActionJitterMs: number,
}

export type MapConfig = {
	width: number,
	height: number,
	viewportTiles: number,
	naturalPondCount: number,
	housesCount: number,
	trainCount: number,
	pondMinDistance: number,
	pondClusterMin: number,
	pondClusterMax: number,
	forestDensity: number,
}

export type WinConfig = {
	overtimeEnabled: boolean,
	overtimeDurationMs: number,
	refrigeratorNetWorthValue: number,
	regularIceNetWorthValue: number,
	blueIceNetWorthValue: number,
}

export type GameConfig = {
	startingSeason: Types.Season,
	startingMoney: number,
	startingIce: number,
	startingBlueIce: number,
	startingRefrigerators: number,
	economy: EconomyConfig,
	timing: TimingConfig,
	map: MapConfig,
	win: WinConfig,
}

export type GameMode = "PROD" | "DEV_FAST"

local Config = {}

Config.DEFAULT_GAME_CONFIG = {
	startingSeason = "WINTER",
	startingMoney = 20,
	startingIce = 0,
	startingBlueIce = 0,
	startingRefrigerators = 1,
	economy = {
		buyUnownedTileCost = 1,
		buyoutTransferFee = 1,
		seasonFlipIncome = 2,
		pondHarvestCost = 1,
		houseSellIcePrice = 2,
		houseSellBlueIcePrice = 8,
		buildFactoryMoneyCost = 2,
		buildFactoryIceCost = 2,
		buildManMadePondMoneyCost = 2,
		buildManMadePondIceCost = 1,
		factoryCraftMoneyCost = 2,
		factoryCraftIceCost = 2,
		trainShipmentIceCost = 3,
		trainShipmentMoneyGain = 9,
		refrigeratorStoragePerUnit = 2,
	},
	timing = {
		seasonDurationMs = 5 * 60 * 1000,
		transitionDurationMs = 60 * 1000,
		pondHarvestDurationMs = 60 * 1000,
		factoryCraftDurationMs = 2 * 60 * 1000,
		matchDurationMs = 30 * 60 * 1000,
		reconnectPauseMs = 90 * 1000,
		botDecisionCadenceMs = 2500,
		botReactionDelayMs = 750,
		botActionJitterMs = 900,
	},
	map = {
		width = 10,
		height = 10,
		viewportTiles = 5,
		naturalPondCount = 3,
		housesCount = 4,
		trainCount = 1,
		pondMinDistance = 3,
		pondClusterMin = 1,
		pondClusterMax = 2,
		forestDensity = 0.12,
	},
	win = {
		overtimeEnabled = true,
		overtimeDurationMs = 2 * 60 * 1000,
		refrigeratorNetWorthValue = 2,
		regularIceNetWorthValue = 2,
		blueIceNetWorthValue = 8,
	},
} :: GameConfig

local function deepCopy(value: any): any
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for key, child in pairs(value) do
		out[key] = deepCopy(child)
	end
	return out
end

Config.deepCopy = deepCopy

function Config.createGameConfig(overrides: { [string]: any }?, mode: GameMode?): GameConfig
	local merged: any = deepCopy(Config.DEFAULT_GAME_CONFIG)
	local resolvedMode = mode or "PROD"

	if overrides then
		for key, value in pairs(overrides) do
			if key == "economy" or key == "timing" or key == "map" or key == "win" then
				if type(value) == "table" then
					for subKey, subValue in pairs(value) do
						merged[key][subKey] = subValue
					end
				end
			else
				merged[key] = value
			end
		end
	end

	if resolvedMode == "DEV_FAST" then
		merged.timing.seasonDurationMs = 75 * 1000
		merged.timing.transitionDurationMs = 15 * 1000
		merged.timing.factoryCraftDurationMs = 20 * 1000
		merged.timing.matchDurationMs = 8 * 60 * 1000
		merged.timing.botDecisionCadenceMs = 1200
		merged.timing.botReactionDelayMs = 250
		merged.timing.botActionJitterMs = 350
	end

	return merged :: GameConfig
end

return Config
