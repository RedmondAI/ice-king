--!strict
-- Deterministic RNG: FNV-1a seed hash + xorshift32.
-- Ported 1:1 from the original TypeScript so a given seed yields the same map.
-- NOTE: for cross-engine parity, seeds should be ASCII (string.byte reads bytes,
-- which matches JS charCodeAt within the ASCII range).

local Rng = {}

local TWO_POW_32 = 4294967296

export type Rng = {
	next: () -> number,
	int: (min: number, max: number) -> number,
	pick: (items: { any }) -> any,
}

-- 32-bit unsigned multiply (matches the bit pattern of JS Math.imul).
local function imul(a: number, b: number): number
	local al = bit32.band(a, 0xFFFF)
	local ah = bit32.rshift(a, 16)
	local bl = bit32.band(b, 0xFFFF)
	local bh = bit32.rshift(b, 16)
	local low = al * bl
	local mid = ((ah * bl + al * bh) % 0x10000) * 0x10000
	return (low + mid) % TWO_POW_32
end

local function fnv1aHash(input: string): number
	local hash = 2166136261
	for i = 1, #input do
		hash = bit32.bxor(hash, string.byte(input, i))
		hash = imul(hash, 16777619)
	end
	return hash % TWO_POW_32
end

function Rng.createRng(seed: string): Rng
	local state = fnv1aHash(seed)
	if state == 0 then
		state = 0x12345678
	end

	local function nextValue(): number
		state = bit32.bxor(state, bit32.lshift(state, 13))
		state = bit32.bxor(state, bit32.rshift(state, 17))
		state = bit32.bxor(state, bit32.lshift(state, 5))
		return state / TWO_POW_32
	end

	local instance: Rng = {
		next = nextValue,
		int = function(min: number, max: number): number
			if max < min then
				error("Invalid int range " .. tostring(min) .. ".." .. tostring(max))
			end
			return math.floor(nextValue() * (max - min + 1)) + min
		end,
		pick = function(items: { any }): any
			if #items == 0 then
				error("Cannot pick from empty array")
			end
			return items[math.floor(nextValue() * #items) + 1]
		end,
	}

	return instance
end

return Rng
