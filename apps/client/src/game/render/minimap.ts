import { themePalette } from '@ice-king/theme-default';
import type { GameState } from '@ice-king/shared';
import type { CameraChangeHandler, IMinimapController } from '../types';

interface PlayableBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function tileColor(state: GameState, x: number, y: number): string {
  const tile = state.tiles[y * state.width + x];
  if (!tile) {
    return '#000';
  }

  switch (tile.type) {
    case 'GRASS':
      return '#48b948';
    case 'FOREST':
      return '#2f7d2d';
    case 'POND':
      return '#3e95d6';
    case 'HOUSE':
      return '#d99d5b';
    case 'FACTORY':
      return '#9c748a';
    case 'TRAIN':
      return '#4a4f59';
    case 'VOID':
      return '#00000000';
    default:
      return '#4a8750';
  }
}

function tileOwnershipCheckColor(state: GameState, x: number, y: number): string | null {
  const tile = state.tiles[y * state.width + x];
  if (!tile?.ownerId) {
    return null;
  }

  const owner = state.players[tile.ownerId];
  if (owner?.color === 'BLUE') {
    return themePalette.ownershipBlue;
  }
  if (owner?.color === 'RED') {
    return themePalette.ownershipRed;
  }
  return null;
}

function drawOwnershipCheckmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  checkColor: string,
): void {
  const tileSize = Math.max(1, Math.min(w, h));
  const checkWidth = Math.max(2, Math.floor(tileSize * 0.34));

  // Dark under-stroke keeps the check readable on bright or saturated terrain colors.
  ctx.strokeStyle = '#14202c';
  ctx.lineWidth = checkWidth + 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + Math.floor(w * 0.18), y + Math.floor(h * 0.56));
  ctx.lineTo(x + Math.floor(w * 0.42), y + Math.floor(h * 0.78));
  ctx.lineTo(x + Math.floor(w * 0.84), y + Math.floor(h * 0.24));
  ctx.stroke();

  ctx.strokeStyle = checkColor;
  ctx.lineWidth = checkWidth;
  ctx.beginPath();
  ctx.moveTo(x + Math.floor(w * 0.18), y + Math.floor(h * 0.56));
  ctx.lineTo(x + Math.floor(w * 0.42), y + Math.floor(h * 0.78));
  ctx.lineTo(x + Math.floor(w * 0.84), y + Math.floor(h * 0.24));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

function playableBounds(state: GameState): PlayableBounds {
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

export class MinimapController implements IMinimapController {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onCameraChange: CameraChangeHandler;
  private dragging = false;
  private latestState: GameState | null = null;
  private latestPlayerId = '';

  constructor(canvas: HTMLCanvasElement, onCameraChange: CameraChangeHandler) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Minimap context unavailable.');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.onCameraChange = onCameraChange;

    this.canvas.width = 220;
    this.canvas.height = 220;

    this.canvas.addEventListener('pointerdown', this.handleDown);
    this.canvas.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
  }

  private handleDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.applyPointer(event);
  };

  private handleMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.applyPointer(event);
  };

  private handleUp = (): void => {
    this.dragging = false;
  };

  private applyPointer(event: PointerEvent): void {
    const state = this.latestState;
    if (!state || !this.latestPlayerId) {
      return;
    }
    const bounds = playableBounds(state);

    const rect = this.canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

    const normalizedX = Math.max(0, Math.min(0.999999, relX / Math.max(1, rect.width)));
    const normalizedY = Math.max(0, Math.min(0.999999, relY / Math.max(1, rect.height)));
    const tileX = bounds.minX + Math.floor(normalizedX * bounds.width);
    const tileY = bounds.minY + Math.floor(normalizedY * bounds.height);
    const camera = state.cameraByPlayer[this.latestPlayerId];

    const nextX = Math.max(
      0,
      Math.min(state.width - camera.viewportTiles, tileX - Math.floor(camera.viewportTiles / 2)),
    );
    const nextY = Math.max(
      0,
      Math.min(state.height - camera.viewportTiles, tileY - Math.floor(camera.viewportTiles / 2)),
    );

    this.onCameraChange(nextX, nextY);
  }

  draw(state: GameState, activePlayerId: string): void {
    this.latestState = state;
    this.latestPlayerId = activePlayerId;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const bounds = playableBounds(state);
    const sx = width / bounds.width;
    const sy = height / bounds.height;

    this.ctx.clearRect(0, 0, width, height);

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const tile = state.tiles[y * state.width + x];
        if (!tile || tile.type === 'VOID') {
          continue;
        }

        const localX = x - bounds.minX;
        const localY = y - bounds.minY;
        const tileX = Math.floor(localX * sx);
        const tileY = Math.floor(localY * sy);
        const tileW = Math.max(1, Math.ceil(sx));
        const tileH = Math.max(1, Math.ceil(sy));
        this.ctx.fillStyle = tileColor(state, x, y);
        this.ctx.fillRect(tileX, tileY, tileW, tileH);

        const ownershipCheck = tileOwnershipCheckColor(state, x, y);
        if (ownershipCheck) {
          drawOwnershipCheckmark(this.ctx, tileX, tileY, tileW, tileH, ownershipCheck);
        }
      }
    }

    const camera = state.cameraByPlayer[activePlayerId];
    this.ctx.strokeStyle = '#ff4242';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      Math.floor((camera.x - bounds.minX) * sx),
      Math.floor((camera.y - bounds.minY) * sy),
      Math.ceil(camera.viewportTiles * sx),
      Math.ceil(camera.viewportTiles * sy),
    );

    this.ctx.strokeStyle = themePalette.uiBorder;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(0, 0, width, height);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
  }
}
