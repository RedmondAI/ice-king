import type { GameConfig } from '@ice-king/config';
import type { TileState, TileType } from '@ice-king/shared';
import { createRng } from './rng';
import { tileIndex } from './helpers';

interface Point {
  x: number;
  y: number;
}

const MAP_BORDER_TILES = 1;

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function randomPoint(rng: ReturnType<typeof createRng>, width: number, height: number, padding = 0): Point {
  const safePadding = Math.max(
    0,
    Math.min(padding, Math.floor((Math.min(width, height) - 1) / 2)),
  );
  return {
    x: rng.int(safePadding, width - 1 - safePadding),
    y: rng.int(safePadding, height - 1 - safePadding),
  };
}

function setTileType(tiles: TileState[], width: number, point: Point, type: TileType): void {
  const idx = tileIndex(width, point.x, point.y);
  tiles[idx] = {
    ...tiles[idx],
    type,
  };
}

function findPointsWithMinDistance(
  rng: ReturnType<typeof createRng>,
  count: number,
  width: number,
  height: number,
  minDistance: number,
  maxAttempts = 5000,
): Point[] {
  const points: Point[] = [];
  const used = new Set<string>();
  const desiredPadding = Math.max(0, Math.min(2, Math.floor((Math.min(width, height) - 1) / 2)));
  const maxDistanceForMap = Math.max(1, Math.floor(Math.min(width, height) / 2));

  let targetDistance = Math.min(minDistance, maxDistanceForMap);
  while (targetDistance >= 0 && points.length < count) {
    for (let attempt = 0; attempt < maxAttempts && points.length < count; attempt += 1) {
      const candidate = randomPoint(rng, width, height, desiredPadding);
      const key = `${candidate.x},${candidate.y}`;
      if (used.has(key)) {
        continue;
      }
      if (points.every((existing) => distance(existing, candidate) >= targetDistance)) {
        points.push(candidate);
        used.add(key);
      }
    }
    if (targetDistance === 0) {
      break;
    }
    targetDistance -= 1;
  }

  if (points.length < count) {
    const remaining: Point[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const key = `${x},${y}`;
        if (!used.has(key)) {
          remaining.push({ x, y });
        }
      }
    }

    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      [remaining[i], remaining[j]] = [remaining[j] as Point, remaining[i] as Point];
    }

    for (const point of remaining) {
      if (points.length >= count) {
        break;
      }
      points.push(point);
    }
  }

  return points;
}

function paintPondCluster(
  tiles: TileState[],
  rng: ReturnType<typeof createRng>,
  width: number,
  height: number,
  center: Point,
  size: number,
): void {
  const filled = new Set<string>();
  const queue: Point[] = [center];

  while (queue.length > 0 && filled.size < size) {
    const point = queue.shift() as Point;
    const key = `${point.x},${point.y}`;
    if (filled.has(key) || !inBounds(width, height, point.x, point.y)) {
      continue;
    }

    filled.add(key);
    setTileType(tiles, width, point, 'POND');

    const neighbors: Point[] = [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
      { x: point.x + 1, y: point.y + 1 },
      { x: point.x - 1, y: point.y - 1 },
      { x: point.x + 1, y: point.y - 1 },
      { x: point.x - 1, y: point.y + 1 },
    ];

    for (const neighbor of neighbors) {
      if (!inBounds(width, height, neighbor.x, neighbor.y)) {
        continue;
      }
      if (rng.next() > 0.35) {
        queue.push(neighbor);
      }
    }

    if (queue.length === 0 && filled.size < size) {
      queue.push({
        x: point.x + rng.int(-1, 1),
        y: point.y + rng.int(-1, 1),
      });
    }
  }
}

function isSpecial(type: TileType): boolean {
  return type === 'POND' || type === 'HOUSE' || type === 'TRAIN' || type === 'FACTORY';
}

function placeStructurePoints(
  tiles: TileState[],
  width: number,
  height: number,
  rng: ReturnType<typeof createRng>,
  type: TileType,
  count: number,
  minDistance: number,
  avoid: Point[],
): Point[] {
  const points: Point[] = [];
  const used = new Set<string>();
  const desiredPadding = Math.max(0, Math.min(1, Math.floor((Math.min(width, height) - 1) / 2)));
  const maxDistanceForMap = Math.max(1, Math.floor(Math.min(width, height) / 2));

  let targetDistance = Math.min(minDistance, maxDistanceForMap);
  while (targetDistance >= 0 && points.length < count) {
    let attempts = 0;
    while (points.length < count && attempts < 4000) {
      attempts += 1;
      const candidate = randomPoint(rng, width, height, desiredPadding);
      const key = `${candidate.x},${candidate.y}`;
      if (used.has(key)) {
        continue;
      }

      const idx = tileIndex(width, candidate.x, candidate.y);
      const tile = tiles[idx] as TileState;
      if (isSpecial(tile.type)) {
        continue;
      }

      const existing = [...points, ...avoid];
      if (existing.some((point) => distance(point, candidate) < targetDistance)) {
        continue;
      }

      setTileType(tiles, width, candidate, type);
      points.push(candidate);
      used.add(key);
    }

    if (targetDistance === 0) {
      break;
    }
    targetDistance -= 1;
  }

  if (points.length < count) {
    const fallback: Point[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const key = `${x},${y}`;
        if (used.has(key)) {
          continue;
        }
        const idx = tileIndex(width, x, y);
        if (!isSpecial(tiles[idx]?.type ?? 'GRASS')) {
          fallback.push({ x, y });
        }
      }
    }

    for (let i = fallback.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      [fallback[i], fallback[j]] = [fallback[j] as Point, fallback[i] as Point];
    }

    for (const point of fallback) {
      if (points.length >= count) {
        break;
      }
      setTileType(tiles, width, point, type);
      points.push(point);
      used.add(`${point.x},${point.y}`);
    }
  }

  return points;
}

export interface GeneratedMap {
  width: number;
  height: number;
  playableWidth: number;
  playableHeight: number;
  borderTiles: number;
  tiles: TileState[];
  specialPoints: {
    naturalPonds: Point[];
    houses: Point[];
    train: Point[];
  };
}

function wrapTilesWithBorder(
  playableTiles: TileState[],
  playableWidth: number,
  playableHeight: number,
  borderTiles: number,
): { tiles: TileState[]; width: number; height: number } {
  const width = playableWidth + borderTiles * 2;
  const height = playableHeight + borderTiles * 2;
  const tiles: TileState[] = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return {
      x,
      y,
      type: 'VOID',
      source: 'MAP_GENERATED',
      ownerId: null,
      currentPrice: 0,
    };
  });

  for (const tile of playableTiles) {
    const wrappedX = tile.x + borderTiles;
    const wrappedY = tile.y + borderTiles;
    const wrappedIdx = tileIndex(width, wrappedX, wrappedY);
    tiles[wrappedIdx] = {
      ...tile,
      x: wrappedX,
      y: wrappedY,
    };
  }

  return { tiles, width, height };
}

function offsetPoints(points: Point[], borderTiles: number): Point[] {
  return points.map((point) => ({
    x: point.x + borderTiles,
    y: point.y + borderTiles,
  }));
}

export function generateMap(seed: string, config: GameConfig): GeneratedMap {
  const rng = createRng(seed);
  const { width: playableWidth, height: playableHeight } = config.map;

  const playableTiles: TileState[] = Array.from({ length: playableWidth * playableHeight }, (_, index) => {
    const x = index % playableWidth;
    const y = Math.floor(index / playableWidth);
    return {
      x,
      y,
      type: 'GRASS',
      source: 'MAP_GENERATED',
      ownerId: null,
      currentPrice: config.economy.buyUnownedTileCost,
    };
  });

  for (let y = 0; y < playableHeight; y += 1) {
    for (let x = 0; x < playableWidth; x += 1) {
      if (rng.next() < config.map.forestDensity) {
        const idx = tileIndex(playableWidth, x, y);
        playableTiles[idx] = {
          ...playableTiles[idx],
          type: 'FOREST',
        };
      }
    }
  }

  const naturalPonds = findPointsWithMinDistance(
    rng,
    config.map.naturalPondCount,
    playableWidth,
    playableHeight,
    config.map.pondMinDistance,
  );

  for (const pondCenter of naturalPonds) {
    const size = rng.int(config.map.pondClusterMin, config.map.pondClusterMax);
    paintPondCluster(playableTiles, rng, playableWidth, playableHeight, pondCenter, size);
  }

  const houseDistance = Math.max(2, Math.floor(Math.min(playableWidth, playableHeight) * 0.35));
  const trainDistance = Math.max(3, Math.floor(Math.min(playableWidth, playableHeight) * 0.45));

  const houses = placeStructurePoints(
    playableTiles,
    playableWidth,
    playableHeight,
    rng,
    'HOUSE',
    config.map.housesCount,
    houseDistance,
    naturalPonds,
  );

  const train = placeStructurePoints(
    playableTiles,
    playableWidth,
    playableHeight,
    rng,
    'TRAIN',
    config.map.trainCount,
    trainDistance,
    [...naturalPonds, ...houses],
  );

  const wrapped = wrapTilesWithBorder(playableTiles, playableWidth, playableHeight, MAP_BORDER_TILES);

  return {
    width: wrapped.width,
    height: wrapped.height,
    playableWidth,
    playableHeight,
    borderTiles: MAP_BORDER_TILES,
    tiles: wrapped.tiles,
    specialPoints: {
      naturalPonds: offsetPoints(naturalPonds, MAP_BORDER_TILES),
      houses: offsetPoints(houses, MAP_BORDER_TILES),
      train: offsetPoints(train, MAP_BORDER_TILES),
    },
  };
}
