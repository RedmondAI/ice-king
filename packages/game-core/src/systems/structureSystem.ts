import type { GameConfig } from '@ice-king/config';
import type { ActionResult, CraftKind, GameState } from '@ice-king/shared';
import { addLog, createId, getTile, inBounds } from '../helpers';
import { canBuildOnTile } from './economySystem';
import { isTileOwnedByPlayerOrTeammate } from '../helpers';

const SUMMER_HOUSE_SALE_MESSAGE = 'you have to waint until summer to sell the ice';

function assertPlayer(state: GameState, playerId: string): ActionResult | null {
  if (!state.players[playerId]) {
    return { ok: false, code: 'INVALID_PLAYER', message: 'Player does not exist.' };
  }
  if (state.match.ended) {
    return { ok: false, code: 'MATCH_ENDED', message: 'Match has already ended.' };
  }
  return null;
}

function assertHouseSaleSeason(state: GameState): ActionResult | null {
  if (state.season.logicSeason !== 'SUMMER') {
    return { ok: false, code: 'WRONG_SEASON', message: SUMMER_HOUSE_SALE_MESSAGE };
  }
  return null;
}

function assertOwnedTileType(
  state: GameState,
  playerId: string,
  x: number,
  y: number,
  expected: 'HOUSE' | 'FACTORY' | 'TRAIN',
): ActionResult | null {
  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);
  if (!isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return { ok: false, code: 'NOT_OWNER', message: 'Player must own this tile.' };
  }

  if (tile.type !== expected) {
    return { ok: false, code: 'INVALID_ACTION', message: `Tile is not ${expected}.` };
  }

  return null;
}

export function buildFactory(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);
  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;
  if (!canBuildOnTile(state, tile, playerId)) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: 'Factory can only be built on owned empty grass/forest tiles.',
    };
  }

  if (player.money < config.economy.buildFactoryMoneyCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money to build a factory.' };
  }

  if (player.ice < config.economy.buildFactoryIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough ice to build a factory.' };
  }

  player.money -= config.economy.buildFactoryMoneyCost;
  player.ice -= config.economy.buildFactoryIceCost;
  tile.type = 'FACTORY';
  tile.source = 'PLAYER_BUILT';

  addLog(state, 'tile.factoryBuilt', { playerId, x, y });

  return {
    ok: true,
    code: 'OK',
    message: 'Factory built.',
    payload: { x, y, type: 'FACTORY' },
  };
}

export function buildManMadePond(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);
  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;
  if (!canBuildOnTile(state, tile, playerId)) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: 'Man-made pond can only be built on owned empty grass/forest tiles.',
    };
  }

  if (player.money < config.economy.buildManMadePondMoneyCost) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Not enough money to build a man-made pond.',
    };
  }

  if (player.ice < config.economy.buildManMadePondIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough ice to build a man-made pond.' };
  }

  player.money -= config.economy.buildManMadePondMoneyCost;
  player.ice -= config.economy.buildManMadePondIceCost;
  tile.type = 'POND';
  tile.source = 'PLAYER_BUILT';

  addLog(state, 'tile.manMadePondBuilt', { playerId, x, y });

  return {
    ok: true,
    code: 'OK',
    message: 'Man-made pond built.',
    payload: { x, y, type: 'POND' },
  };
}

export function sellIceAtHouse(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
  quantity: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  const ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, 'HOUSE');
  if (ownedTypeCheck) {
    return ownedTypeCheck;
  }

  const seasonCheck = assertHouseSaleSeason(state);
  if (seasonCheck) {
    return seasonCheck;
  }

  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Quantity must be a positive integer.' };
  }

  if (player.ice < quantity) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough regular ice to sell.' };
  }

  player.ice -= quantity;
  const moneyGained = quantity * config.economy.houseSellIcePrice;
  player.money += moneyGained;

  addLog(state, 'house.sellIce', { playerId, quantity, moneyGained, x, y });

  return {
    ok: true,
    code: 'OK',
    message: 'Regular ice sold at house.',
    payload: {
      quantity,
      moneyGained,
    },
  };
}

export function sellBlueIceAtHouse(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
  quantity: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  const ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, 'HOUSE');
  if (ownedTypeCheck) {
    return ownedTypeCheck;
  }

  const seasonCheck = assertHouseSaleSeason(state);
  if (seasonCheck) {
    return seasonCheck;
  }

  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Quantity must be a positive integer.' };
  }

  if (player.blueIce < quantity) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough blue ice to sell.' };
  }

  player.blueIce -= quantity;
  const moneyGained = quantity * config.economy.houseSellBlueIcePrice;
  player.money += moneyGained;

  addLog(state, 'house.sellBlueIce', { playerId, quantity, moneyGained, x, y });

  return {
    ok: true,
    code: 'OK',
    message: 'Blue ice sold at house.',
    payload: {
      quantity,
      moneyGained,
    },
  };
}

function activeFactoryJobAt(state: GameState, x: number, y: number): boolean {
  return state.factoryJobs.some((job) => job.x === x && job.y === y && job.status === 'ACTIVE');
}

export function startFactoryCraft(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
  kind: CraftKind,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  const ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, 'FACTORY');
  if (ownedTypeCheck) {
    return ownedTypeCheck;
  }

  if (activeFactoryJobAt(state, x, y)) {
    return {
      ok: false,
      code: 'ALREADY_ACTIVE',
      message: 'This factory already has an active craft job.',
    };
  }

  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;

  if (player.money < config.economy.factoryCraftMoneyCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money to craft.' };
  }

  if (player.ice < config.economy.factoryCraftIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough ice to craft.' };
  }

  player.money -= config.economy.factoryCraftMoneyCost;
  player.ice -= config.economy.factoryCraftIceCost;

  const job = {
    id: createId('factory', state.nowMs, x * 1000 + y),
    ownerId: playerId,
    x,
    y,
    kind,
    status: 'ACTIVE' as const,
    startedAtMs: state.nowMs,
    completesAtMs: state.nowMs + config.timing.factoryCraftDurationMs,
    collectedAtMs: null,
  };

  state.factoryJobs.push(job);

  addLog(state, 'factory.craftStarted', {
    playerId,
    x,
    y,
    kind,
    factoryJobId: job.id,
    completesAtMs: job.completesAtMs,
  });

  return {
    ok: true,
    code: 'OK',
    message: `${kind === 'REFRIGERATOR' ? 'Refrigerator' : 'Blue ice'} craft started.`,
    payload: {
      factoryJobId: job.id,
      completesAtMs: job.completesAtMs,
      kind,
    },
  };
}

export function updateFactoryJobs(state: GameState): void {
  for (const job of state.factoryJobs) {
    if (job.status !== 'ACTIVE' || state.nowMs < job.completesAtMs) {
      continue;
    }

    const player = state.players[job.ownerId];
    if (!player) {
      continue;
    }

    job.status = 'COMPLETE';
    job.collectedAtMs = state.nowMs;
    if (job.kind === 'REFRIGERATOR') {
      player.refrigerators += 1;
    } else {
      player.blueIce += 1;
    }

    addLog(state, 'factory.craftComplete', {
      playerId: player.id,
      factoryJobId: job.id,
      kind: job.kind,
    });
  }
}

export function sellAnnualTrainShipment(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) {
    return precheck;
  }

  const ownedTypeCheck = assertOwnedTileType(state, playerId, x, y, 'TRAIN');
  if (ownedTypeCheck) {
    return ownedTypeCheck;
  }

  const player = state.players[playerId] as NonNullable<GameState['players'][string]>;
  if (player.ice < config.economy.trainShipmentIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Need 3 regular ice for train shipment.' };
  }

  const year = state.trainSales.currentYear;
  if (state.trainSales.usedByPlayerId[playerId] === year) {
    return {
      ok: false,
      code: 'LIMIT_REACHED',
      message: 'Annual train shipment already used this year.',
    };
  }

  player.ice -= config.economy.trainShipmentIceCost;
  player.money += config.economy.trainShipmentMoneyGain;
  state.trainSales.usedByPlayerId[playerId] = year;

  addLog(state, 'train.shipmentSold', {
    playerId,
    year,
    iceSpent: config.economy.trainShipmentIceCost,
    moneyGained: config.economy.trainShipmentMoneyGain,
  });

  return {
    ok: true,
    code: 'OK',
    message: 'Annual train shipment sold.',
    payload: {
      year,
      iceSpent: config.economy.trainShipmentIceCost,
      moneyGained: config.economy.trainShipmentMoneyGain,
    },
  };
}
