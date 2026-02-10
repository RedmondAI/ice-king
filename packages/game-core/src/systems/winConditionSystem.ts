import type { GameConfig } from '@ice-king/config';
import type { GameState } from '@ice-king/shared';
import { addLog } from '../helpers';
import { computeNetWorth } from './economySystem';

export interface MatchOutcome {
  ended: boolean;
  winnerId: string | null;
  reason: 'TIME' | 'FORFEIT' | 'DRAW' | null;
}

export function syncTrainYear(state: GameState): void {
  state.trainSales.currentYear = Math.floor(state.season.seasonFlipCount / 2) + 1;
}

function applyTieBreaker(state: GameState, firstId: string, secondId: string): string | null {
  const first = state.players[firstId];
  const second = state.players[secondId];

  if (!first || !second) {
    return null;
  }

  if (first.blueIce !== second.blueIce) {
    return first.blueIce > second.blueIce ? firstId : secondId;
  }

  if (first.money !== second.money) {
    return first.money > second.money ? firstId : secondId;
  }

  return null;
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

  const [first, second] = computeNetWorth(state, config).sort((a, b) => b.value - a.value);

  if (first.value > second.value) {
    state.match.ended = true;
    state.match.winnerId = first.playerId;
    addLog(state, 'match.ended', {
      reason: 'TIME',
      winnerId: first.playerId,
      score: [first, second],
    });
    return {
      ended: true,
      winnerId: first.playerId,
      reason: 'TIME',
    };
  }

  const tieBreakWinner = applyTieBreaker(state, first.playerId, second.playerId);
  if (tieBreakWinner) {
    state.match.ended = true;
    state.match.winnerId = tieBreakWinner;
    addLog(state, 'match.ended', {
      reason: 'TIME',
      winnerId: tieBreakWinner,
      score: [first, second],
      tiebreak: true,
    });
    return {
      ended: true,
      winnerId: tieBreakWinner,
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
    score: [first, second],
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
