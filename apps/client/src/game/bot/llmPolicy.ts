import type { GameAction } from '@ice-king/shared';
import type {
  BotDecisionContext,
  BotDecisionPolicy,
  BotDecisionReport,
  BotDecisionUsage,
} from './types';

function compactStateForPrompt(context: BotDecisionContext): Record<string, unknown> {
  const player = context.state.players[context.botPlayerId];
  const opponentId = context.state.playerOrder.find((id) => id !== context.botPlayerId) ?? null;
  const opponent = opponentId ? context.state.players[opponentId] : null;
  const refrigeratedCapacity = (player?.refrigerators ?? 0) * 2;
  const refrigeratedIce = Math.min(player?.ice ?? 0, refrigeratedCapacity);
  const unrefrigeratedIce = Math.max((player?.ice ?? 0) - refrigeratedCapacity, 0);
  const nextFlipAtMs = context.state.season.cycleStartMs + context.state.season.cycleDurationMs;
  const msUntilFlip = Math.max(0, nextFlipAtMs - context.state.nowMs);

  const ownedSummary = context.state.tiles.reduce(
    (acc, tile) => {
      if (tile.ownerId === context.botPlayerId) {
        acc.owned += 1;
        if (tile.type === 'POND') {
          acc.ponds += 1;
        }
        if (tile.type === 'FACTORY') {
          acc.factories += 1;
        }
        if (tile.type === 'HOUSE') {
          acc.houses += 1;
        }
        if (tile.type === 'TRAIN') {
          acc.train += 1;
        }
      }
      return acc;
    },
    { owned: 0, ponds: 0, factories: 0, houses: 0, train: 0 },
  );

  return {
    nowMs: context.state.nowMs,
    season: context.state.season.logicSeason,
    transitionProgress: Number(context.state.season.transitionProgress.toFixed(3)),
    secondsUntilFlip: Number((msUntilFlip / 1000).toFixed(2)),
    year: context.state.trainSales.currentYear,
    candidateActionCount: context.allowedActions.length,
    bot: {
      id: player?.id,
      money: player?.money,
      ice: player?.ice,
      blueIce: player?.blueIce,
      refrigerators: player?.refrigerators,
      refrigeratedIce,
      unrefrigeratedIce,
      owned: ownedSummary,
      pondJobs: context.state.ponds
        .filter((job) => job.ownerId === context.botPlayerId && job.status !== 'CLAIMED')
        .map((job) => ({ id: job.id, status: job.status, x: job.pondX, y: job.pondY })),
      factoryJobs: context.state.factoryJobs
        .filter((job) => job.ownerId === context.botPlayerId)
        .map((job) => ({ id: job.id, status: job.status, kind: job.kind, x: job.x, y: job.y })),
      trainSaleUsedThisYear:
        context.state.trainSales.usedByPlayerId[context.botPlayerId] === context.state.trainSales.currentYear,
    },
    opponent: opponent
      ? {
          id: opponent.id,
          money: opponent.money,
          ice: opponent.ice,
          blueIce: opponent.blueIce,
          refrigerators: opponent.refrigerators,
        }
      : null,
  };
}

function sanitizeAction(raw: unknown): GameAction | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || typeof candidate.playerId !== 'string') {
    return null;
  }
  return candidate as unknown as GameAction;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export class OpenAiBotPolicy implements BotDecisionPolicy {
  private unavailableUntilMs = 0;
  private readonly onDecisionReport?: (report: BotDecisionReport) => void;

  constructor(options: { onDecisionReport?: (report: BotDecisionReport) => void } = {}) {
    this.onDecisionReport = options.onDecisionReport;
  }

  private report(report: BotDecisionReport): void {
    this.onDecisionReport?.(report);
  }

  private parseUsage(raw: unknown): BotDecisionUsage {
    if (!raw || typeof raw !== 'object') {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    const usage = raw as Record<string, unknown>;
    const inputTokensRaw = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const outputTokensRaw = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0;
    const totalTokensRaw = usage.totalTokens ?? usage.total_tokens ?? 0;

    const inputTokens = Number.isFinite(Number(inputTokensRaw))
      ? Math.max(0, Number(inputTokensRaw))
      : 0;
    const outputTokens = Number.isFinite(Number(outputTokensRaw))
      ? Math.max(0, Number(outputTokensRaw))
      : 0;
    const totalTokens = Number.isFinite(Number(totalTokensRaw))
      ? Math.max(0, Number(totalTokensRaw))
      : inputTokens + outputTokens;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }

  async decide(context: BotDecisionContext): Promise<GameAction | null> {
    if (Date.now() < this.unavailableUntilMs) {
      return null;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);

    let response: Response;
    try {
      response = await fetch('/api/bot/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botPlayerId: context.botPlayerId,
          stateSummary: compactStateForPrompt(context),
          allowedActions: context.allowedActions,
          preferredActionIndex: context.allowedActions.length > 0 ? 0 : null,
        }),
        signal: controller.signal,
      });
    } catch {
      window.clearTimeout(timeout);
      return null;
    }
    window.clearTimeout(timeout);

    if (response.status === 503) {
      this.unavailableUntilMs = Date.now() + 60000;
      this.report({
        source: 'unavailable',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
      return null;
    }

    if (!response.ok) {
      this.report({
        source: 'unavailable',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
      return null;
    }

    const data = (await response.json()) as {
      action?: unknown;
      source?: string;
      unavailableReason?: string;
      usage?: unknown;
    };
    const usage = this.parseUsage(data.usage);
    this.report({
      source: data.source ?? 'unknown',
      unavailableReason: data.unavailableReason,
      usage,
    });

    if (data.unavailableReason) {
      this.unavailableUntilMs = Date.now() + 60000;
      return null;
    }
    const action = sanitizeAction(data.action ?? null);
    if (!action || action.playerId !== context.botPlayerId) {
      return null;
    }

    const actionKey = canonicalize(action);
    const isAllowed = context.allowedActions.some((allowed) => canonicalize(allowed) === actionKey);
    return isAllowed ? action : null;
  }
}
