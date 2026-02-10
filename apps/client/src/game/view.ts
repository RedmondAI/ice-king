import type { GameState, TileState } from '@ice-king/shared';

// Match on-screen tile draw size to the new 256x256 art assets.
export const BASE_TILE_SIZE = 256;
export const TILE_SCALE = 1;
export const TILE_SIZE = BASE_TILE_SIZE * TILE_SCALE;

export interface ViewportInfo {
  cameraX: number;
  cameraY: number;
  viewportTiles: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function getViewportInfo(state: GameState, playerId: string): ViewportInfo {
  const camera = state.cameraByPlayer[playerId];
  const viewportTiles = camera.viewportTiles;
  return {
    cameraX: camera.x,
    cameraY: camera.y,
    viewportTiles,
    canvasWidth: viewportTiles * TILE_SIZE,
    canvasHeight: viewportTiles * TILE_SIZE,
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
): { x: number; y: number } | null {
  const viewport = getViewportInfo(state, playerId);
  const localX = canvasX / TILE_SIZE;
  const localY = canvasY / TILE_SIZE;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= viewport.viewportTiles ||
    localY >= viewport.viewportTiles
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
): { x: number; y: number } {
  const viewport = getViewportInfo(state, playerId);
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
