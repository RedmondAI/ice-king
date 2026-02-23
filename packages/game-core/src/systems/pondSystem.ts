import type { GameConfig } from '@ice-king/config';
import type { ActionResult, GameState } from '@ice-king/shared';
import { addLog, createId, getTile, inBounds } from '../helpers';

function harvestDurationMs(config: GameConfig): number {
  return Math.max(1, config.timing.pondHarvestDurationMs);
}

function harvestYield(): number {
  return 1;
}

function hasActivePondJob(state: GameState, x: number, y: number): boolean {
  return state.ponds.some(
    (job) => job.pondX === x && job.pondY === y && (job.status === 'ACTIVE' || job.status === 'CLAIMABLE'),
  );
}

export function startPondHarvest(
  state: GameState,
  config: GameConfig,
  playerId: string,
  x: number,
  y: number,
): ActionResult {
  const player = state.players[playerId];
  if (!player) {
    return { ok: false, code: 'INVALID_PLAYER', message: 'Player does not exist.' };
  }
  if (!inBounds(state, x, y)) {
    return { ok: false, code: 'INVALID_TILE', message: 'Tile is out of bounds.' };
  }

  const tile = getTile(state, x, y);
  if (tile.type !== 'POND') {
    return { ok: false, code: 'INVALID_ACTION', message: 'Pond harvest can only start on pond tiles.' };
  }

  if (tile.ownerId !== playerId) {
    return { ok: false, code: 'NOT_OWNER', message: 'You must own this pond tile to harvest it.' };
  }

  if (hasActivePondJob(state, x, y)) {
    return {
      ok: false,
      code: 'ALREADY_ACTIVE',
      message: 'This pond already has an active or claimable harvest job.',
    };
  }

  if (state.season.logicSeason !== 'WINTER') {
    return { ok: false, code: 'WRONG_SEASON', message: 'Pond harvest can only be started in winter.' };
  }

  if (player.money < config.economy.pondHarvestCost) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough money to start harvest job.' };
  }

  player.money -= config.economy.pondHarvestCost;

  const durationMs = harvestDurationMs(config);
  const pondJob = {
    id: createId('pond', state.nowMs, x * 1000 + y),
    pondX: x,
    pondY: y,
    ownerId: playerId,
    harvestIceYield: harvestYield(),
    status: 'ACTIVE' as const,
    createdAtMs: state.nowMs,
    claimAtMs: state.nowMs + durationMs,
    claimedAtMs: null,
  };

  state.ponds.push(pondJob);
  addLog(state, 'pond.harvest.started', {
    playerId,
    x,
    y,
    pondJobId: pondJob.id,
    claimAtMs: pondJob.claimAtMs,
  });

  return {
    ok: true,
    code: 'OK',
    message: 'Pond harvest started.',
    payload: {
      pondJobId: pondJob.id,
      claimAtMs: pondJob.claimAtMs,
    },
  };
}

export function updatePondHarvestJobs(state: GameState): void {
  for (const job of state.ponds) {
    if (job.status === 'ACTIVE' && state.nowMs >= job.claimAtMs) {
      job.status = 'CLAIMABLE';
    }
  }
}

export function claimPondHarvest(
  state: GameState,
  _config: GameConfig,
  playerId: string,
  pondJobId: string,
): ActionResult {
  const player = state.players[playerId];
  if (!player) {
    return { ok: false, code: 'INVALID_PLAYER', message: 'Player does not exist.' };
  }

  const job = state.ponds.find((entry) => entry.id === pondJobId);
  if (!job || job.ownerId !== playerId) {
    return { ok: false, code: 'NOT_CLAIMABLE', message: 'Pond job not found for this player.' };
  }

  if (job.status === 'ACTIVE') {
    if (state.nowMs < job.claimAtMs) {
      return { ok: false, code: 'NOT_CLAIMABLE', message: 'Pond job is not claimable yet.' };
    }
    // Allow immediate claim right at completion time, even if the tick loop hasn't updated status yet.
    job.status = 'CLAIMABLE';
  }

  if (job.status !== 'CLAIMABLE') {
    return { ok: false, code: 'NOT_CLAIMABLE', message: 'Pond job is not claimable.' };
  }

  job.status = 'CLAIMED';
  job.claimedAtMs = state.nowMs;
  const iceGained = job.harvestIceYield;
  player.ice += iceGained;

  addLog(state, 'pond.harvest.claimed', {
    playerId,
    pondJobId,
    pondX: job.pondX,
    pondY: job.pondY,
    iceGained,
  });

  return {
    ok: true,
    code: 'OK',
    message: 'Pond ice claimed.',
    payload: {
      pondJobId,
      iceAdded: iceGained,
    },
  };
}
