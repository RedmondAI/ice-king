import type { ActionResult, GameAction, GameState, TileState } from '@ice-king/shared';
import type { MultiplayerSession } from '../multiplayer/client';

export type GameMode =
  | 'PLAY_VS_COMPUTER'
  | 'PLAY_ONLINE'
  | 'SOLO'
  | 'FRIENDLY'
  | 'TEAM'
  | 'ICE_WARS';

export type RuntimeOpponentType = 'HUMAN' | 'BOT' | 'NONE';

export interface RuntimeOutcome {
  winnerName: string | null;
  reason: string;
  playerMoney: number;
  winnerId: string | null;
}

export interface RuntimeInit {
  mount: HTMLElement;
  humanPlayerName: string;
  roomCode: string;
  opponentType: RuntimeOpponentType;
  gameMode: GameMode;
  configMode: 'PROD' | 'DEV_FAST';
  multiplayerSession?: MultiplayerSession;
  initialState?: GameState | null;
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
