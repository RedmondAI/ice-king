import { TILE_SIZE } from '../view';

export const JOB_OVERLAY_WIDTH = Math.min(236, TILE_SIZE - 18);
export const JOB_OVERLAY_HEIGHT = 66;
export const JOB_OVERLAY_PADDING = 8;
export const JOB_PANEL_OFFSET_Y = 10;

// Extra left padding so the job overlay text doesn't crowd/clamp into the frame.
export const JOB_TEXT_PADDING_LEFT = 59;
export const JOB_TEXT_PADDING_TOP = 8;

// Keep the progress/action area inset from the frame so the button text isn't clipped.
export const JOB_ACTION_X = 24;
export const JOB_ACTION_Y = JOB_OVERLAY_HEIGHT - 20;
export const JOB_ACTION_W = JOB_OVERLAY_WIDTH - JOB_ACTION_X - 11;
export const JOB_ACTION_H = 11;

export interface JobOverlayPanelPosition {
  x: number;
  y: number;
}

export interface JobOverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeJobOverlayPanelPosition(
  tileScreenX: number,
  tileScreenY: number,
  canvasWidth: number,
  canvasHeight: number,
): JobOverlayPanelPosition {
  const unclampedX = tileScreenX + (TILE_SIZE - JOB_OVERLAY_WIDTH) / 2;
  const unclampedY = tileScreenY + JOB_PANEL_OFFSET_Y;
  const maxX = Math.max(JOB_OVERLAY_PADDING, canvasWidth - JOB_OVERLAY_WIDTH - JOB_OVERLAY_PADDING);
  const maxY = Math.max(JOB_OVERLAY_PADDING, canvasHeight - JOB_OVERLAY_HEIGHT - JOB_OVERLAY_PADDING);

  return {
    x: Math.round(Math.max(JOB_OVERLAY_PADDING, Math.min(maxX, unclampedX))),
    y: Math.round(Math.max(JOB_OVERLAY_PADDING, Math.min(maxY, unclampedY))),
  };
}

export function computeJobOverlayActionRect(panelX: number, panelY: number): JobOverlayRect {
  return {
    x: panelX + JOB_ACTION_X,
    y: panelY + JOB_ACTION_Y,
    w: JOB_ACTION_W,
    h: JOB_ACTION_H,
  };
}

export function pointInRect(pointX: number, pointY: number, rect: JobOverlayRect): boolean {
  return pointX >= rect.x && pointX <= rect.x + rect.w && pointY >= rect.y && pointY <= rect.y + rect.h;
}
