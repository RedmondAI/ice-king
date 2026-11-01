--!strict
-- Procedural map generation. Ported from packages/game-core/src/mapGenerator.ts
-- with the RNG call order preserved exactly, so a given seed reproduces the same
-- map as the original (ASCII seeds).

local Rng = require(script.Parent.Rng)
local Helpers = require(script.Parent.Helpers)
local Types = require(script.Parent.Types)

type TileState = Types.TileState
type TileType = Types.TileType
type Point = { x: number, y: number }

local MapGenerator = {}

local MAP_BORDER_TILES = 1
local tileIndex = Helpers.tileIndex

local function distance(a: Point, b: Point): number
	local dx = a.x - b.x
	local dy = a.y - b.y
	return math.sqrt(dx * dx + dy * dy)
end

local function inBounds(width: number, height: number, x: number, y: number): boolean
	return x >= 0 and y >= 0 and x < width and y < height
end

local function randomPoint(rng, width: number, height: number, padding: number): Point
	local safePadding =
		math.max(0, math.min(padding, math.floor((math.min(width, height) - 1) / 2)))
	return {
		x = rng.int(safePadding, width - 1 - safePadding),
		y = rng.int(safePadding, height - 1 - safePadding),
	}
end

local function setTileType(tiles: { TileState }, width: number, point: Point, tileType: TileType)
	local idx = tileIndex(width, point.x, point.y)
	tiles[idx].type = tileType
end

local function findPointsWithMinDistance(
	rng,
	count,
	width,
	height,
	minDistance,
	maxAttempts
): { Point }
	maxAttempts = maxAttempts or 5000
	local points: { Point } = {}
	local used: { [string]: boolean } = {}
	local desiredPadding = math.max(0, math.min(2, math.floor((math.min(width, height) - 1) / 2)))
	local maxDistanceForMap = math.max(1, math.floor(math.min(width, height) / 2))
	local targetDistance = math.min(minDistance, maxDistanceForMap)

	while targetDistance >= 0 and #points < count do
		local attempt = 0
		while attempt < maxAttempts and #points < count do
			attempt += 1
			local candidate = randomPoint(rng, width, height, desiredPadding)
			local key = candidate.x .. "," .. candidate.y
			if used[key] then
				continue
			end
			local tooClose = false
			for _, existing in points do
				if distance(existing, candidate) < targetDistance then
					tooClose = true
					break
				end
			end
			if not tooClose then
				table.insert(points, candidate)
				used[key] = true
			end
		end
		if targetDistance == 0 then
			break
		end
		targetDistance -= 1
	end

	if #points < count then
		local remaining: { Point } = {}
		for y = 0, height - 1 do
			for x = 0, width - 1 do
				if not used[x .. "," .. y] then
					table.insert(remaining, { x = x, y = y })
				end
			end
		end
		for i = #remaining - 1, 1, -1 do
			local j = rng.int(0, i)
			remaining[i + 1], remaining[j + 1] = remaining[j + 1], remaining[i + 1]
		end
		for _, point in remaining do
			if #points >= count then
				break
			end
			table.insert(points, point)
		end
	end

	return points
end

local function paintPondCluster(tiles, rng, width, height, center: Point, size: number)
	local filled: { [string]: boolean } = {}
	local filledCount = 0
	local queue: { Point } = { { x = center.x, y = center.y } }

	while #queue > 0 and filledCount < size do
		local point = table.remove(queue, 1) :: Point
		local key = point.x .. "," .. point.y
		if filled[key] or not inBounds(width, height, point.x, point.y) then
			continue
		end

		filled[key] = true
		filledCount += 1
		setTileType(tiles, width, point, "POND")

		local neighbors: { Point } = {
			{ x = point.x + 1, y = point.y },
			{ x = point.x - 1, y = point.y },
			{ x = point.x, y = point.y + 1 },
			{ x = point.x, y = point.y - 1 },
			{ x = point.x + 1, y = point.y + 1 },
			{ x = point.x - 1, y = point.y - 1 },
			{ x = point.x + 1, y = point.y - 1 },
			{ x = point.x - 1, y = point.y + 1 },
		}
		for _, neighbor in neighbors do
			if inBounds(width, height, neighbor.x, neighbor.y) then
				if rng.next() > 0.35 then
					table.insert(queue, neighbor)
				end
			end
		end

		if #queue == 0 and filledCount < size then
			table.insert(queue, {
				x = point.x + rng.int(-1, 1),
				y = point.y + rng.int(-1, 1),
			})
		end
	end
end

local function isSpecial(tileType: TileType): boolean
	return tileType == "POND" or tileType == "HOUSE" or tileType == "TRAIN" or tileType == "FACTORY"
end

local function placeStructurePoints(
	tiles,
	width,
	height,
	rng,
	tileType,
	count,
	minDistance,
	avoid
): { Point }
	local points: { Point } = {}
	local used: { [string]: boolean } = {}
	local desiredPadding = math.max(0, math.min(1, math.floor((math.min(width, height) - 1) / 2)))
	local maxDistanceForMap = math.max(1, math.floor(math.min(width, height) / 2))
	local targetDistance = math.min(minDistance, maxDistanceForMap)

	while targetDistance >= 0 and #points < count do
		local attempts = 0
		while #points < count and attempts < 4000 do
			attempts += 1
			local candidate = randomPoint(rng, width, height, desiredPadding)
			local key = candidate.x .. "," .. candidate.y
			if used[key] then
				continue
			end
			local tile = tiles[tileIndex(width, candidate.x, candidate.y)]
			if isSpecial(tile.type) then
				continue
			end
			local tooClose = false
			for _, point in points do
				if distance(point, candidate) < targetDistance then
					tooClose = true
					break
				end
			end
			if not tooClose then
				for _, point in avoid do
					if distance(point, candidate) < targetDistance then
						tooClose = true
						break
					end
				end
			end
			if tooClose then
				continue
			end
			setTileType(tiles, width, candidate, tileType)
			table.insert(points, candidate)
			used[key] = true
		end
		if targetDistance == 0 then
			break
		end
		targetDistance -= 1
	end

	if #points < count then
		local fallback: { Point } = {}
		for y = 0, height - 1 do
			for x = 0, width - 1 do
				if used[x .. "," .. y] then
					continue
				end
				local existingTile = tiles[tileIndex(width, x, y)]
				local existingType = (existingTile and existingTile.type) or "GRASS"
				if not isSpecial(existingType) then
					table.insert(fallback, { x = x, y = y })
				end
			end
		end
		for i = #fallback - 1, 1, -1 do
			local j = rng.int(0, i)
			fallback[i + 1], fallback[j + 1] = fallback[j + 1], fallback[i + 1]
		end
		for _, point in fallback do
			if #points >= count then
				break
			end
			setTileType(tiles, width, point, tileType)
			table.insert(points, point)
			used[point.x .. "," .. point.y] = true
		end
	end

	return points
end

local function wrapTilesWithBorder(playableTiles, playableWidth, playableHeight, borderTiles)
	local width = playableWidth + borderTiles * 2
	local height = playableHeight + borderTiles * 2
	local tiles: { TileState } = {}
	for index = 0, width * height - 1 do
		tiles[index + 1] = {
			x = index % width,
			y = math.floor(index / width),
			type = "VOID",
			source = "MAP_GENERATED",
			ownerId = nil,
			currentPrice = 0,
		}
	end

	for _, tile in playableTiles do
		local wrappedX = tile.x + borderTiles
		local wrappedY = tile.y + borderTiles
		tiles[tileIndex(width, wrappedX, wrappedY)] = {
			x = wrappedX,
			y = wrappedY,
			type = tile.type,
			source = tile.source,
			ownerId = tile.ownerId,
			currentPrice = tile.currentPrice,
		}
	end

	return { tiles = tiles, width = width, height = height }
end

local function offsetPoints(points: { Point }, borderTiles: number): { Point }
	local out: { Point } = {}
	for _, point in points do
		table.insert(out, { x = point.x + borderTiles, y = point.y + borderTiles })
	end
	return out
end

export type GeneratedMap = {
	width: number,
	height: number,
	playableWidth: number,
	playableHeight: number,
	borderTiles: number,
	tiles: { TileState },
	specialPoints: {
		naturalPonds: { Point },
		houses: { Point },
		train: { Point },
	},
}

function MapGenerator.generateMap(seed: string, config: any): GeneratedMap
	local rng = Rng.createRng(seed)
	local playableWidth = config.map.width
	local playableHeight = config.map.height

	local playableTiles: { TileState } = {}
	for index = 0, playableWidth * playableHeight - 1 do
		playableTiles[index + 1] = {
			x = index % playableWidth,
			y = math.floor(index / playableWidth),
			type = "GRASS",
			source = "MAP_GENERATED",
			ownerId = nil,
			currentPrice = config.economy.buyUnownedTileCost,
		}
	end

	for y = 0, playableHeight - 1 do
		for x = 0, playableWidth - 1 do
			if rng.next() < config.map.forestDensity then
				playableTiles[tileIndex(playableWidth, x, y)].type = "FOREST"
			end
		end
	end

	local naturalPonds = findPointsWithMinDistance(
		rng,
		config.map.naturalPondCount,
		playableWidth,
		playableHeight,
		config.map.pondMinDistance
	)

	for _, pondCenter in naturalPonds do
		local size = rng.int(config.map.pondClusterMin, config.map.pondClusterMax)
		paintPondCluster(playableTiles, rng, playableWidth, playableHeight, pondCenter, size)
	end

	local houseDistance = math.max(2, math.floor(math.min(playableWidth, playableHeight) * 0.35))
	local trainDistance = math.max(3, math.floor(math.min(playableWidth, playableHeight) * 0.45))

	local houses = placeStructurePoints(
		playableTiles,
		playableWidth,
		playableHeight,
		rng,
		"HOUSE",
		config.map.housesCount,
		houseDistance,
		naturalPonds
	)

	local trainAvoid: { Point } = {}
	for _, point in naturalPonds do
		table.insert(trainAvoid, point)
	end
	for _, point in houses do
		table.insert(trainAvoid, point)
	end

	local train = placeStructurePoints(
		playableTiles,
		playableWidth,
		playableHeight,
		rng,
		"TRAIN",
		config.map.trainCount,
		trainDistance,
		trainAvoid
	)

	local wrapped =
		wrapTilesWithBorder(playableTiles, playableWidth, playableHeight, MAP_BORDER_TILES)

	return {
		width = wrapped.width,
		height = wrapped.height,
		playableWidth = playableWidth,
		playableHeight = playableHeight,
		borderTiles = MAP_BORDER_TILES,
		tiles = wrapped.tiles,
		specialPoints = {
			naturalPonds = offsetPoints(naturalPonds, MAP_BORDER_TILES),
			houses = offsetPoints(houses, MAP_BORDER_TILES),
			train = offsetPoints(train, MAP_BORDER_TILES),
		},
	}
end

return MapGenerator
