--!strict
-- Builds the initial GameState. Ported from packages/game-core/src/stateInit.ts.

local MapGenerator = require(script.Parent.MapGenerator)
local Types = require(script.Parent.Types)

type GameState = Types.GameState
type PlayerState = Types.PlayerState

local StateInit = {}

export type InitialPlayerInput = {
	id: string,
	name: string,
	color: Types.PlayerColor,
	controller: Types.PlayerController,
}

export type CreateInitialStateOptions = {
	seed: string,
	config: any,
	players: { InitialPlayerInput },
	nowMs: number?,
	teamByPlayerId: { [string]: string }?,
}

local function createPlayerState(input: InitialPlayerInput, config: any): PlayerState
	return {
		id = input.id,
		name = input.name,
		color = input.color,
		controller = input.controller,
		money = config.startingMoney,
		ice = config.startingIce,
		blueIce = config.startingBlueIce,
		refrigerators = config.startingRefrigerators,
		connected = true,
		ready = true,
	}
end

local function createBotState(playerId: string)
	return {
		playerId = playerId,
		profile = "TESTER_V1",
		nextDecisionAtMs = 0,
		pendingAction = nil,
	}
end

local function createCamera(mapWidth: number, mapHeight: number, viewportTiles: number)
	return {
		x = math.floor((mapWidth - viewportTiles) / 2),
		y = math.floor((mapHeight - viewportTiles) / 2),
		viewportTiles = viewportTiles,
	}
end

function StateInit.createInitialState(options: CreateInitialStateOptions): GameState
	local nowMs = options.nowMs or 0
	local config = options.config
	local playerInputs = options.players

	local generated = MapGenerator.generateMap(options.seed, config)

	local players = {}
	local bots = {}
	local cameraByPlayer = {}
	local selectedTileByPlayer = {}
	local usedByPlayerId = {}
	local summerSkipVotesByPlayerId = {}
	local playerOrder = {}
	local defaultTeams = {}

	for _, input in playerInputs do
		players[input.id] = createPlayerState(input, config)
		if input.controller == "BOT" then
			bots[input.id] = createBotState(input.id)
		end
		cameraByPlayer[input.id] =
			createCamera(generated.width, generated.height, config.map.viewportTiles)
		selectedTileByPlayer[input.id] = nil
		usedByPlayerId[input.id] = nil
		summerSkipVotesByPlayerId[input.id] = false
		table.insert(playerOrder, input.id)
		defaultTeams[input.id] = input.id
	end

	local teamByPlayerId = options.teamByPlayerId or defaultTeams
	local startingSeason = config.startingSeason

	return {
		seed = options.seed,
		nowMs = nowMs,
		width = generated.width,
		height = generated.height,
		tiles = generated.tiles,
		teamByPlayerId = teamByPlayerId,
		players = players,
		playerOrder = playerOrder,
		summerSkipVotesByPlayerId = summerSkipVotesByPlayerId,
		bots = bots,
		season = {
			logicSeason = startingSeason,
			cycleStartMs = nowMs,
			cycleDurationMs = config.timing.seasonDurationMs,
			transitionDurationMs = config.timing.transitionDurationMs,
			transitionProgress = 0,
			transitionKeyframeIndex = 0,
			visualFromSeason = startingSeason,
			visualToSeason = if startingSeason == "SUMMER" then "WINTER" else "SUMMER",
			seasonFlipCount = 0,
		},
		ponds = {},
		factoryJobs = {},
		trainSales = {
			currentYear = 1,
			usedByPlayerId = usedByPlayerId,
		},
		cameraByPlayer = cameraByPlayer,
		reconnect = {
			disconnectedPlayerId = nil,
			pausedAtMs = nil,
			timeoutAtMs = nil,
		},
		selectedTileByPlayer = selectedTileByPlayer,
		actionLog = {},
		match = {
			startedAtMs = nowMs,
			durationMs = config.timing.matchDurationMs,
			paused = false,
			ended = false,
			winnerId = nil,
			overtime = false,
		},
	}
end

return StateInit
