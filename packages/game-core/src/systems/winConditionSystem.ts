import type { GameConfig } from '@ice-king/config';
import type { GameState } from '@ice-king/shared';
import { addLog } from '../helpers';

export interface MatchOutcome {
  ended: boolean;
  winnerId: string | null;
  reason: 'TIME' | 'FORFEIT' | 'DRAW' | null;
}

export function syncTrainYear(state: GameState): void {
  state.trainSales.currentYear = Math.floor(state.season.seasonFlipCount / 2) + 1;
}

export function evaluateTimeWin(state: GameState, config: GameConfig): MatchOutcome {
  if (state.match.ended) {
    return {
      ended: true,
      winnerId: state.match.winnerId,
      reason: state.match.winnerId ? 'TIME' : 'DRAW',
    };
  }

  if (state.nowMs - state.match.startedAtMs < state.match.durationMs) {
    return {
      ended: false,
      winnerId: null,
      reason: null,
    };
  }

  const score = state.playerOrder
    .map((playerId) => ({
      playerId,
      money: state.players[playerId]?.money ?? 0,
    }))
    .sort((a, b) => b.money - a.money);

  const [first, second] = score;
  if (!first || !second) {
    state.match.ended = true;
    state.match.winnerId = null;
    addLog(state, 'match.ended', {
      reason: 'DRAW',
      score,
    });
    return {
      ended: true,
      winnerId: null,
      reason: 'DRAW',
    };
  }

  if (first.money > second.money) {
    state.match.ended = true;
    state.match.winnerId = first.playerId;
    addLog(state, 'match.ended', {
      reason: 'TIME',
      winnerId: first.playerId,
      score,
    });
    return {
      ended: true,
      winnerId: first.playerId,
      reason: 'TIME',
    };
  }

  if (config.win.overtimeEnabled && !state.match.overtime) {
    state.match.overtime = true;
    state.match.durationMs += config.win.overtimeDurationMs;
    addLog(state, 'match.overtimeStarted', {
      overtimeDurationMs: config.win.overtimeDurationMs,
      newDurationMs: state.match.durationMs,
    });
    return {
      ended: false,
      winnerId: null,
      reason: null,
    };
  }

  state.match.ended = true;
  state.match.winnerId = null;
  addLog(state, 'match.ended', {
    reason: 'DRAW',
    score,
  });

  return {
    ended: true,
    winnerId: null,
    reason: 'DRAW',
  };
}

export function forfeitMatch(state: GameState, loserId: string): MatchOutcome {
  if (state.match.ended) {
    return {
      ended: true,
      winnerId: state.match.winnerId,
      reason: state.match.winnerId ? 'FORFEIT' : 'DRAW',
    };
  }

  const winnerId = state.playerOrder.find((id) => id !== loserId) ?? null;
  state.match.ended = true;
  state.match.winnerId = winnerId;

  addLog(state, 'match.ended', {
    reason: 'FORFEIT',
    winnerId,
    loserId,
  });

  return {
    ended: true,
    winnerId,
    reason: 'FORFEIT',
  };
}
