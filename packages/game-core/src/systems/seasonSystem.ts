import type { GameState, Season } from '@ice-king/shared';
import { clamp, oppositeSeason } from '../helpers';

export interface SeasonFlip {
  from: Season;
  to: Season;
}

export interface SeasonUpdateResult {
  flips: SeasonFlip[];
}

export function updateSeasonClock(state: GameState, nowMs: number): SeasonUpdateResult {
  const flips: SeasonFlip[] = [];
  const season = state.season;

  while (nowMs >= season.cycleStartMs + season.cycleDurationMs) {
    const from = season.logicSeason;
    const to = oppositeSeason(from);
    season.logicSeason = to;
    season.cycleStartMs += season.cycleDurationMs;
    season.seasonFlipCount += 1;
    season.visualFromSeason = to;
    season.visualToSeason = oppositeSeason(to);
    flips.push({ from, to });
  }

  const elapsedInCycle = nowMs - season.cycleStartMs;
  const transitionStart = Math.max(0, season.cycleDurationMs - season.transitionDurationMs);

  if (elapsedInCycle >= transitionStart) {
    season.transitionProgress = clamp(
      (elapsedInCycle - transitionStart) / Math.max(1, season.transitionDurationMs),
      0,
      1,
    );
  } else {
    season.transitionProgress = 0;
  }

  season.transitionKeyframeIndex = Math.min(8, Math.max(0, Math.round(season.transitionProgress * 8)));
  season.visualFromSeason = season.logicSeason;
  season.visualToSeason = oppositeSeason(season.logicSeason);

  return { flips };
}

export function forceSeasonFlip(state: GameState, to: Season): SeasonFlip | null {
  const season = state.season;
  const from = season.logicSeason;
  if (from === to) {
    return null;
  }

  season.logicSeason = to;
  season.cycleStartMs = state.nowMs;
  season.seasonFlipCount += 1;
  season.transitionProgress = 0;
  season.transitionKeyframeIndex = 0;
  season.visualFromSeason = to;
  season.visualToSeason = oppositeSeason(to);

  return { from, to };
}
