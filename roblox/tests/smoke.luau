--!nocheck
-- Smoke test: validates the Lune shim + the foundation modules load and behave.

local shim = require("./roblox")
local t = require("./framework")
local describe, it, expect = t.describe, t.it, t.expect

local Rng = shim.require("core", "Rng")
local Config = shim.require("core", "Config")
local Helpers = shim.require("core", "Helpers")

describe("Rng", function()
	it("is deterministic for the same seed", function()
		local a = Rng.createRng("seed-1")
		local b = Rng.createRng("seed-1")
		expect(a.next()).toBe(b.next())
		expect(a.next()).toBe(b.next())
	end)

	it("produces values in [0, 1)", function()
		local r = Rng.createRng("range")
		for _ = 1, 500 do
			local v = r.next()
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThan(1)
		end
	end)

	it("int stays within the inclusive range", function()
		local r = Rng.createRng("ints")
		for _ = 1, 500 do
			local n = r.int(0, 9)
			expect(n).toBeGreaterThanOrEqual(0)
			expect(n).toBeLessThanOrEqual(9)
			expect(n % 1).toBe(0)
		end
	end)

	it("different seeds diverge", function()
		local a = Rng.createRng("alpha")
		local b = Rng.createRng("beta")
		expect(a.next()).never.toBe(b.next())
	end)
end)

describe("Config", function()
	it("defaults match the original", function()
		local cfg = Config.createGameConfig(nil, "PROD")
		expect(cfg.startingMoney).toBe(20)
		expect(cfg.startingRefrigerators).toBe(1)
		expect(cfg.timing.seasonDurationMs).toBe(300000)
		expect(cfg.timing.matchDurationMs).toBe(1800000)
		expect(cfg.economy.houseSellBlueIcePrice).toBe(8)
	end)

	it("DEV_FAST shortens timings", function()
		local fast = Config.createGameConfig(nil, "DEV_FAST")
		expect(fast.timing.seasonDurationMs).toBe(75000)
		expect(fast.timing.matchDurationMs).toBe(480000)
	end)

	it("does not mutate the shared default", function()
		Config.createGameConfig(nil, "DEV_FAST")
		expect(Config.DEFAULT_GAME_CONFIG.timing.seasonDurationMs).toBe(300000)
	end)

	it("applies overrides", function()
		local cfg = Config.createGameConfig(
			{ startingMoney = 99, economy = { pondHarvestCost = 5 } },
			"PROD"
		)
		expect(cfg.startingMoney).toBe(99)
		expect(cfg.economy.pondHarvestCost).toBe(5)
		expect(cfg.economy.buyUnownedTileCost).toBe(1)
	end)
end)

describe("Helpers", function()
	it("tileIndex maps 0-based coords to a 1-based flat array", function()
		expect(Helpers.tileIndex(10, 0, 0)).toBe(1)
		expect(Helpers.tileIndex(10, 1, 0)).toBe(2)
		expect(Helpers.tileIndex(10, 0, 1)).toBe(11)
		expect(Helpers.tileIndex(10, 9, 9)).toBe(100)
	end)

	it("clamp and oppositeSeason", function()
		expect(Helpers.clamp(15, 0, 10)).toBe(10)
		expect(Helpers.clamp(-5, 0, 10)).toBe(0)
		expect(Helpers.oppositeSeason("SUMMER")).toBe("WINTER")
		expect(Helpers.oppositeSeason("WINTER")).toBe("SUMMER")
	end)

	it("playerStorageSplit refrigerates up to capacity", function()
		local split = Helpers.playerStorageSplit({ ice = 5, refrigerators = 1 }, 2)
		expect(split.refrigeratedIce).toBe(2)
		expect(split.unrefrigeratedIce).toBe(3)
	end)

	it("createId is deterministic base36", function()
		expect(Helpers.createId("pond", 0, 0)).toBe("pond_0_0")
	end)
end)

-- Summary + exit handled by the aggregate runner (tests/init.luau).
