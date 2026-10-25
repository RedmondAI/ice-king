import type { GameState, TileState } from '@ice-king/shared';

// Match on-screen tile draw size to the new 256x256 art assets.
export const BASE_TILE_SIZE = 256;
export const TILE_SCALE = 1;
export const TILE_SIZE = BASE_TILE_SIZE * TILE_SCALE;

export interface ViewportInfo {
  cameraX: number;
  cameraY: number;
  viewportTilesX: number;
  viewportTilesY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface PlayableBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const playableBoundsCache = new WeakMap<GameState['tiles'], PlayableBounds>();

/** Bounding box of non-VOID tiles (maps carry a VOID border ring). */
export function playableBounds(state: GameState): PlayableBounds {
  const cached = playableBoundsCache.get(state.tiles);
  if (cached) {
    return cached;
  }
  const bounds = computePlayableBounds(state);
  playableBoundsCache.set(state.tiles, bounds);
  return bounds;
}

function computePlayableBounds(state: GameState): PlayableBounds {
  let minX = state.width - 1;
  let minY = state.height - 1;
  let maxX = 0;
  let maxY = 0;
  let foundPlayable = false;

  for (const tile of state.tiles) {
    if (tile.type === 'VOID') {
      continue;
    }
    foundPlayable = true;
    if (tile.x < minX) {
      minX = tile.x;
    }
    if (tile.y < minY) {
      minY = tile.y;
    }
    if (tile.x > maxX) {
      maxX = tile.x;
    }
    if (tile.y > maxY) {
      maxY = tile.y;
    }
  }

  if (!foundPlayable) {
    return {
      minX: 0,
      minY: 0,
      maxX: state.width - 1,
      maxY: state.height - 1,
      width: state.width,
      height: state.height,
    };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * The camera's `viewportTiles` sets how many tiles span the short side of the screen;
 * the long side shows proportionally more so the map fills a non-square stage.
 * If that would run past the playable area, zoom in until it fits.
 */
export function visibleTileSpan(
  state: GameState,
  viewportTiles: number,
  viewAspect: number,
): { tilesX: number; tilesY: number } {
  const aspect = Number.isFinite(viewAspect) && viewAspect > 0 ? viewAspect : 1;
  let tilesX = aspect >= 1 ? viewportTiles * aspect : viewportTiles;
  let tilesY = aspect >= 1 ? viewportTiles : viewportTiles / aspect;

  const bounds = playableBounds(state);
  const fit = Math.min(1, bounds.width / tilesX, bounds.height / tilesY);
  tilesX *= fit;
  tilesY *= fit;
  return { tilesX, tilesY };
}

function clampAxis(origin: number, min: number, span: number, visibleTiles: number): number {
  if (visibleTiles >= span) {
    // Whole playable axis fits on screen: center it.
    return min + (span - visibleTiles) / 2;
  }
  return Math.max(min, Math.min(min + span - visibleTiles, origin));
}

/** Clamp a view origin so the visible span stays inside the playable area. */
export function clampViewOrigin(
  state: GameState,
  x: number,
  y: number,
  tilesX: number,
  tilesY: number,
): { x: number; y: number } {
  const bounds = playableBounds(state);
  return {
    x: clampAxis(x, bounds.minX, bounds.width, tilesX),
    y: clampAxis(y, bounds.minY, bounds.height, tilesY),
  };
}

export function getViewportInfo(state: GameState, playerId: string, viewAspect = 1): ViewportInfo {
  const camera = state.cameraByPlayer[playerId];
  const { tilesX, tilesY } = visibleTileSpan(state, camera.viewportTiles, viewAspect);
  const origin = clampViewOrigin(state, camera.x, camera.y, tilesX, tilesY);
  return {
    cameraX: origin.x,
    cameraY: origin.y,
    viewportTilesX: tilesX,
    viewportTilesY: tilesY,
    canvasWidth: Math.round(tilesX * TILE_SIZE),
    canvasHeight: Math.round(tilesY * TILE_SIZE),
  };
}

export function tileAt(state: GameState, x: number, y: number): TileState | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return null;
  }

  return state.tiles[y * state.width + x] ?? null;
}

export function screenToTile(
  state: GameState,
  playerId: string,
  canvasX: number,
  canvasY: number,
  viewAspect = 1,
): { x: number; y: number } | null {
  const viewport = getViewportInfo(state, playerId, viewAspect);
  const localX = canvasX / TILE_SIZE;
  const localY = canvasY / TILE_SIZE;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= viewport.viewportTilesX ||
    localY >= viewport.viewportTilesY
  ) {
    return null;
  }
  return {
    x: Math.floor(viewport.cameraX + localX),
    y: Math.floor(viewport.cameraY + localY),
  };
}

export function tileToScreen(
  state: GameState,
  playerId: string,
  tileX: number,
  tileY: number,
  viewAspect = 1,
): { x: number; y: number } {
  const viewport = getViewportInfo(state, playerId, viewAspect);
  return {
    x: (tileX - viewport.cameraX) * TILE_SIZE,
    y: (tileY - viewport.cameraY) * TILE_SIZE,
  };
}

export function hashCoord(x: number, y: number, salt = 0): number {
  let h = x * 374761393 + y * 668265263 + salt * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}
