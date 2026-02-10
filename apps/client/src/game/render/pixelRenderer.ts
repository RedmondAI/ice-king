import type { GameState, TileState } from '@ice-king/shared';
import { themePalette } from '@ice-king/theme-default';
import { getViewportInfo, TILE_SIZE } from '../view';
import { TileArtLibrary } from './tileArt';
import progressJobFrameUrl from '../../assets/ui/progress-job-frame.png';
import {
  JOB_OVERLAY_HEIGHT,
  JOB_OVERLAY_WIDTH,
  JOB_TEXT_PADDING_LEFT,
  JOB_TEXT_PADDING_TOP,
  computeJobOverlayActionRect,
  computeJobOverlayPanelPosition,
} from './jobOverlayLayout';

export interface RenderSceneInput {
  state: GameState;
  activePlayerId: string;
  hoveredTile: { x: number; y: number } | null;
  nowMs: number;
}

const TILE_OUTLINE_WIDTH = 6;
const JOB_PROGRESS_CHUNKS = 10;

function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawFallbackTile(ctx: CanvasRenderingContext2D, tile: TileState, x: number, y: number): void {
  let base = '#4a8750';
  if (tile.type === 'POND') {
    base = '#3e95d6';
  } else if (tile.type === 'FOREST') {
    base = '#2f7d2d';
  } else if (tile.type === 'VOID') {
    base = '#4d5c54';
  } else if (tile.type === 'HOUSE') {
    base = '#d99d5b';
  } else if (tile.type === 'FACTORY') {
    base = '#9c748a';
  } else if (tile.type === 'TRAIN') {
    base = '#f0b35a';
  }
  drawPixelRect(ctx, x, y, TILE_SIZE, TILE_SIZE, base);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatDurationMs(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = (clamped % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

type TileJobOverlayMode = 'ACTIVE' | 'POND_CLAIMABLE';

interface TileJobOverlay {
  worldX: number;
  worldY: number;
  label: string;
  remainingMs: number;
  progress: number;
  mode: TileJobOverlayMode;
  pondJobId?: string;
}

function collectJobOverlays(state: GameState, activePlayerId: string): TileJobOverlay[] {
  const overlays: TileJobOverlay[] = [];

  for (const pondJob of state.ponds) {
    if (pondJob.status === 'ACTIVE') {
      const totalMs = Math.max(1, pondJob.claimAtMs - pondJob.createdAtMs);
      const elapsedMs = Math.max(0, state.nowMs - pondJob.createdAtMs);
      overlays.push({
        worldX: pondJob.pondX,
        worldY: pondJob.pondY,
        label: 'Harvesting Ice',
        remainingMs: Math.max(0, pondJob.claimAtMs - state.nowMs),
        progress: clamp01(elapsedMs / totalMs),
        mode: 'ACTIVE',
      });
      continue;
    }

    if (pondJob.status === 'CLAIMABLE' && pondJob.ownerId === activePlayerId) {
      overlays.push({
        worldX: pondJob.pondX,
        worldY: pondJob.pondY,
        label: 'Ice Ready',
        remainingMs: 0,
        progress: 1,
        mode: 'POND_CLAIMABLE',
        pondJobId: pondJob.id,
      });
    }
  }

  for (const factoryJob of state.factoryJobs) {
    if (factoryJob.status !== 'ACTIVE') {
      continue;
    }
    const totalMs = Math.max(1, factoryJob.completesAtMs - factoryJob.startedAtMs);
    const elapsedMs = Math.max(0, state.nowMs - factoryJob.startedAtMs);
    overlays.push({
      worldX: factoryJob.x,
      worldY: factoryJob.y,
      label: factoryJob.kind === 'REFRIGERATOR' ? 'Crafting Fridge' : 'Crafting Blue Ice',
      remainingMs: Math.max(0, factoryJob.completesAtMs - state.nowMs),
      progress: clamp01(elapsedMs / totalMs),
      mode: 'ACTIVE',
    });
  }

  return overlays;
}

function drawPixelPanelFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#f6e7c8';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#6b4f2a';
  ctx.fillRect(x, y, width, 3);
  ctx.fillRect(x, y + height - 3, width, 3);
  ctx.fillRect(x, y, 3, height);
  ctx.fillRect(x + width - 3, y, 3, height);
}

function drawChunkedProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
): void {
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(x, y, width, height);

  const clamped = clamp01(progress);
  const chunkGap = 2;
  const usableWidth = width - (JOB_PROGRESS_CHUNKS - 1) * chunkGap;
  const chunkWidth = Math.max(1, Math.floor(usableWidth / JOB_PROGRESS_CHUNKS));
  const filledChunks =
    clamped >= 0.999 ? JOB_PROGRESS_CHUNKS : Math.floor(clamped * JOB_PROGRESS_CHUNKS + 1e-6);

  for (let i = 0; i < JOB_PROGRESS_CHUNKS; i += 1) {
    const chunkX = x + i * (chunkWidth + chunkGap);
    ctx.fillStyle = i < filledChunks ? '#78d42b' : '#4a5d33';
    ctx.fillRect(chunkX, y + 2, chunkWidth, height - 4);
  }

  ctx.fillStyle = '#20271a';
  ctx.fillRect(x, y, width, 2);
  ctx.fillRect(x, y + height - 2, width, 2);
  ctx.fillRect(x, y, 2, height);
  ctx.fillRect(x + width - 2, y, 2, height);
}

function drawJobActionButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(width);
  const ih = Math.round(height);

  // Pixel button styling to match `.pixel-button` (small, canvas-friendly).
  ctx.fillStyle = '#5f4624';
  ctx.fillRect(ix, iy, iw, ih);

  const border = 2;
  const innerX = ix + border;
  const innerY = iy + border;
  const innerW = Math.max(0, iw - border * 2);
  const innerH = Math.max(0, ih - border * 2);
  const split = Math.max(1, Math.floor(innerH / 2));

  ctx.fillStyle = '#ffe9af';
  ctx.fillRect(innerX, innerY, innerW, split);
  ctx.fillStyle = '#eac985';
  ctx.fillRect(innerX, innerY + split, innerW, Math.max(0, innerH - split));

  ctx.font = '8px PressStart2P, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#3e2723';
  ctx.fillText(label, ix + iw / 2, iy + ih / 2 + 0.5);
}

function drawJobOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TileJobOverlay,
  px: number,
  py: number,
  panelFrame: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { x: panelX, y: panelY } = computeJobOverlayPanelPosition(px, py, canvasWidth, canvasHeight);

  if (panelFrame.complete && panelFrame.naturalWidth > 0 && panelFrame.naturalHeight > 0) {
    ctx.drawImage(panelFrame, panelX, panelY, JOB_OVERLAY_WIDTH, JOB_OVERLAY_HEIGHT);
  } else {
    drawPixelPanelFallback(ctx, panelX, panelY, JOB_OVERLAY_WIDTH, JOB_OVERLAY_HEIGHT);
  }

  ctx.font = '10px PressStart2P, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3e2723';
  ctx.fillText(overlay.label, panelX + JOB_TEXT_PADDING_LEFT, panelY + JOB_TEXT_PADDING_TOP);

  const secondLine = overlay.mode === 'POND_CLAIMABLE' ? 'Ready to collect' : `${formatDurationMs(overlay.remainingMs)} left`;
  ctx.fillText(secondLine, panelX + JOB_TEXT_PADDING_LEFT, panelY + JOB_TEXT_PADDING_TOP + 15);

  const actionRect = computeJobOverlayActionRect(panelX, panelY);
  if (overlay.mode === 'POND_CLAIMABLE') {
    drawJobActionButton(ctx, actionRect.x, actionRect.y, actionRect.w, actionRect.h, 'Collect Ice');
  } else {
    drawChunkedProgressBar(ctx, actionRect.x, actionRect.y, actionRect.w, actionRect.h, overlay.progress);
  }
}

function drawOwnershipOutline(
  ctx: CanvasRenderingContext2D,
  tile: TileState,
  state: GameState,
  x: number,
  y: number,
): void {
  if (!tile.ownerId) {
    return;
  }
  if (tile.type === 'VOID') {
    return;
  }

  const owner = state.players[tile.ownerId];
  const color = owner?.color === 'BLUE' ? themePalette.ownershipBlue : themePalette.ownershipRed;
  const inset = TILE_OUTLINE_WIDTH / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = TILE_OUTLINE_WIDTH;
  ctx.strokeRect(
    x + inset,
    y + inset,
    TILE_SIZE - TILE_OUTLINE_WIDTH,
    TILE_SIZE - TILE_OUTLINE_WIDTH,
  );
}

function drawHoverAndSelection(
  ctx: CanvasRenderingContext2D,
  tile: TileState,
  hoveredTile: { x: number; y: number } | null,
  selectedTile: { x: number; y: number } | null,
  x: number,
  y: number,
): void {
  if (hoveredTile && tile.x === hoveredTile.x && tile.y === hoveredTile.y && !tile.ownerId) {
    if (tile.type === 'VOID') {
      return;
    }
    const hoverInset = TILE_OUTLINE_WIDTH / 2;
    ctx.strokeStyle = themePalette.highlightYellow;
    ctx.lineWidth = TILE_OUTLINE_WIDTH;
    ctx.strokeRect(
      x + hoverInset,
      y + hoverInset,
      TILE_SIZE - TILE_OUTLINE_WIDTH,
      TILE_SIZE - TILE_OUTLINE_WIDTH,
    );
  }

  if (selectedTile && tile.x === selectedTile.x && tile.y === selectedTile.y) {
    if (tile.type === 'VOID') {
      return;
    }
    const selectedInset = TILE_OUTLINE_WIDTH / 2;
    ctx.strokeStyle = '#f6f9ff';
    ctx.lineWidth = TILE_OUTLINE_WIDTH;
    ctx.strokeRect(
      x + selectedInset,
      y + selectedInset,
      TILE_SIZE - TILE_OUTLINE_WIDTH,
      TILE_SIZE - TILE_OUTLINE_WIDTH,
    );
  }
}

function transitionFrameIndex(state: GameState): number {
  const kf = Math.max(0, Math.min(8, state.season.transitionKeyframeIndex));
  // Transition sheets are authored as WINTER -> SUMMER.
  return state.season.logicSeason === 'WINTER' ? kf : 8 - kf;
}

function drawSeasonAtmosphere(ctx: CanvasRenderingContext2D, input: RenderSceneInput): void {
  const { state, nowMs } = input;
  const viewport = getViewportInfo(state, input.activePlayerId);
  const t = state.season.transitionProgress;
  const toWinter = state.season.logicSeason === 'SUMMER';
  const snowiness = toWinter ? t : 1 - t;

  if (snowiness <= 0.05) {
    return;
  }

  const flakes = Math.round(40 * snowiness);
  for (let i = 0; i < flakes; i += 1) {
    const seed = i * 8137;
    const fx = (seed * 17 + nowMs * 0.07) % viewport.canvasWidth;
    const fy = (seed * 23 + nowMs * 0.11) % viewport.canvasHeight;
    drawPixelRect(ctx, fx, fy, 2, 2, '#eaf6ff');
  }
}

export class PixelRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tileArt: TileArtLibrary;
  private readonly progressJobFrame: HTMLImageElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable.');
    }

    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.tileArt = new TileArtLibrary();
    this.progressJobFrame = new Image();
    this.progressJobFrame.src = progressJobFrameUrl;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(input: RenderSceneInput): void {
    const { state, activePlayerId, hoveredTile } = input;
    const viewport = getViewportInfo(state, activePlayerId);
    const selected = state.selectedTileByPlayer[activePlayerId];
    const frameIndex = transitionFrameIndex(state);
    const cameraTileX = Math.floor(viewport.cameraX);
    const cameraTileY = Math.floor(viewport.cameraY);
    const cameraOffsetX = Math.round((viewport.cameraX - cameraTileX) * TILE_SIZE);
    const cameraOffsetY = Math.round((viewport.cameraY - cameraTileY) * TILE_SIZE);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const backgroundTile = this.tileArt.frameFor('GRASS', frameIndex);
    if (backgroundTile) {
      for (let y = -1; y <= viewport.viewportTiles; y += 1) {
        const py = y * TILE_SIZE - cameraOffsetY;
        for (let x = -1; x <= viewport.viewportTiles; x += 1) {
          const px = x * TILE_SIZE - cameraOffsetX;
          this.ctx.drawImage(backgroundTile, px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    for (let y = -1; y <= viewport.viewportTiles; y += 1) {
      for (let x = -1; x <= viewport.viewportTiles; x += 1) {
        const worldX = cameraTileX + x;
        const worldY = cameraTileY + y;
        if (worldX < 0 || worldY < 0 || worldX >= state.width || worldY >= state.height) {
          continue;
        }

        const tile = state.tiles[worldY * state.width + worldX];
        const px = x * TILE_SIZE - cameraOffsetX;
        const py = y * TILE_SIZE - cameraOffsetY;

        if (!tile) {
          continue;
        }

        const frame = this.tileArt.frameFor(tile.type, frameIndex);
        if (frame) {
          this.ctx.drawImage(frame, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          drawFallbackTile(this.ctx, tile, px, py);
        }

        drawOwnershipOutline(this.ctx, tile, state, px, py);
        drawHoverAndSelection(this.ctx, tile, hoveredTile, selected, px, py);
      }
    }

    const activeJobOverlays = collectJobOverlays(state, activePlayerId);
    for (const overlay of activeJobOverlays) {
      const localX = (overlay.worldX - cameraTileX) * TILE_SIZE - cameraOffsetX;
      const localY = (overlay.worldY - cameraTileY) * TILE_SIZE - cameraOffsetY;
      if (
        localX < -TILE_SIZE ||
        localY < -TILE_SIZE ||
        localX > this.canvas.width ||
        localY > this.canvas.height
      ) {
        continue;
      }
      drawJobOverlay(
        this.ctx,
        overlay,
        localX,
        localY,
        this.progressJobFrame,
        this.canvas.width,
        this.canvas.height,
      );
    }

    drawSeasonAtmosphere(this.ctx, input);
  }
}
