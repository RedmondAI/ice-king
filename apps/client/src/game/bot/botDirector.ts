import type { GameAction, GameState } from '@ice-king/shared';
import type { BotDecisionPolicy } from './types';

export interface BotDirectorOptions {
  botPlayerId: string;
  cadenceMs: number;
  buildAllowedActions: (state: GameState, botPlayerId: string) => GameAction[];
  dispatch: (action: GameAction) => { ok: boolean; message: string };
  primaryPolicy: BotDecisionPolicy;
  fallbackPolicy: BotDecisionPolicy;
  onDecisionInfo?: (info: string) => void;
}

const BOT_ACTION_COOLDOWN_MIN_MS = 20000;
const BOT_ACTION_COOLDOWN_MAX_MS = 30000;

function randomIntInclusive(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
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

function isAllowedAction(action: GameAction, allowedKeys: Set<string>): boolean {
  return allowedKeys.has(canonicalize(action));
}

function isTrivialDecisionWindow(allowedActions: GameAction[]): boolean {
  if (allowedActions.length <= 1) {
    return true;
  }

  if (allowedActions.some((action) => action.type === 'pond.harvest.claim')) {
    return true;
  }

  const uniqueTypes = new Set(allowedActions.map((action) => action.type));
  return uniqueTypes.size <= 1;
}

const LLM_STRATEGIC_TYPES = new Set<GameAction['type']>([
  'tile.buyFromPlayer',
  'tile.buildFactory',
  'tile.buildManMadePond',
  'structure.factory.craftRefrigerator',
  'structure.factory.craftBlueIce',
  'structure.train.sellAnnualShipment',
]);

function isComplexStrategicWindow(allowedActions: GameAction[]): boolean {
  if (allowedActions.length < 6) {
    return false;
  }

  const uniqueTypes = new Set(allowedActions.map((action) => action.type));
  if (uniqueTypes.size < 3) {
    return false;
  }

  for (const action of allowedActions) {
    if (LLM_STRATEGIC_TYPES.has(action.type)) {
      return true;
    }
  }

  return false;
}

export class BotDirector {
  private readonly options: BotDirectorOptions;
  private readonly primaryMinIntervalMs: number;
  private nextDecisionAt = 0;
  private nextPrimaryDecisionAt = 0;
  private inFlight = false;
  private lastPrimaryDecisionSignature = '';

  constructor(options: BotDirectorOptions) {
    this.options = options;
    this.primaryMinIntervalMs = Math.max(20000, this.options.cadenceMs * 8);
  }

  update(state: GameState): void {
    if (state.match.ended || state.nowMs < this.nextDecisionAt || this.inFlight) {
      return;
    }

    this.inFlight = true;
    const allowedActions = this.options.buildAllowedActions(state, this.options.botPlayerId);
    const allowedActionKeys = new Set(allowedActions.map((action) => canonicalize(action)));

    if (allowedActions.length === 0) {
      this.inFlight = false;
      this.nextDecisionAt = state.nowMs + this.options.cadenceMs;
      return;
    }

    const context = {
      state,
      botPlayerId: this.options.botPlayerId,
      allowedActions,
    };

    const decisionSignature = canonicalize(allowedActions);
    const isStrategicWindow =
      !isTrivialDecisionWindow(allowedActions) && isComplexStrategicWindow(allowedActions);
    const hasNewDecisionSignature = decisionSignature !== this.lastPrimaryDecisionSignature;
    const isPrimaryCooldownReady = state.nowMs >= this.nextPrimaryDecisionAt;
    const shouldUsePrimaryPolicy =
      isStrategicWindow && hasNewDecisionSignature && isPrimaryCooldownReady;

    if (shouldUsePrimaryPolicy) {
      this.lastPrimaryDecisionSignature = decisionSignature;
      this.nextPrimaryDecisionAt = state.nowMs + this.primaryMinIntervalMs;
    }

    const resolveAction = shouldUsePrimaryPolicy
      ? this.options.primaryPolicy
          .decide(context)
          .catch(() => null)
          .then(async (action) => {
            if (action && isAllowedAction(action, allowedActionKeys)) {
              return action;
            }

            if (action) {
              this.options.onDecisionInfo?.('Bot proposed an out-of-policy action; falling back.');
            }

            const fallbackAction = await this.options.fallbackPolicy.decide(context).catch(() => null);
            if (!fallbackAction) {
              return null;
            }

            if (!isAllowedAction(fallbackAction, allowedActionKeys)) {
              this.options.onDecisionInfo?.('Fallback bot action was not in allowed set; skipped.');
              return null;
            }

            return fallbackAction;
          })
      : this.options.fallbackPolicy
          .decide(context)
          .catch(() => null)
          .then((action) => {
            if (!action) {
              return null;
            }
            if (!isAllowedAction(action, allowedActionKeys)) {
              this.options.onDecisionInfo?.('Heuristic fallback action was not in allowed set; skipped.');
              return null;
            }
            return action;
          });

    let nextDecisionDelayMs = this.options.cadenceMs;

    void resolveAction
      .then((action) => {
        if (!action) {
          this.options.onDecisionInfo?.('Bot skipped decision window.');
          return;
        }

        const result = this.options.dispatch(action);
        if (!result.ok) {
          this.options.onDecisionInfo?.(`Bot action rejected: ${result.message}`);
          return;
        }

        // Enforce a longer post-action cooldown to reduce spammy bot turns and API costs.
        nextDecisionDelayMs = randomIntInclusive(
          BOT_ACTION_COOLDOWN_MIN_MS,
          BOT_ACTION_COOLDOWN_MAX_MS,
        );
      })
      .finally(() => {
        this.inFlight = false;
        this.nextDecisionAt = state.nowMs + nextDecisionDelayMs;
      });
  }
}
