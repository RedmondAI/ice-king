import type { GameState, PlayerState, TileState } from '@ice-king/shared';

export function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function inBounds(state: Pick<GameState, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function getTile(state: Pick<GameState, 'width' | 'tiles'>, x: number, y: number): TileState {
  return state.tiles[tileIndex(state.width, x, y)] as TileState;
}

export function getPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players[playerId] ?? null;
}

export function oppositeSeason(season: 'SUMMER' | 'WINTER'): 'SUMMER' | 'WINTER' {
  return season === 'SUMMER' ? 'WINTER' : 'SUMMER';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createId(prefix: string, nowMs: number, randomSeed: number): string {
  return `${prefix}_${nowMs.toString(36)}_${randomSeed.toString(36)}`;
}

export function roundDown(value: number): number {
  return Math.floor(value);
}

export function addLog(
  state: GameState,
  type: string,
  payload: Record<string, unknown>,
  keepCount = 500,
): void {
  state.actionLog.push({
    id: `${type}_${state.nowMs}_${state.actionLog.length}`,
    atMs: state.nowMs,
    type,
    payload,
  });

  if (state.actionLog.length > keepCount) {
    state.actionLog.splice(0, state.actionLog.length - keepCount);
  }
}

export function playerStorageSplit(
  player: Pick<PlayerState, 'ice' | 'refrigerators'>,
  fridgePerUnit: number,
): { refrigeratedCapacity: number; refrigeratedIce: number; unrefrigeratedIce: number } {
  const refrigeratedCapacity = player.refrigerators * fridgePerUnit;
  const refrigeratedIce = Math.min(player.ice, refrigeratedCapacity);
  const unrefrigeratedIce = Math.max(player.ice - refrigeratedCapacity, 0);

  return {
    refrigeratedCapacity,
    refrigeratedIce,
    unrefrigeratedIce,
  };
}

export function playerTeam(state: Pick<GameState, 'teamByPlayerId'>, playerId: string): string {
  return state.teamByPlayerId?.[playerId] ?? playerId;
}

export function arePlayersTeammates(
  state: Pick<GameState, 'teamByPlayerId'>,
  playerAId: string,
  playerBId: string,
): boolean {
  return playerTeam(state, playerAId) === playerTeam(state, playerBId);
}

export function isTileOwnedByPlayerOrTeammate(
  state: Pick<GameState, 'teamByPlayerId'>,
  ownerId: string | null,
  playerId: string,
): boolean {
  if (ownerId === null) {
    return false;
  }
  return ownerId === playerId || arePlayersTeammates(state, ownerId, playerId);
}
