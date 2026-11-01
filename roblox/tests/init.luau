--!nocheck
-- Behavioral parity suite, ported from packages/game-core/test/gameCore.test.ts.
-- Run with: lune run tests (from the roblox/ directory).

local shim = require("@self/roblox")
local t = require("@self/framework")
local describe, it, expect = t.describe, t.it, t.expect

local Engine = shim.require("core", "Engine")

-- Foundation, map, and engine-smoke suites register their tests on require.
require("@self/smoke")
require("@self/map_check")
require("@self/engine_smoke")

local function createHeadToHeadEngine(overrides)
	local config = {
		startingSeason = "SUMMER",
		timing = {
			seasonDurationMs = 1000,
			transitionDurationMs = 200,
			pondHarvestDurationMs = 600,
			factoryCraftDurationMs = 300,
			matchDurationMs = 100000,
			reconnectPauseMs = 1000,
			botDecisionCadenceMs = 200,
			botReactionDelayMs = 50,
			botActionJitterMs = 1,
		},
	}
	if overrides then
		for key, value in pairs(overrides) do
			config[key] = value
		end
	end
	return Engine.new({
		seed = "test-seed",
		config = config,
		players = {
			{ id = "P1", name = "Blue", color = "BLUE", controller = "HUMAN" },
			{ id = "P2", name = "Red", color = "RED", controller = "HUMAN" },
		},
	})
end

local function firstTileBy(engine, predicate)
	for _, tile in engine:getState().tiles do
		if predicate(tile) then
			return { x = tile.x, y = tile.y }
		end
	end
	error("No matching tile found for test setup")
end

local function tileRefAt(state, x, y)
	return state.tiles[y * state.width + x + 1]
end

local function serializeAction(action)
	local keys = {}
	for key in pairs(action) do
		table.insert(keys, key)
	end
	table.sort(keys)
	local parts = {}
	for _, key in ipairs(keys) do
		table.insert(parts, key .. "=" .. tostring(action[key]))
	end
	return table.concat(parts, "|")
end

describe("tile purchase economics", function()
	it("buy unowned then buyout transfers correct funds and price progression", function()
		local engine = createHeadToHeadEngine()
		local startMoney = engine.config.startingMoney
		local buyCost = engine.config.economy.buyUnownedTileCost
		local buyoutFee = engine.config.economy.buyoutTransferFee
		local target = firstTileBy(engine, function(tile)
			return tile.ownerId == nil and tile.type ~= "VOID"
		end)

		local buyResult =
			engine:applyAction({ type = "tile.buy", playerId = "P1", x = target.x, y = target.y })
		expect(buyResult.ok).toBe(true)

		local afterBuy = engine:getState()
		expect(afterBuy.players.P1.money).toBe(startMoney - buyCost)
		local tileAfterBuy = tileRefAt(afterBuy, target.x, target.y)
		expect(tileAfterBuy.ownerId).toBe("P1")
		expect(tileAfterBuy.currentPrice).toBe(1)

		local buyoutResult = engine:applyAction({
			type = "tile.buyFromPlayer",
			playerId = "P2",
			x = target.x,
			y = target.y,
		})
		expect(buyoutResult.ok).toBe(true)

		local afterBuyout = engine:getState()
		expect(afterBuyout.players.P2.money).toBe(startMoney - (buyCost + buyoutFee))
		expect(afterBuyout.players.P1.money).toBe(startMoney)
		local tileAfterBuyout = tileRefAt(afterBuyout, target.x, target.y)
		expect(tileAfterBuyout.ownerId).toBe("P2")
		expect(tileAfterBuyout.currentPrice).toBe(2)
	end)

	it("net worth increases with territory expansion", function()
		local engine = createHeadToHeadEngine()
		local state = engine:getState()
		state.players.P2.money = 20

		local function netWorthP2()
			for _, entry in engine:getNetWorth() do
				if entry.playerId == "P2" then
					return entry.value
				end
			end
			return 0
		end

		local before = netWorthP2()
		local bought = 0
		for _, tile in state.tiles do
			if tile.ownerId == nil and tile.type ~= "VOID" then
				local result = engine:applyAction({
					type = "tile.buy",
					playerId = "P2",
					x = tile.x,
					y = tile.y,
				})
				expect(result.ok).toBe(true)
				bought += 1
				if bought >= 5 then
					break
				end
			end
		end
		expect(bought).toBe(5)
		expect(netWorthP2()).toBeGreaterThan(before)
	end)

	it("border tiles are non-interactable", function()
		local engine = createHeadToHeadEngine()
		local border = firstTileBy(engine, function(tile)
			return tile.type == "VOID"
		end)
		expect(
			engine:applyAction({ type = "tile.buy", playerId = "P1", x = border.x, y = border.y }).ok
		).toBe(false)
		expect(
			engine:applyAction({ type = "tile.select", playerId = "P1", x = border.x, y = border.y }).ok
		).toBe(false)
	end)
end)

describe("build and structure actions", function()
	it("factory and man-made pond obey ownership and resource gates", function()
		local engine = createHeadToHeadEngine()
		local state = engine:getState()

		local tile = firstTileBy(engine, function(entry)
			return entry.type == "GRASS" and entry.ownerId == nil
		end)
		engine:applyAction({ type = "tile.buy", playerId = "P1", x = tile.x, y = tile.y })

		expect(engine:applyAction({
			type = "tile.buildFactory",
			playerId = "P1",
			x = tile.x,
			y = tile.y,
		}).ok).toBe(false)

		state.players.P1.ice = 10
		state.players.P1.money = 10
		expect(engine:applyAction({
			type = "tile.buildFactory",
			playerId = "P1",
			x = tile.x,
			y = tile.y,
		}).ok).toBe(true)
		expect(tileRefAt(state, tile.x, tile.y).type).toBe("FACTORY")

		expect(engine:applyAction({
			type = "tile.buildManMadePond",
			playerId = "P1",
			x = tile.x,
			y = tile.y,
		}).ok).toBe(false)

		local secondTile = firstTileBy(engine, function(entry)
			return entry.ownerId == nil and (entry.type == "GRASS" or entry.type == "FOREST")
		end)
		engine:applyAction({
			type = "tile.buy",
			playerId = "P1",
			x = secondTile.x,
			y = secondTile.y,
		})
		expect(engine:applyAction({
			type = "tile.buildManMadePond",
			playerId = "P1",
			x = secondTile.x,
			y = secondTile.y,
		}).ok).toBe(true)
		expect(tileRefAt(state, secondTile.x, secondTile.y).type).toBe("POND")
	end)

	it("factory output completes but must be collected manually", function()
		local engine = createHeadToHeadEngine()
		local state = engine:getState()
		local factoryTile = firstTileBy(engine, function(entry)
			return entry.type == "GRASS" or entry.type == "FOREST"
		end)
		local tileRef = tileRefAt(state, factoryTile.x, factoryTile.y)
		tileRef.ownerId = "P1"
		tileRef.type = "FACTORY"
		state.players.P1.ice = 10
		state.players.P1.money = 10

		expect(engine:applyAction({
			type = "structure.factory.craftBlueIce",
			playerId = "P1",
			x = factoryTile.x,
			y = factoryTile.y,
		}).ok).toBe(true)
		engine:tick(299)
		expect(state.players.P1.blueIce).toBe(0)
		engine:tick(1)
		-- Output is ready but NOT auto-banked; it must be collected.
		expect(state.players.P1.blueIce).toBe(0)
		expect(engine:applyAction({
			type = "structure.factory.collect",
			playerId = "P1",
			x = factoryTile.x,
			y = factoryTile.y,
		}).ok).toBe(true)
		expect(state.players.P1.blueIce).toBe(1)
	end)

	it("train shipment limited to once per year and resets after two flips", function()
		local engine = createHeadToHeadEngine()
		local state = engine:getState()
		local trainTile = firstTileBy(engine, function(entry)
			return entry.type == "TRAIN"
		end)
		local tileRef = tileRefAt(state, trainTile.x, trainTile.y)
		tileRef.ownerId = "P1"
		state.players.P1.ice = 10

		expect(engine:applyAction({
			type = "structure.train.sellAnnualShipment",
			playerId = "P1",
			x = trainTile.x,
			y = trainTile.y,
		}).ok).toBe(true)
		expect(engine:applyAction({
			type = "structure.train.sellAnnualShipment",
			playerId = "P1",
			x = trainTile.x,
			y = trainTile.y,
		}).ok).toBe(false)
		engine:tick(2000)
		expect(engine:applyAction({
			type = "structure.train.sellAnnualShipment",
			playerId = "P1",
			x = trainTile.x,
			y = trainTile.y,
		}).ok).toBe(true)
	end)
end)

describe("season and pond systems", function()
	it("season transition progress and keyframe index update correctly", function()
		local engine = createHeadToHeadEngine()
		local season = engine:getState().season

		engine:tick(700)
		expect(season.transitionProgress).toBe(0)
		expect(season.logicSeason).toBe("SUMMER")

		engine:tick(200)
		expect(season.transitionProgress).toBeCloseTo(0.5, 3)
		expect(season.transitionKeyframeIndex).toBe(4)

		engine:tick(100)
		expect(season.logicSeason).toBe("WINTER")
		expect(season.transitionProgress).toBe(0)
	end)

	it("players receive free money on each season flip", function()
		local engine = createHeadToHeadEngine({ economy = { seasonFlipIncome = 2 } })
		local state = engine:getState()
		state.players.P1.money = 0
		state.players.P2.money = 3

		engine:tick(1000)
		expect(state.players.P1.money).toBe(2)
		expect(state.players.P2.money).toBe(5)

		engine:tick(1000)
		expect(state.players.P1.money).toBe(4)
		expect(state.players.P2.money).toBe(7)
	end)

	it("summer skip requires both votes and then flips to winter", function()
		local engine = createHeadToHeadEngine({
			startingSeason = "SUMMER",
			economy = { seasonFlipIncome = 2 },
		})
		local state = engine:getState()
		state.players.P1.money = 1
		state.players.P2.money = 4

		local firstVote = engine:applyAction({ type = "season.skipSummerVote", playerId = "P1" })
		expect(firstVote.ok).toBe(true)
		expect(state.season.logicSeason).toBe("SUMMER")
		expect(state.summerSkipVotesByPlayerId.P1).toBe(true)
		expect(state.summerSkipVotesByPlayerId.P2).toBe(false)

		local secondVote = engine:applyAction({ type = "season.skipSummerVote", playerId = "P2" })
		expect(secondVote.ok).toBe(true)
		expect(state.season.logicSeason).toBe("WINTER")
		expect(state.players.P1.money).toBe(3)
		expect(state.players.P2.money).toBe(6)
		expect(state.summerSkipVotesByPlayerId.P1).toBe(false)
		expect(state.summerSkipVotesByPlayerId.P2).toBe(false)
	end)

	it("pond harvest becomes claimable after harvest duration and can be claimed", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		state.players.P1.money = 5

		expect(engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		}).ok).toBe(true)
		local harvestMs = engine.config.timing.pondHarvestDurationMs
		engine:tick(harvestMs - 1)

		local function jobForP1()
			for _, entry in state.ponds do
				if entry.ownerId == "P1" then
					return entry
				end
			end
			return nil
		end
		expect(jobForP1().status).toBe("ACTIVE")
		engine:tick(1)
		local job = jobForP1()
		expect(job.status).toBe("CLAIMABLE")

		local claimResult =
			engine:applyAction({ type = "pond.harvest.claim", playerId = "P1", pondJobId = job.id })
		expect(claimResult.ok).toBe(true)
		expect(state.players.P1.ice).toBe(1)
	end)

	it("pond harvest can only be started in winter", function()
		local engine = createHeadToHeadEngine({ startingSeason = "SUMMER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		state.players.P1.money = 5

		local startResult = engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		})
		expect(startResult.ok).toBe(false)
		expect(startResult.code).toBe("WRONG_SEASON")
		expect(state.ponds).toHaveLength(0)
	end)

	it("pond harvest and house sale update player stats end-to-end", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		local houseTile = firstTileBy(engine, function(entry)
			return entry.type == "HOUSE"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		tileRefAt(state, houseTile.x, houseTile.y).ownerId = "P1"
		state.players.P1.money = 5
		state.players.P1.ice = 0

		expect(engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		}).ok).toBe(true)
		expect(state.players.P1.money).toBe(4)
		engine:tick(engine.config.timing.pondHarvestDurationMs)

		local claimable = nil
		for _, entry in state.ponds do
			if
				entry.ownerId == "P1"
				and entry.pondX == pondTile.x
				and entry.pondY == pondTile.y
			then
				claimable = entry
			end
		end
		expect(claimable.status).toBe("CLAIMABLE")
		expect(engine:applyAction({
			type = "pond.harvest.claim",
			playerId = "P1",
			pondJobId = claimable.id,
		}).ok).toBe(true)
		expect(state.players.P1.ice).toBe(1)

		state.season.logicSeason = "SUMMER"
		state.season.visualFromSeason = "SUMMER"
		state.season.visualToSeason = "WINTER"

		local sellResult = engine:applyAction({
			type = "structure.house.sellIce",
			playerId = "P1",
			x = houseTile.x,
			y = houseTile.y,
			quantity = 1,
		})
		expect(sellResult.ok).toBe(true)
		expect(state.players.P1.ice).toBe(0)
		expect(state.players.P1.money).toBe(6)
	end)

	it("cannot start a harvest when summer is less than a harvest away", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		state.players.P1.money = 5
		-- Season is 1000ms and a harvest is 600ms; at t=500 only 500ms of winter remain.
		engine:tick(500)
		local result = engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		})
		expect(result.ok).toBe(false)
		expect(result.code).toBe("WRONG_SEASON")
	end)

	it("ice cannot be collected in summer", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		state.players.P1.money = 5
		expect(engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		}).ok).toBe(true)
		engine:tick(600)
		local job
		for _, entry in state.ponds do
			if entry.ownerId == "P1" then
				job = entry
			end
		end
		expect(job.status).toBe("CLAIMABLE")
		-- Manually enter summer (without the flip's expiry) to test the claim gate.
		state.season.logicSeason = "SUMMER"
		local result =
			engine:applyAction({ type = "pond.harvest.claim", playerId = "P1", pondJobId = job.id })
		expect(result.ok).toBe(false)
		expect(result.code).toBe("WRONG_SEASON")
	end)

	it("uncollected ice is lost when summer arrives", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		local pondTile = firstTileBy(engine, function(entry)
			return entry.type == "POND"
		end)
		tileRefAt(state, pondTile.x, pondTile.y).ownerId = "P1"
		state.players.P1.money = 5
		expect(engine:applyAction({
			type = "pond.harvest.start",
			playerId = "P1",
			x = pondTile.x,
			y = pondTile.y,
		}).ok).toBe(true)
		engine:tick(600) -- ready to collect, still winter
		engine:tick(400) -- crosses into summer (flip at 1000ms)
		expect(state.season.logicSeason).toBe("SUMMER")
		expect(state.players.P1.ice).toBe(0)
		local anyJob = false
		for _, entry in state.ponds do
			if entry.ownerId == "P1" then
				anyJob = true
			end
		end
		expect(anyJob).toBe(false)
	end)

	it("winter to summer melts unrefrigerated ice, rounding up", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		-- 7 ice, 1 fridge (protects 2) -> 5 unprotected -> ceil(2.5) = 3 melt -> 4 left.
		state.players.P1.ice = 7
		state.players.P1.refrigerators = 1
		engine:tick(1000)
		expect(state.players.P1.ice).toBe(4)
	end)

	it("melt round-up example: 9 ice in 2 fridges leaves 6", function()
		local engine = createHeadToHeadEngine({ startingSeason = "WINTER" })
		local state = engine:getState()
		-- 9 ice, 2 fridges (protect 4) -> 5 unprotected -> ceil(2.5) = 3 melt -> 6 left.
		state.players.P1.ice = 9
		state.players.P1.refrigerators = 2
		engine:tick(1000)
		expect(state.players.P1.ice).toBe(6)
	end)
end)

describe("match outcome rules", function()
	it("time winner is based on highest money (not net worth)", function()
		local engine = createHeadToHeadEngine({ win = { overtimeEnabled = false } })
		local state = engine:getState()
		state.players.P1.money = 12
		state.players.P1.ice = 0
		state.players.P1.blueIce = 0
		state.players.P1.refrigerators = 0
		state.players.P2.money = 8
		state.players.P2.ice = 25
		state.players.P2.blueIce = 4
		state.players.P2.refrigerators = 8
		state.match.durationMs = 1
		engine:tick(1)
		expect(state.match.ended).toBe(true)
		expect(state.match.winnerId).toBe("P1")
	end)

	it("time tie on money is a draw when overtime is disabled", function()
		local engine = createHeadToHeadEngine({ win = { overtimeEnabled = false } })
		local state = engine:getState()
		state.players.P1.money = 10
		state.players.P2.money = 10
		state.players.P2.ice = 50
		state.players.P2.blueIce = 10
		state.players.P2.refrigerators = 12
		state.match.durationMs = 1
		engine:tick(1)
		expect(state.match.ended).toBe(true)
		expect(state.match.winnerId).toBeNil()
	end)
end)

describe("bot behavior constraints", function()
	it("external bot mode enforces bot identity and cadence throttle", function()
		local engine = Engine.createPlayVsComputer("bot-test", "Human", "DEV_FAST", "EXTERNAL")
		local state = engine:getState()
		local target = firstTileBy(engine, function(tile)
			return tile.ownerId == nil and tile.type ~= "VOID"
		end)

		expect(engine:applyExternalBotAction({
			type = "tile.buy",
			playerId = "P1",
			x = target.x,
			y = target.y,
		}).ok).toBe(false)

		state.players.P2.money = 10
		expect(engine:applyExternalBotAction({
			type = "tile.buy",
			playerId = "P2",
			x = target.x,
			y = target.y,
		}).ok).toBe(true)

		local secondBotAction = engine:applyExternalBotAction({
			type = "tile.buy",
			playerId = "P2",
			x = target.x + 1,
			y = target.y,
		})
		expect(secondBotAction.ok).toBe(false)
		expect(secondBotAction.code).toBe("LIMIT_REACHED")
	end)

	it("internal heuristic bot performs legal actions over time", function()
		local engine = Engine.createPlayVsComputer("bot-legality", "Human", "DEV_FAST")
		for _ = 1, 240 do
			engine:tick(250)
		end
		local logs = engine:getState().actionLog
		local botAccepted = 0
		for _, entry in logs do
			if
				entry.type == "action.accepted"
				and entry.payload.source == "BOT"
				and entry.payload.playerId == "P2"
			then
				botAccepted += 1
			end
		end
		expect(botAccepted).toBeGreaterThan(0)

		local botOwnedTiles = 0
		for _, tile in engine:getState().tiles do
			if tile.ownerId == "P2" then
				botOwnedTiles += 1
			end
		end
		expect(botOwnedTiles).toBeGreaterThan(0)
	end)

	it("bot candidate action list is rich, deduplicated, and season-aware", function()
		local engine =
			Engine.createPlayVsComputer("bot-candidates", "Human", "DEV_FAST", "EXTERNAL")
		local state = engine:getState()
		state.players.P2.money = 30
		state.players.P2.ice = 12
		state.players.P2.blueIce = 2

		local ownedGrass, house, train = nil, nil, nil
		local ponds = {}
		for _, tile in state.tiles do
			if tile.ownerId == nil and tile.type == "GRASS" and not ownedGrass then
				ownedGrass = tile
			end
			if tile.type == "POND" then
				table.insert(ponds, tile)
			end
			if tile.type == "HOUSE" and not house then
				house = tile
			end
			if tile.type == "TRAIN" and not train then
				train = tile
			end
		end
		local factory = ownedGrass
		expect(ownedGrass).toBeDefined()
		expect(#ponds >= 2).toBeTruthy()
		expect(house).toBeDefined()
		expect(train).toBeDefined()

		local pond, freePond = ponds[1], ponds[2]
		ownedGrass.ownerId = "P2"
		pond.ownerId = "P2"
		freePond.ownerId = "P2"
		house.ownerId = "P2"
		train.ownerId = "P2"
		factory.ownerId = "P2"
		factory.type = "FACTORY"

		state.season.logicSeason = "SUMMER"
		state.season.visualFromSeason = "SUMMER"
		state.season.visualToSeason = "WINTER"
		table.insert(state.ponds, {
			id = "claimable-test-job",
			ownerId = "P2",
			pondX = pond.x,
			pondY = pond.y,
			status = "CLAIMABLE",
			harvestIceYield = 1,
			createdAtMs = state.nowMs,
			claimAtMs = state.nowMs,
			claimedAtMs = nil,
		})

		local summerActions = engine:listBotCandidateActions("P2", 40)
		expect(#summerActions).toBeGreaterThan(6)
		expect(#summerActions).toBeLessThanOrEqual(40)

		local serializedSet = {}
		local uniqueCount = 0
		local allP2 = true
		local summerTypes = {}
		for _, action in summerActions do
			local key = serializeAction(action)
			if not serializedSet[key] then
				serializedSet[key] = true
				uniqueCount += 1
			end
			if action.playerId ~= "P2" then
				allP2 = false
			end
			summerTypes[action.type] = true
		end
		expect(uniqueCount).toBe(#summerActions)
		expect(allP2).toBe(true)
		expect(summerTypes["pond.harvest.claim"]).toBe(true)
		expect(summerTypes["structure.house.sellIce"]).toBe(true)
		expect(summerTypes["structure.factory.craftBlueIce"]).toBe(true)
		expect(summerTypes["structure.train.sellAnnualShipment"]).toBe(true)
		expect(summerTypes["tile.buy"]).toBe(true)
		expect(summerTypes["pond.harvest.start"]).never.toBe(true)

		state.season.logicSeason = "WINTER"
		state.season.visualFromSeason = "WINTER"
		state.season.visualToSeason = "SUMMER"
		local winterActions = engine:listBotCandidateActions("P2", 40)
		local winterTypes = {}
		for _, action in winterActions do
			winterTypes[action.type] = true
		end
		expect(winterTypes["pond.harvest.start"]).toBe(true)
	end)

	it("heuristic prioritizes high-value expansion targets early", function()
		local engine = Engine.createPlayVsComputer("bot-priority", "Human", "DEV_FAST", "EXTERNAL")
		local state = engine:getState()
		state.players.P2.money = 20

		local action = engine:suggestHeuristicBotAction("P2")
		expect(action).never.toBeNil()
		expect(action.type == "tile.buy" or action.type == "tile.buyFromPlayer").toBe(true)

		local targetTile = tileRefAt(state, action.x, action.y)
		expect(targetTile).toBeDefined()
		local tt = targetTile.type
		expect(tt == "TRAIN" or tt == "HOUSE" or tt == "POND").toBe(true)
	end)
end)

t.finish()
