import type { ActionResult, GameAction, GameState, TileState } from '@ice-king/shared';

export interface RuntimeOutcome {
  winnerName: string | null;
  reason: string;
}

export interface RuntimeInit {
  mount: HTMLElement;
  humanPlayerName: string;
  roomCode: string;
  opponentType: 'HUMAN' | 'BOT';
  configMode: 'PROD' | 'DEV_FAST';
  onExit: (outcome: RuntimeOutcome) => void;
}

export interface ScreenCoordinates {
  x: number;
  y: number;
}

export interface ViewportTile {
  tile: TileState;
  screenX: number;
  screenY: number;
}

export interface RuntimeActionDispatch {
  (action: GameAction): ActionResult;
}

export interface CameraChangeHandler {
  (x: number, y: number): void;
}

export interface IMinimapController {
  canvas: HTMLCanvasElement;
  draw(state: GameState, activePlayerId: string): void;
  destroy(): void;
}
