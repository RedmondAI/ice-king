import type { GameConfig } from '@ice-king/config';
import type { GameState } from '@ice-king/shared';
import { addLog } from '../helpers';

export interface MatchOutcome {
  ended: boolean;
  winnerId: string | null;
  reason: 'TIME' | 'FORFEIT' | 'DRAW' | null;
}

type TeamScore = Array<{
  teamId: string;
  money: number;
  playerIds: string[];
}>;

function buildTeamScores(state: GameState): TeamScore {
  const teamMap = new Map<string, { money: number; playerIds: string[] }>();
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }
    const teamId = state.teamByPlayerId?.[playerId] ?? playerId;
    const entry = teamMap.get(teamId) ?? { money: 0, playerIds: [] };
    entry.money += player.money;
    entry.playerIds.push(playerId);
    teamMap.set(teamId, entry);
  }
  return Array.from(teamMap.entries()).map(([teamId, value]) => ({
    teamId,
    money: value.money,
    playerIds: value.playerIds,
  }));
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

  const score = buildTeamScores(state)
    .map((entry) => ({
      playerId: entry.playerIds[0] ?? entry.teamId,
      teamId: entry.teamId,
      money: entry.money,
      members: entry.playerIds,
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
      winnerTeam: first.teamId,
      winnerTeamMembers: first.members,
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

  const loserTeam = state.teamByPlayerId?.[loserId];
  const winnerId = loserTeam
    ? state.playerOrder.find((id) => (state.teamByPlayerId?.[id] ?? id) !== loserTeam) ?? null
    : state.playerOrder.find((id) => id !== loserId) ?? null;

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
