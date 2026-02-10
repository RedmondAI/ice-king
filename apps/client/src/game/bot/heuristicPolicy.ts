import type { GameEngine } from '@ice-king/game-core';
import type { BotDecisionContext, BotDecisionPolicy } from './types';

export class HeuristicBotPolicy implements BotDecisionPolicy {
  private readonly engine: GameEngine;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  async decide(context: BotDecisionContext) {
    const action = this.engine.suggestHeuristicBotAction(context.botPlayerId);
    return action;
  }
}
