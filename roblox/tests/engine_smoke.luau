--!nocheck
local shim = require("./roblox")
local t = require("./framework")
local describe, it, expect = t.describe, t.it, t.expect

local Engine = shim.require("core", "Engine")

local function firstUnownedPlayable(state)
	for _, tile in state.tiles do
		if tile.type ~= "VOID" and tile.ownerId == nil then
			return tile
		end
	end
	return nil
end

describe("Engine smoke", function()
	it("creates a Play-vs-Computer match", function()
		local e = Engine.createPlayVsComputer("seed", "You", "DEV_FAST")
		local s = e:getState()
		expect(s.players.P1).toBeDefined()
		expect(s.players.P2.controller).toBe("BOT")
		expect(s.players.P1.money).toBe(20)
	end)

	it("buys a tile through applyAction", function()
		local e = Engine.createPlayVsComputer("buyseed", "You", "DEV_FAST")
		local s = e:getState()
		local target = firstUnownedPlayable(s)
		local res =
			e:applyAction({ type = "tile.buy", playerId = "P1", x = target.x, y = target.y })
		expect(res.ok).toBeTruthy()
		expect(s.players.P1.money).toBe(19)
		expect(s.tiles[target.y * s.width + target.x + 1].ownerId).toBe("P1")
	end)

	it("rejects an invalid action", function()
		local e = Engine.createPlayVsComputer("badseed", "You", "DEV_FAST")
		local res = e:applyAction({ type = "not.a.real.action", playerId = "P1" })
		expect(res.ok).toBeFalsy()
		expect(res.code).toBe("INVALID_ACTION")
	end)

	it("ticks the clock and lets the bot act", function()
		local e = Engine.createPlayVsComputer("tickseed", "You", "DEV_FAST")
		for _ = 1, 50 do
			e:tick(1000)
		end
		local s = e:getState()
		expect(s.nowMs).toBe(50000)
		-- the bot should have bought at least one tile by now
		local botTiles = 0
		for _, tile in s.tiles do
			if tile.ownerId == "P2" then
				botTiles += 1
			end
		end
		expect(botTiles).toBeGreaterThan(0)
	end)

	it("creates a two-player match with two human seats and no bot", function()
		local e = Engine.createPlayVsPlayer("pvpseed", "Ann", "Bo", "DEV_FAST")
		local s = e:getState()
		expect(s.players.P1.controller).toBe("HUMAN")
		expect(s.players.P2.controller).toBe("HUMAN")
		expect(s.players.P1.name).toBe("Ann")
		expect(s.players.P2.name).toBe("Bo")
		expect(next(s.bots)).toBe(nil)
	end)

	it("lets both seats act and a forfeit hands the win to the other player", function()
		local e = Engine.createPlayVsPlayer("pvpforfeit", "Ann", "Bo", "DEV_FAST")
		local s = e:getState()
		local target = firstUnownedPlayable(s)
		local res =
			e:applyAction({ type = "tile.buy", playerId = "P2", x = target.x, y = target.y })
		expect(res.ok).toBeTruthy()
		expect(s.tiles[target.y * s.width + target.x + 1].ownerId).toBe("P2")

		e:applyAction({ type = "player.forfeit", playerId = "P2" })
		expect(s.match.ended).toBe(true)
		expect(s.match.winnerId).toBe("P1")
	end)

	it("skips summer in a solo match on the human's vote alone", function()
		local e = Engine.createPlayVsComputer("soloskip", "You", "DEV_FAST")
		local s = e:getState()
		while s.season.logicSeason ~= "SUMMER" do
			e:tick(1000)
		end
		local res = e:applyAction({ type = "season.skipSummerVote", playerId = "P1" })
		expect(res.ok).toBeTruthy()
		expect(s.season.logicSeason).toBe("WINTER")
	end)
end)

-- Summary + exit handled by the aggregate runner (tests/init.luau).
