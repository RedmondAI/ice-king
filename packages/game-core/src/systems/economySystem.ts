import type { GameConfig } from '@ice-king/config';
import type { ActionResult, GameState, NetWorthBreakdown, TileState } from '@ice-king/shared';
import {
  addLog,
  getTile,
  inBounds,
  isTileOwnedByPlayerOrTeammate,
  playerStorageSplit,
  roundDown,
} from '../helpers';

function assertPlayer(state: GameState, playerId: string): ActionResult | null {
  if (!state.players[playerId]) {
    return { ok: false, code: 'INVALID_PLAYER', message: 'Player does not exist.' };
  }
  if (state.match.ended) {
    return { ok: false, code: 'MATCH_ENDED', message: 'Match has already ended.' };
  }
  return null;
}

export function buyUnownedTile(
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

  if (tile.type === 'VOID') {
    return { ok: false, code: 'INVALID_ACTION', message: 'Border tiles cannot be purchased.' };
  }

  if (tile.ownerId !== null && isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return { ok: false, code: 'ALREADY_OWNER', message: 'Tile is already owned by this player.' };
  }

  if (tile.ownerId !== null) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: 'Tile is already owned. Use tile.buyFromPlayer for a buyout.',
    };
  }

  if (player.money < config.economy.buyUnownedTileCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money to buy this tile.' };
  }

  player.money -= config.economy.buyUnownedTileCost;
  tile.ownerId = playerId;
  tile.currentPrice = config.economy.buyUnownedTileCost;

  addLog(state, 'tile.bought', {
    playerId,
    x,
    y,
    amountPaid: config.economy.buyUnownedTileCost,
  });

  return {
    ok: true,
    code: 'OK',
    message: 'Tile purchased.',
    payload: {
      x,
      y,
      ownerId: playerId,
      currentPrice: tile.currentPrice,
    },
  };
}

export function buyOwnedTile(
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
  const buyer = state.players[playerId] as NonNullable<GameState['players'][string]>;

  if (tile.type === 'VOID') {
    return { ok: false, code: 'INVALID_ACTION', message: 'Border tiles cannot be purchased.' };
  }

  if (tile.ownerId === null) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: 'Tile is unowned. Use tile.buy to buy unowned tiles.',
    };
  }

  if (tile.ownerId !== null && isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return { ok: false, code: 'ALREADY_OWNER', message: 'Tile is already owned by this player.' };
  }

  const seller = state.players[tile.ownerId];
  if (!seller) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Tile seller is invalid.' };
  }

  const purchasePrice = tile.currentPrice + config.economy.buyoutTransferFee;
  if (buyer.money < purchasePrice) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      message: `Need $${purchasePrice}c to buy out this tile.`,
    };
  }

  buyer.money -= purchasePrice;
  seller.money += tile.currentPrice;
  tile.ownerId = playerId;
  tile.currentPrice = purchasePrice;

  addLog(state, 'tile.buyout', {
    buyerId: playerId,
    sellerId: seller.id,
    x,
    y,
    purchasePrice,
    sellerReceived: purchasePrice - config.economy.buyoutTransferFee,
    transferFee: config.economy.buyoutTransferFee,
  });

  return {
    ok: true,
    code: 'OK',
    message: 'Tile bought from other player.',
    payload: {
      x,
      y,
      ownerId: playerId,
      currentPrice: tile.currentPrice,
      purchasePrice,
    },
  };
}

export function canBuildOnTile(state: GameState, tile: TileState, playerId: string): boolean {
  if (!isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return false;
  }
  return tile.type === 'GRASS' || tile.type === 'FOREST';
}

export function applyWinterToSummerMelt(state: GameState, config: GameConfig): void {
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }

    const split = playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit);
    const melted = roundDown(split.unrefrigeratedIce * 0.5);
    if (melted > 0) {
      player.ice -= melted;
      addLog(state, 'economy.iceMelted', {
        playerId,
        unrefrigeratedBefore: split.unrefrigeratedIce,
        melted,
      });
    }
  }
}

export function computeNetWorth(state: GameState, config: GameConfig): NetWorthBreakdown[] {
  const ownedTileValueByPlayer: Record<string, number> = {};
  const landControlPremium = Math.max(1, config.economy.buyUnownedTileCost);

  for (const tile of state.tiles) {
    if (tile.ownerId && tile.type !== 'VOID') {
      ownedTileValueByPlayer[tile.ownerId] =
        (ownedTileValueByPlayer[tile.ownerId] ?? 0) + tile.currentPrice + landControlPremium;
    }
  }

  return state.playerOrder.map((playerId) => {
    const player = state.players[playerId];
    const iceValue = player.ice * config.win.regularIceNetWorthValue;
    const blueIceValue = player.blueIce * config.win.blueIceNetWorthValue;
    const refrigeratorValue = player.refrigerators * config.win.refrigeratorNetWorthValue;
    const ownedTileValue = ownedTileValueByPlayer[playerId] ?? 0;
    const value = player.money + iceValue + blueIceValue + refrigeratorValue + ownedTileValue;

    return {
      playerId,
      value,
      money: player.money,
      iceValue,
      blueIceValue,
      refrigeratorValue,
      ownedTileValue,
    };
  });
}
