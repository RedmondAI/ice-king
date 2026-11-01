--!nocheck
local shim = require("./roblox")
local t = require("./framework")
local describe, it, expect = t.describe, t.it, t.expect

local Config = shim.require("core", "Config")
local MapGenerator = shim.require("core", "MapGenerator")
local StateInit = shim.require("core", "StateInit")
local Helpers = shim.require("core", "Helpers")

local config = Config.createGameConfig(nil, "PROD")

local function countTypes(tiles)
	local counts = {}
	for _, tile in tiles do
		counts[tile.type] = (counts[tile.type] or 0) + 1
	end
	return counts
end

describe("MapGenerator", function()
	it("produces a 12x12 runtime grid with a VOID border", function()
		local map = MapGenerator.generateMap("test-seed", config)
		expect(map.width).toBe(12)
		expect(map.height).toBe(12)
		expect(#map.tiles).toBe(144)
		-- corners and edges are VOID
		expect(Helpers.getTile(map, 0, 0).type).toBe("VOID")
		expect(Helpers.getTile(map, 11, 11).type).toBe("VOID")
		expect(Helpers.getTile(map, 5, 0).type).toBe("VOID")
		-- an interior tile is never VOID
		expect(Helpers.getTile(map, 5, 5).type).never.toBe("VOID")
	end)

	it("places the expected structures", function()
		local map = MapGenerator.generateMap("structures", config)
		local counts = countTypes(map.tiles)
		expect(counts.VOID).toBe(44)
		expect(counts.HOUSE).toBe(4)
		expect(counts.TRAIN).toBe(1)
		expect((counts.POND or 0) >= 3).toBeTruthy()
	end)

	it("is deterministic for the same seed", function()
		local a = MapGenerator.generateMap("same", config)
		local b = MapGenerator.generateMap("same", config)
		for i = 1, #a.tiles do
			expect(a.tiles[i].type).toBe(b.tiles[i].type)
		end
	end)

	it("different seeds give different maps", function()
		local a = MapGenerator.generateMap("seed-a", config)
		local b = MapGenerator.generateMap("seed-b", config)
		local same = true
		for i = 1, #a.tiles do
			if a.tiles[i].type ~= b.tiles[i].type then
				same = false
				break
			end
		end
		expect(same).toBeFalsy()
	end)
end)

describe("StateInit", function()
	it("creates a full starting state", function()
		local state = StateInit.createInitialState({
			seed = "init",
			config = config,
			players = {
				{ id = "P1", name = "You", color = "BLUE", controller = "HUMAN" },
				{ id = "P2", name = "Ice Bot", color = "RED", controller = "BOT" },
			},
		})
		expect(state.width).toBe(12)
		expect(state.players.P1.money).toBe(20)
		expect(state.players.P2.controller).toBe("BOT")
		expect(state.bots.P2).toBeDefined()
		expect(state.bots.P1).toBeNil()
		expect(state.season.logicSeason).toBe("WINTER")
		expect(state.season.visualToSeason).toBe("SUMMER")
		expect(state.trainSales.currentYear).toBe(1)
		expect(#state.playerOrder).toBe(2)
		expect(state.match.durationMs).toBe(1800000)
	end)
end)

-- Summary + exit handled by the aggregate runner (tests/init.luau).
