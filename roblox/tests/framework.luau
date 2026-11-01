--!nocheck
-- Tiny test framework: describe / it / expect, modeled on the vitest API the
-- original tests use, so the 24 game-core specs port with minimal rewriting.

local process = require("@lune/process")

local Framework = {}

local results = { passed = 0, failed = 0 }
local suiteStack = {}

local function deepEqual(a, b)
	if a == b then
		return true
	end
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	for key, value in a do
		if not deepEqual(value, b[key]) then
			return false
		end
	end
	for key in b do
		if a[key] == nil then
			return false
		end
	end
	return true
end

local function stringify(value)
	if type(value) == "table" then
		return "<table>"
	end
	return tostring(value)
end

local function fail(message)
	error(message, 3)
end

local function makeMatchers(actual, negated)
	local function assertCond(cond, message)
		if negated then
			cond = not cond
		end
		if not cond then
			fail(message)
		end
	end

	local api = {}

	function api.toBe(expected)
		assertCond(
			actual == expected,
			string.format("expected %s to be %s", stringify(actual), stringify(expected))
		)
	end
	function api.toEqual(expected)
		assertCond(
			deepEqual(actual, expected),
			string.format("expected %s to deep-equal %s", stringify(actual), stringify(expected))
		)
	end
	function api.toBeTruthy()
		assertCond(
			actual and true or false,
			string.format("expected %s to be truthy", stringify(actual))
		)
	end
	function api.toBeFalsy()
		assertCond(not actual, string.format("expected %s to be falsy", stringify(actual)))
	end
	function api.toBeNil()
		assertCond(actual == nil, string.format("expected %s to be nil", stringify(actual)))
	end
	function api.toBeDefined()
		assertCond(actual ~= nil, "expected value to be defined")
	end
	function api.toBeGreaterThan(expected)
		assertCond(
			actual > expected,
			string.format("expected %s > %s", stringify(actual), stringify(expected))
		)
	end
	function api.toBeGreaterThanOrEqual(expected)
		assertCond(
			actual >= expected,
			string.format("expected %s >= %s", stringify(actual), stringify(expected))
		)
	end
	function api.toBeLessThan(expected)
		assertCond(
			actual < expected,
			string.format("expected %s < %s", stringify(actual), stringify(expected))
		)
	end
	function api.toBeLessThanOrEqual(expected)
		assertCond(
			actual <= expected,
			string.format("expected %s <= %s", stringify(actual), stringify(expected))
		)
	end
	function api.toBeCloseTo(expected, precision)
		local tolerance = 0.5 * 10 ^ -(precision or 2)
		assertCond(
			math.abs(actual - expected) < tolerance,
			string.format("expected %s close to %s", stringify(actual), stringify(expected))
		)
	end
	function api.toContain(expected)
		local found = false
		if type(actual) == "table" then
			for _, value in actual do
				if value == expected then
					found = true
					break
				end
			end
		end
		assertCond(found, string.format("expected table to contain %s", stringify(expected)))
	end
	function api.toHaveLength(expected)
		assertCond(
			type(actual) == "table" and #actual == expected,
			string.format(
				"expected length %s, got %s",
				stringify(expected),
				stringify(actual and #actual)
			)
		)
	end

	return api
end

function Framework.expect(actual)
	local api = makeMatchers(actual, false)
	api.never = makeMatchers(actual, true)
	return api
end

function Framework.describe(name, fn)
	table.insert(suiteStack, name)
	fn()
	table.remove(suiteStack)
end

function Framework.it(name, fn)
	local label = table.concat(suiteStack, " > ")
	if label ~= "" then
		label = label .. " > "
	end
	label = label .. name

	local ok, err = pcall(fn)
	if ok then
		results.passed += 1
		print("  ok   " .. label)
	else
		results.failed += 1
		print("  FAIL " .. label)
		print("         " .. tostring(err))
	end
end

function Framework.finish()
	print(string.format("\n%d passed, %d failed", results.passed, results.failed))
	if results.failed > 0 then
		process.exit(1)
	end
end

return Framework
