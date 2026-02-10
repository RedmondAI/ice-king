import type { GameAction, GameState } from '@ice-king/shared';

export interface BotDecisionContext {
  state: GameState;
  botPlayerId: string;
  allowedActions: GameAction[];
}

export interface BotDecisionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface BotDecisionReport {
  source: string;
  usage: BotDecisionUsage;
  unavailableReason?: string;
}

export interface BotDecisionPolicy {
  decide(context: BotDecisionContext): Promise<GameAction | null>;
}
