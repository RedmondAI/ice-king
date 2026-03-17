import type { GameConfig } from '@ice-king/config';
import type { ActionResult, GameState, WarCraftKind } from '@ice-king/shared';
import { addLog, createId, getTile, inBounds, isTileOwnedByPlayerOrTeammate } from '../helpers';
import { canBuildOnTile } from './economySystem';

function assertPlayer(state: GameState, playerId: string): ActionResult | null {
  if (!state.players[playerId]) {
    return { ok: false, code: 'INVALID_PLAYER', message: 'Player does not exist.' };
  }
  if (state.match.ended) {
    return { ok: false, code: 'MATCH_ENDED', message: 'Match has already ended.' };
  }
  return null;
}

export function buildWarFactory(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);
  const player = state.players[playerId]!;

  if (!canBuildOnTile(state, tile, playerId)) {
    return {
      ok: false,
      code: 'INVALID_ACTION',
      message: 'War factory can only be built on owned empty grass/forest tiles.',
    };
  }

  if (player.money < config.economy.buildWarFactoryMoneyCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money to build a war factory.' };
  }

  if (player.blueIce < config.economy.buildWarFactoryBlueIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough blue ice to build a war factory.' };
  }

  player.money -= config.economy.buildWarFactoryMoneyCost;
  player.blueIce -= config.economy.buildWarFactoryBlueIceCost;
  tile.type = 'WAR_FACTORY';
  tile.source = 'PLAYER_BUILT';

  addLog(state, 'tile.warFactoryBuilt', { playerId, x, y });

  return { ok: true, code: 'OK', message: 'War factory built.', payload: { x, y } };
}

function activeWarCraftJobAt(state: GameState, x: number, y: number): boolean {
  return state.warCraftJobs.some((job) => job.x === x && job.y === y && job.status === 'ACTIVE');
}

export function startWarCraft(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
  kind: WarCraftKind,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);

  if (!isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return { ok: false, code: 'NOT_OWNER', message: 'Player must own this war factory.' };
  }

  if (tile.type !== 'WAR_FACTORY') {
    return { ok: false, code: 'INVALID_ACTION', message: 'Tile is not a war factory.' };
  }

  if (activeWarCraftJobAt(state, x, y)) {
    return { ok: false, code: 'ALREADY_ACTIVE', message: 'This war factory already has an active job.' };
  }

  const player = state.players[playerId]!;

  const moneyCost = kind === 'NUKE' ? config.economy.warNukeMoneyCost : config.economy.warWarriorsMoneyCost;
  const blueIceCost = kind === 'NUKE' ? config.economy.warNukeBlueIceCost : config.economy.warWarriorsBlueIceCost;
  const durationMs = kind === 'NUKE' ? config.timing.warNukeDurationMs : config.timing.warWarriorsDurationMs;

  if (player.money < moneyCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money.' };
  }

  if (player.blueIce < blueIceCost) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough blue ice.' };
  }

  player.money -= moneyCost;
  player.blueIce -= blueIceCost;

  const job = {
    id: createId('warcraft', state.nowMs, x * 1000 + y),
    ownerId: playerId,
    x,
    y,
    kind,
    status: 'ACTIVE' as const,
    startedAtMs: state.nowMs,
    completesAtMs: state.nowMs + durationMs,
    collectedAtMs: null,
  };

  state.warCraftJobs.push(job);

  addLog(state, 'war.craftStarted', { playerId, x, y, kind, jobId: job.id, completesAtMs: job.completesAtMs });

  return {
    ok: true,
    code: 'OK',
    message: `${kind === 'NUKE' ? 'Ice nuke' : 'Ice warriors'} crafting started.`,
    payload: { jobId: job.id, completesAtMs: job.completesAtMs, kind },
  };
}

export function collectWarCraftJob(
  state: GameState,
  playerId: string,
  jobId: string,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  const job = state.warCraftJobs.find((j) => j.id === jobId);
  if (!job) {
    return { ok: false, code: 'INVALID_ACTION', message: 'War craft job not found.' };
  }

  if (!isTileOwnedByPlayerOrTeammate(state, job.ownerId, playerId)) {
    return { ok: false, code: 'NOT_OWNER', message: 'Not your war craft job.' };
  }

  if (job.status !== 'COMPLETE') {
    return { ok: false, code: 'INVALID_ACTION', message: 'War craft job is not complete yet.' };
  }

  const player = state.players[playerId]!;
  job.status = 'COLLECTED';
  job.collectedAtMs = state.nowMs;

  if (job.kind === 'NUKE') {
    player.nukes += 1;
  } else {
    player.warriors += 2;
  }

  addLog(state, 'war.craftCollected', { playerId, jobId, kind: job.kind });

  return {
    ok: true,
    code: 'OK',
    message: job.kind === 'NUKE' ? 'Ice nuke collected!' : 'Ice warriors (x2) collected!',
    payload: { kind: job.kind },
  };
}

export function nukeEnemyTile(
  state: GameState,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);

  if (tile.type === 'VOID') {
    return { ok: false, code: 'INVALID_TILE', message: 'Cannot nuke border tiles.' };
  }

  if (tile.type === 'CRATER') {
    return { ok: false, code: 'INVALID_ACTION', message: 'Tile is already a crater.' };
  }

  // Must be targeting an enemy tile (not your own)
  if (tile.ownerId === null) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Can only nuke enemy-owned tiles.' };
  }

  if (isTileOwnedByPlayerOrTeammate(state, tile.ownerId, playerId)) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Cannot nuke your own tiles.' };
  }

  const player = state.players[playerId]!;
  if (player.nukes < 1) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'No nukes in inventory.' };
  }

  player.nukes -= 1;
  tile.type = 'CRATER';

  // Remove any active jobs on the nuked tile
  for (const job of state.ponds) {
    if (job.pondX === x && job.pondY === y && job.status !== 'CLAIMED') {
      job.status = 'CLAIMED';
    }
  }
  for (const job of state.factoryJobs) {
    if (job.x === x && job.y === y && job.status === 'ACTIVE') {
      job.status = 'COMPLETE';
    }
  }
  for (const job of state.warCraftJobs) {
    if (job.x === x && job.y === y && job.status === 'ACTIVE') {
      job.status = 'COMPLETE';
    }
  }

  addLog(state, 'war.nuked', { playerId, x, y });

  return { ok: true, code: 'OK', message: 'BOOM! Tile nuked into a crater!', payload: { x, y } };
}

export function startWarBattle(
  state: GameState,
  config: GameConfig,
  playerId: string,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  if (state.warSession && !state.warSession.resolved) {
    return { ok: false, code: 'ALREADY_ACTIVE', message: 'A war is already in progress.' };
  }

  // Initialize committed warriors: 0 for all players
  const committedByPlayerId: Record<string, number> = {};
  for (const pid of state.playerOrder) {
    committedByPlayerId[pid] = 0;
  }

  state.warSession = {
    startedAtMs: state.nowMs,
    endsAtMs: state.nowMs + config.timing.warBattleDurationMs,
    committedByPlayerId,
    resolved: false,
    winnerId: null,
    showResultUntilMs: null,
  };

  addLog(state, 'war.battleStarted', { playerId });

  return {
    ok: true,
    code: 'OK',
    message: 'War has begun! Commit warriors before time runs out!',
    payload: { endsAtMs: state.warSession.endsAtMs },
  };
}

export function commitWarriorsToBattle(
  state: GameState,
  playerId: string,
  count: number,
): ActionResult {
  const precheck = assertPlayer(state, playerId);
  if (precheck) return precheck;

  if (!state.warSession || state.warSession.resolved) {
    return { ok: false, code: 'INVALID_ACTION', message: 'No active war to commit warriors to.' };
  }

  if (state.nowMs >= state.warSession.endsAtMs) {
    return { ok: false, code: 'INVALID_ACTION', message: 'War has ended.' };
  }

  const player = state.players[playerId]!;
  if (player.warriors < count) {
    return { ok: false, code: 'INSUFFICIENT_ICE', message: 'Not enough warriors.' };
  }

  player.warriors -= count;
  state.warSession.committedByPlayerId[playerId] = (state.warSession.committedByPlayerId[playerId] ?? 0) + count;

  addLog(state, 'war.warriorsCommitted', { playerId, count });

  return {
    ok: true,
    code: 'OK',
    message: `${count} warrior${count === 1 ? '' : 's'} committed to battle!`,
    payload: { committed: state.warSession.committedByPlayerId[playerId] },
  };
}

export function updateWarCraftJobs(state: GameState): void {
  for (const job of state.warCraftJobs) {
    if (job.status !== 'ACTIVE' || state.nowMs < job.completesAtMs) {
      continue;
    }
    job.status = 'COMPLETE';
    addLog(state, 'war.craftComplete', { ownerId: job.ownerId, jobId: job.id, kind: job.kind });
  }
}

export function updateWarBattle(state: GameState, config: GameConfig): void {
  const session = state.warSession;
  if (!session || session.resolved) {
    return;
  }

  // Check if result display period is over
  if (session.showResultUntilMs !== null && state.nowMs >= session.showResultUntilMs) {
    // Reset everything: clear all warriors
    for (const player of Object.values(state.players)) {
      player.warriors = 0;
    }
    state.warSession = null;
    return;
  }

  // Check if battle time is up and not yet resolved
  if (!session.resolved && state.nowMs >= session.endsAtMs) {
    resolveWarBattle(state, config, session);
  }
}

function resolveWarBattle(
  state: GameState,
  config: GameConfig,
  session: NonNullable<GameState['warSession']>,
): void {
  const players = state.playerOrder.map((id) => state.players[id]).filter(Boolean);

  if (players.length < 2) {
    session.resolved = true;
    session.showResultUntilMs = state.nowMs + config.timing.warResultDisplayMs;
    return;
  }

  // Find who committed the most warriors (only compare two teams/players for now)
  let maxCommitted = -1;
  let winnerId: string | null = null;
  let tieCount = 0;

  for (const pid of state.playerOrder) {
    const committed = session.committedByPlayerId[pid] ?? 0;
    if (committed > maxCommitted) {
      maxCommitted = committed;
      winnerId = pid;
      tieCount = 1;
    } else if (committed === maxCommitted) {
      tieCount += 1;
    }
  }

  const isTie = tieCount > 1 || maxCommitted === 0;

  session.resolved = true;
  session.winnerId = isTie ? null : winnerId;
  session.showResultUntilMs = state.nowMs + config.timing.warResultDisplayMs;

  if (!isTie && winnerId) {
    // Find the losing players and steal half their money
    for (const pid of state.playerOrder) {
      if (pid === winnerId) continue;
      const loser = state.players[pid];
      if (!loser) continue;
      const stolen = Math.floor(loser.money / 2);
      loser.money -= stolen;
      const winner = state.players[winnerId];
      if (winner) winner.money += stolen;
    }
    addLog(state, 'war.battleResolved', { winnerId, moneyStolen: true });
  } else {
    addLog(state, 'war.battleResolved', { winnerId: null, tie: true });
  }
}
