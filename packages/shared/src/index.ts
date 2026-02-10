import { z } from 'zod';

export const PlayerColorSchema = z.enum(['BLUE', 'RED']);
export type PlayerColor = z.infer<typeof PlayerColorSchema>;

export const PlayerControllerSchema = z.enum(['HUMAN', 'BOT']);
export type PlayerController = z.infer<typeof PlayerControllerSchema>;

export const SeasonSchema = z.enum(['SUMMER', 'WINTER']);
export type Season = z.infer<typeof SeasonSchema>;

export const TileTypeSchema = z.enum(['GRASS', 'POND', 'HOUSE', 'FACTORY', 'TRAIN', 'FOREST', 'VOID']);
export type TileType = z.infer<typeof TileTypeSchema>;

export const TileSourceSchema = z.enum(['MAP_GENERATED', 'PLAYER_BUILT']);
export type TileSource = z.infer<typeof TileSourceSchema>;

export const CraftKindSchema = z.enum(['REFRIGERATOR', 'BLUE_ICE']);
export type CraftKind = z.infer<typeof CraftKindSchema>;

export const PondJobStatusSchema = z.enum(['ACTIVE', 'CLAIMABLE', 'CLAIMED']);
export type PondJobStatus = z.infer<typeof PondJobStatusSchema>;

export const FactoryJobStatusSchema = z.enum(['ACTIVE', 'COMPLETE', 'COLLECTED']);
export type FactoryJobStatus = z.infer<typeof FactoryJobStatusSchema>;

export const coordinateSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export interface TileState {
  x: number;
  y: number;
  type: TileType;
  source: TileSource;
  ownerId: string | null;
  currentPrice: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  controller: PlayerController;
  money: number;
  ice: number;
  blueIce: number;
  refrigerators: number;
  connected: boolean;
  ready: boolean;
}

export interface BotPendingAction {
  id: string;
  executeAtMs: number;
  action: GameAction;
}

export interface BotControllerState {
  playerId: string;
  profile: 'TESTER_V1';
  nextDecisionAtMs: number;
  pendingAction: BotPendingAction | null;
}

export interface FactoryCraftJob {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  kind: CraftKind;
  status: FactoryJobStatus;
  startedAtMs: number;
  completesAtMs: number;
  collectedAtMs: number | null;
}

export interface PondHarvestJob {
  id: string;
  pondX: number;
  pondY: number;
  ownerId: string;
  status: PondJobStatus;
  createdAtMs: number;
  claimAtMs: number;
  claimedAtMs: number | null;
}

export interface TrainSaleState {
  currentYear: number;
  usedByPlayerId: Record<string, number | null>;
}

export interface SeasonState {
  logicSeason: Season;
  cycleStartMs: number;
  cycleDurationMs: number;
  transitionDurationMs: number;
  transitionProgress: number;
  transitionKeyframeIndex: number;
  visualFromSeason: Season;
  visualToSeason: Season;
  seasonFlipCount: number;
}

export interface MatchState {
  startedAtMs: number;
  durationMs: number;
  paused: boolean;
  ended: boolean;
  winnerId: string | null;
  overtime: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  viewportTiles: number;
}

export interface ReconnectState {
  disconnectedPlayerId: string | null;
  pausedAtMs: number | null;
  timeoutAtMs: number | null;
}

export interface DebugEvent {
  id: string;
  atMs: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface GameState {
  seed: string;
  nowMs: number;
  width: number;
  height: number;
  tiles: TileState[];
  players: Record<string, PlayerState>;
  playerOrder: string[];
  bots: Record<string, BotControllerState>;
  season: SeasonState;
  ponds: PondHarvestJob[];
  factoryJobs: FactoryCraftJob[];
  trainSales: TrainSaleState;
  cameraByPlayer: Record<string, CameraState>;
  reconnect: ReconnectState;
  selectedTileByPlayer: Record<string, { x: number; y: number } | null>;
  actionLog: DebugEvent[];
  match: MatchState;
}

export interface NetWorthBreakdown {
  playerId: string;
  value: number;
  money: number;
  iceValue: number;
  blueIceValue: number;
  refrigeratorValue: number;
  ownedTileValue: number;
}

export interface ActionSuccess<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  ok: true;
  code: 'OK';
  message: string;
  payload: TPayload;
}

export interface ActionFailure {
  ok: false;
  code:
    | 'INVALID_PLAYER'
    | 'INVALID_TILE'
    | 'NOT_OWNER'
    | 'ALREADY_OWNER'
    | 'INSUFFICIENT_FUNDS'
    | 'INSUFFICIENT_ICE'
    | 'INVALID_ACTION'
    | 'WRONG_SEASON'
    | 'ALREADY_ACTIVE'
    | 'NOT_CLAIMABLE'
    | 'LIMIT_REACHED'
    | 'MATCH_ENDED';
  message: string;
}

export type ActionResult<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  | ActionSuccess<TPayload>
  | ActionFailure;

const gameActionBase = z.object({
  playerId: z.string().min(1),
});

export const GameActionSchema = z.discriminatedUnion('type', [
  gameActionBase.extend({ type: z.literal('tile.buy'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('tile.buyFromPlayer'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('tile.buildFactory'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('tile.buildManMadePond'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('pond.harvest.start'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('pond.harvest.claim'), pondJobId: z.string().min(1) }),
  gameActionBase.extend({ type: z.literal('structure.house.sellIce'), ...coordinateSchema.shape, quantity: z.number().int().positive() }),
  gameActionBase.extend({ type: z.literal('structure.house.sellBlueIce'), ...coordinateSchema.shape, quantity: z.number().int().positive() }),
  gameActionBase.extend({ type: z.literal('structure.factory.craftRefrigerator'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('structure.factory.craftBlueIce'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('structure.train.sellAnnualShipment'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('camera.move'), x: z.number(), y: z.number() }),
  gameActionBase.extend({ type: z.literal('tile.select'), ...coordinateSchema.shape }),
  gameActionBase.extend({ type: z.literal('player.forfeit') }),
]);

export type GameAction = z.infer<typeof GameActionSchema>;

export interface GameSystem {
  id: string;
  init(state: GameState): void;
  onTick(state: GameState, nowMs: number): void;
  handleAction(state: GameState, action: GameAction): ActionResult | null;
}

export interface ThemeManifest {
  id: string;
  displayName: string;
  tileSprites: Record<string, string>;
  uiSprites: Record<string, string>;
  paletteTokens: Record<string, string>;
  seasonTransitionFrames: Record<'SUMMER_TO_WINTER' | 'WINTER_TO_SUMMER', string[]>;
}

export interface RenderTileInfo {
  tileType: TileType;
  ownerColor: PlayerColor | null;
  isHovered: boolean;
  isSelected: boolean;
  seasonBlendProgress: number;
}
