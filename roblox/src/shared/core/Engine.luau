--!strict
-- The game engine: constructor, tick loop, and the single applyAction
-- validate+dispatch path shared by players and bots.
-- Ported from packages/game-core/src/engine.ts.

local Config = require(script.Parent.Config)
local StateInit = require(script.Parent.StateInit)
local Helpers = require(script.Parent.Helpers)
local validate = require(script.Parent.validate)

local Economy = require(script.Parent.systems.Economy)
local Pond = require(script.Parent.systems.Pond)
local Structure = require(script.Parent.systems.Structure)
local SeasonSystem = require(script.Parent.systems.Season)
local WinCondition = require(script.Parent.systems.WinCondition)
local Bot = require(script.Parent.systems.Bot)
local Types = require(script.Parent.Types)

type GameState = Types.GameState
type GameAction = Types.GameAction
type ActionResult = Types.ActionResult
type NetWorthBreakdown = Types.NetWorthBreakdown

local Engine = {}
Engine.__index = Engine

export type BotControlMode = "INTERNAL_HEURISTIC" | "EXTERNAL"

export type EngineOptions = {
	config: { [string]: any }?,
	configMode: Config.GameMode?,
	botControlMode: BotControlMode?,
	seed: string,
	players: { StateInit.InitialPlayerInput },
	teamByPlayerId: { [string]: string }?,
}

export type GameEngine = typeof(setmetatable(
	{} :: {
		config: Config.GameConfig,
		state: GameState,
		botControlMode: BotControlMode,
		nextBotExternalActionAt: { [string]: number },
	},
	Engine
))

function Engine.new(options: EngineOptions): GameEngine
	local config = Config.createGameConfig(options.config or {}, options.configMode or "PROD")
	local botControlMode = options.botControlMode or "INTERNAL_HEURISTIC"

	local state = StateInit.createInitialState({
		config = config,
		players = options.players,
		seed = options.seed,
		nowMs = 0,
		teamByPlayerId = options.teamByPlayerId,
	})

	local nextBotExternalActionAt = {}
	for playerId in state.bots do
		nextBotExternalActionAt[playerId] = 0
	end

	return setmetatable({
		config = config,
		state = state,
		botControlMode = botControlMode,
		nextBotExternalActionAt = nextBotExternalActionAt,
	}, Engine)
end

function Engine.createPlayVsComputer(
	seed: string?,
	humanName: string?,
	configMode: Config.GameMode?,
	botControlMode: BotControlMode?
): GameEngine
	return Engine.new({
		botControlMode = botControlMode or "INTERNAL_HEURISTIC",
		configMode = configMode or "PROD",
		seed = seed or "ice-king-default-seed",
		players = {
			{ id = "P1", name = humanName or "Player", color = "BLUE", controller = "HUMAN" },
			{ id = "P2", name = "Ice Bot", color = "RED", controller = "BOT" },
		},
	})
end

function Engine.createPlayVsPlayer(
	seed: string?,
	firstName: string?,
	secondName: string?,
	configMode: Config.GameMode?
): GameEngine
	return Engine.new({
		configMode = configMode or "PROD",
		seed = seed or "ice-king-default-seed",
		players = {
			{ id = "P1", name = firstName or "Player 1", color = "BLUE", controller = "HUMAN" },
			{ id = "P2", name = secondName or "Player 2", color = "RED", controller = "HUMAN" },
		},
	})
end

function Engine.getState(self: GameEngine): GameState
	return self.state
end

function Engine.replaceState(self: GameEngine, nextState: GameState)
	self.state = nextState
end

function Engine.getNetWorth(self: GameEngine): { NetWorthBreakdown }
	local breakdown = Economy.computeNetWorth(self.state, self.config)
	table.sort(breakdown, function(a, b)
		return a.value > b.value
	end)
	return breakdown
end

function Engine.getPlayerStorage(self: GameEngine, playerId: string)
	local player = self.state.players[playerId]
	if not player then
		return { refrigeratedCapacity = 0, refrigeratedIce = 0, unrefrigeratedIce = 0 }
	end
	return Helpers.playerStorageSplit(player, self.config.economy.refrigeratorStoragePerUnit)
end

local function resetSummerSkipVotes(self: GameEngine)
	for _, playerId in self.state.playerOrder do
		self.state.summerSkipVotesByPlayerId[playerId] = false
	end
end

local function applySeasonFlipEffects(self: GameEngine, flip: SeasonSystem.SeasonFlip)
	resetSummerSkipVotes(self)

	local seasonFlipIncome = self.config.economy.seasonFlipIncome
	if seasonFlipIncome ~= 0 then
		for _, player in self.state.players do
			player.money += seasonFlipIncome
		end
	end

	if flip.from == "WINTER" and flip.to == "SUMMER" then
		Economy.applyWinterToSummerMelt(self.state, self.config)
		Pond.expireHarvestsAtSummer(self.state)
	end
end

function Engine.suggestHeuristicBotAction(self: GameEngine, botPlayerId: string): GameAction?
	return Bot.chooseHeuristicBotAction(self.state, self.config, botPlayerId)
end

function Engine.listBotCandidateActions(
	self: GameEngine,
	botPlayerId: string,
	maxActions: number?
): { GameAction }
	return Bot.enumerateCandidateBotActions(self.state, self.config, botPlayerId, maxActions or 28)
end

function Engine.applyExternalBotAction(self: GameEngine, actionInput: any): ActionResult
	if self.botControlMode ~= "EXTERNAL" then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "External bot actions are disabled for this engine instance.",
		}
	end
	return Engine.applyAction(self, actionInput, "BOT")
end

function Engine.tick(self: GameEngine, deltaMs: number)
	if deltaMs <= 0 then
		return
	end

	self.state.nowMs += deltaMs

	if not self.state.match.paused and not self.state.match.ended then
		local seasonUpdate = SeasonSystem.updateSeasonClock(self.state, self.state.nowMs)
		for _, flip in seasonUpdate.flips do
			applySeasonFlipEffects(self, flip)
		end

		Pond.updatePondHarvestJobs(self.state)
		Structure.updateFactoryJobs(self.state)
		WinCondition.syncTrainYear(self.state)

		if self.botControlMode == "INTERNAL_HEURISTIC" then
			Bot.tickBots(self.state, self.config, function(action)
				return Engine.applyAction(self, action, "BOT")
			end)
		end

		WinCondition.evaluateTimeWin(self.state, self.config)
	end
end

function Engine.applyAction(self: GameEngine, actionInput: any, source: string?): ActionResult
	local src = source or "PLAYER"
	local state = self.state
	local config = self.config

	local parse = validate.validateGameAction(actionInput)
	if not parse.success or not parse.data then
		Helpers.addLog(
			state,
			"action.rejected",
			{ source = src, reason = "SCHEMA_VALIDATION_FAILED" }
		)
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Action payload failed schema validation.",
		}
	end

	local action = parse.data

	if src == "BOT" then
		local actor = state.players[action.playerId]
		if not actor or actor.controller ~= "BOT" then
			Helpers.addLog(state, "action.rejected", {
				source = src,
				reason = "BOT_ACTOR_INVALID",
				actionType = action.type,
				playerId = action.playerId,
			})
			return {
				ok = false,
				code = "INVALID_PLAYER",
				message = "Bot action must be issued by a BOT player.",
			}
		end

		if self.botControlMode == "EXTERNAL" then
			local nextAllowedAt = self.nextBotExternalActionAt[action.playerId] or 0
			if state.nowMs < nextAllowedAt then
				Helpers.addLog(state, "action.rejected", {
					source = src,
					reason = "BOT_CADENCE_THROTTLED",
					actionType = action.type,
					playerId = action.playerId,
					nextAllowedAt = nextAllowedAt,
				})
				return {
					ok = false,
					code = "LIMIT_REACHED",
					message = "Bot decision cadence throttled. Try again later.",
				}
			end
			self.nextBotExternalActionAt[action.playerId] = state.nowMs
				+ config.timing.botDecisionCadenceMs
		end
	end

	local result: ActionResult
	local kind = action.type

	if kind == "tile.buy" then
		result = Economy.buyUnownedTile(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "tile.buyFromPlayer" then
		result = Economy.buyOwnedTile(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "tile.buildFactory" then
		result = Structure.buildFactory(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "tile.buildManMadePond" then
		result = Structure.buildManMadePond(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "pond.harvest.start" then
		result = Pond.startPondHarvest(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "pond.harvest.claim" then
		result = Pond.claimPondHarvest(state, config, action.playerId, action.pondJobId :: string)
	elseif kind == "season.skipSummerVote" then
		result = Engine._handleSkipSummerVote(self, action)
	elseif kind == "structure.house.sellIce" then
		result = Structure.sellIceAtHouse(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number,
			action.quantity :: number
		)
	elseif kind == "structure.house.sellBlueIce" then
		result = Structure.sellBlueIceAtHouse(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number,
			action.quantity :: number
		)
	elseif kind == "structure.factory.craftRefrigerator" then
		result = Structure.startFactoryCraft(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number,
			"REFRIGERATOR"
		)
	elseif kind == "structure.factory.craftBlueIce" then
		result = Structure.startFactoryCraft(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number,
			"BLUE_ICE"
		)
	elseif kind == "structure.factory.collect" then
		result = Structure.collectFactoryCraft(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "structure.train.sellAnnualShipment" then
		result = Structure.sellAnnualTrainShipment(
			state,
			config,
			action.playerId,
			action.x :: number,
			action.y :: number
		)
	elseif kind == "camera.move" then
		result = Engine._handleCameraMove(self, action)
	elseif kind == "tile.select" then
		result = Engine._handleTileSelect(self, action)
	elseif kind == "player.forfeit" then
		WinCondition.forfeitMatch(state, action.playerId)
		result = {
			ok = true,
			code = "OK",
			message = "Player forfeited.",
			payload = { winnerId = state.match.winnerId },
		}
	else
		result = { ok = false, code = "INVALID_ACTION", message = "Unsupported action." }
	end

	if result.ok then
		Helpers.addLog(
			state,
			"action.accepted",
			{ source = src, actionType = action.type, playerId = action.playerId }
		)
	else
		Helpers.addLog(state, "action.rejected", {
			source = src,
			actionType = action.type,
			playerId = action.playerId,
			code = result.code,
			message = result.message,
		})
	end

	return result
end

function Engine._handleSkipSummerVote(self: GameEngine, action: GameAction): ActionResult
	local state = self.state
	local player = state.players[action.playerId]
	if not player then
		return { ok = false, code = "INVALID_PLAYER", message = "Unknown player." }
	end
	if player.controller ~= "HUMAN" then
		return {
			ok = false,
			code = "INVALID_ACTION",
			message = "Only human players can vote to skip summer.",
		}
	end
	if state.season.logicSeason ~= "SUMMER" then
		return {
			ok = false,
			code = "WRONG_SEASON",
			message = "Summer can only be skipped during summer.",
		}
	end

	state.summerSkipVotesByPlayerId[action.playerId] = true
	-- Only humans vote; bots never do, so they must not block a solo skip.
	local allPlayersVoted = true
	for _, playerId in state.playerOrder do
		local voter = state.players[playerId]
		if
			voter
			and voter.controller == "HUMAN"
			and state.summerSkipVotesByPlayerId[playerId] ~= true
		then
			allPlayersVoted = false
			break
		end
	end

	if allPlayersVoted then
		local forcedFlip = SeasonSystem.forceSeasonFlip(state, "WINTER")
		if forcedFlip then
			applySeasonFlipEffects(self, forcedFlip)
		end
	end

	return {
		ok = true,
		code = "OK",
		message = if allPlayersVoted
			then "All players voted. Summer skipped to winter."
			else "Summer skip vote recorded.",
		payload = { allPlayersVoted = allPlayersVoted },
	}
end

function Engine._handleCameraMove(self: GameEngine, action: GameAction): ActionResult
	local state = self.state
	local camera = state.cameraByPlayer[action.playerId]
	if not camera then
		return { ok = false, code = "INVALID_PLAYER", message = "Unknown camera owner." }
	end
	camera.x = Helpers.clamp(action.x :: number, 0, state.width - camera.viewportTiles)
	camera.y = Helpers.clamp(action.y :: number, 0, state.height - camera.viewportTiles)
	return {
		ok = true,
		code = "OK",
		message = "Camera moved.",
		payload = { x = camera.x, y = camera.y },
	}
end

function Engine._handleTileSelect(self: GameEngine, action: GameAction): ActionResult
	local state = self.state
	local x = action.x :: number
	local y = action.y :: number
	if x < 0 or y < 0 or x >= state.width or y >= state.height then
		return { ok = false, code = "INVALID_TILE", message = "Selected tile is out of bounds." }
	end
	if Helpers.getTile(state, x, y).type == "VOID" then
		return { ok = false, code = "INVALID_ACTION", message = "Border tiles cannot be selected." }
	end
	state.selectedTileByPlayer[action.playerId] = { x = x, y = y }
	return { ok = true, code = "OK", message = "Tile selected.", payload = { x = x, y = y } }
end

return Engine
