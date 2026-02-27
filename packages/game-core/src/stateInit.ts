import type { GameConfig } from '@ice-king/config';
import type {
  BotControllerState,
  CameraState,
  GameState,
  PlayerController,
  PlayerState,
} from '@ice-king/shared';
import { generateMap } from './mapGenerator';

export interface InitialPlayerInput {
  id: string;
  name: string;
  color: 'BLUE' | 'RED';
  controller: PlayerController;
}

export interface CreateInitialStateOptions {
  seed: string;
  config: GameConfig;
  players: InitialPlayerInput[];
  nowMs?: number;
  teamByPlayerId?: Record<string, string>;
}

function createPlayerState(input: InitialPlayerInput, config: GameConfig): PlayerState {
  return {
    id: input.id,
    name: input.name,
    color: input.color,
    controller: input.controller,
    money: config.startingMoney,
    ice: config.startingIce,
    blueIce: config.startingBlueIce,
    refrigerators: config.startingRefrigerators,
    connected: true,
    ready: true,
  };
}

function createBotState(playerId: string): BotControllerState {
  return {
    playerId,
    profile: 'TESTER_V1',
    nextDecisionAtMs: 0,
    pendingAction: null,
  };
}

function createCamera(mapWidth: number, mapHeight: number, viewportTiles: number): CameraState {
  return {
    x: Math.floor((mapWidth - viewportTiles) / 2),
    y: Math.floor((mapHeight - viewportTiles) / 2),
    viewportTiles,
  };
}

export function createInitialState(options: CreateInitialStateOptions): GameState {
  const nowMs = options.nowMs ?? 0;
  const { config, players: playerInputs } = options;

  const generated = generateMap(options.seed, config);

  const playerStates = Object.fromEntries(
    playerInputs.map((input) => [input.id, createPlayerState(input, config)]),
  ) as Record<string, PlayerState>;

  const botControllers = Object.fromEntries(
    playerInputs
      .filter((input) => input.controller === 'BOT')
      .map((input) => [input.id, createBotState(input.id)]),
  ) as Record<string, BotControllerState>;

  const cameraByPlayer = Object.fromEntries(
    playerInputs.map((input) => [
      input.id,
      createCamera(generated.width, generated.height, config.map.viewportTiles),
    ]),
  ) as Record<string, CameraState>;

  const selectedTileByPlayer = Object.fromEntries(
    playerInputs.map((input) => [input.id, null]),
  ) as Record<string, { x: number; y: number } | null>;

  const usedByPlayerId = Object.fromEntries(
    playerInputs.map((input) => [input.id, null]),
  ) as Record<string, number | null>;
  const summerSkipVotesByPlayerId = Object.fromEntries(
    playerInputs.map((input) => [input.id, false]),
  ) as Record<string, boolean>;

  return {
    seed: options.seed,
    nowMs,
    width: generated.width,
    height: generated.height,
    tiles: generated.tiles,
    teamByPlayerId: options.teamByPlayerId ?? Object.fromEntries(playerInputs.map((input) => [input.id, input.id])),
    players: playerStates,
    playerOrder: playerInputs.map((input) => input.id),
    summerSkipVotesByPlayerId,
    bots: botControllers,
    season: {
      logicSeason: config.startingSeason,
      cycleStartMs: nowMs,
      cycleDurationMs: config.timing.seasonDurationMs,
      transitionDurationMs: config.timing.transitionDurationMs,
      transitionProgress: 0,
      transitionKeyframeIndex: 0,
      visualFromSeason: config.startingSeason,
      visualToSeason: config.startingSeason === 'SUMMER' ? 'WINTER' : 'SUMMER',
      seasonFlipCount: 0,
    },
    ponds: [],
    factoryJobs: [],
    trainSales: {
      currentYear: 1,
      usedByPlayerId,
    },
    cameraByPlayer,
    reconnect: {
      disconnectedPlayerId: null,
      pausedAtMs: null,
      timeoutAtMs: null,
    },
    selectedTileByPlayer,
    actionLog: [],
    match: {
      startedAtMs: nowMs,
      durationMs: config.timing.matchDurationMs,
      paused: false,
      ended: false,
      winnerId: null,
      overtime: false,
    },
  };
}
