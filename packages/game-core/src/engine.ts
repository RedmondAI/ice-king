import type { GameConfig } from '@ice-king/config';
import { createGameConfig } from '@ice-king/config';
import {
  GameActionSchema,
  type ActionResult,
  type GameAction,
  type GameState,
  type NetWorthBreakdown,
} from '@ice-king/shared';
import { addLog, clamp, playerStorageSplit } from './helpers';
import { createInitialState, type CreateInitialStateOptions, type InitialPlayerInput } from './stateInit';
import { buyOwnedTile, buyUnownedTile, computeNetWorth, applyWinterToSummerMelt } from './systems/economySystem';
import { claimPondHarvest, startPondHarvest, updatePondHarvestJobs } from './systems/pondSystem';
import {
  buildFactory,
  buildManMadePond,
  sellAnnualTrainShipment,
  sellBlueIceAtHouse,
  sellIceAtHouse,
  startFactoryCraft,
  updateFactoryJobs,
} from './systems/structureSystem';
import { forceSeasonFlip, updateSeasonClock, type SeasonFlip } from './systems/seasonSystem';
import { evaluateTimeWin, forfeitMatch, syncTrainYear } from './systems/winConditionSystem';
import { chooseHeuristicBotAction, enumerateCandidateBotActions, tickBots } from './systems/botSystem';

export interface EngineOptions {
  config?: Partial<GameConfig>;
  configMode?: 'PROD' | 'DEV_FAST';
  botControlMode?: 'INTERNAL_HEURISTIC' | 'EXTERNAL';
  seed: string;
  players: [InitialPlayerInput, InitialPlayerInput];
}

export class GameEngine {
  readonly config: GameConfig;
  private state: GameState;
  private readonly botControlMode: 'INTERNAL_HEURISTIC' | 'EXTERNAL';
  private readonly nextBotExternalActionAt: Record<string, number>;

  constructor(options: EngineOptions) {
    this.config = createGameConfig(options.config ?? {}, options.configMode ?? 'PROD');
    this.botControlMode = options.botControlMode ?? 'INTERNAL_HEURISTIC';

    const stateOptions: CreateInitialStateOptions = {
      config: this.config,
      players: options.players,
      seed: options.seed,
      nowMs: 0,
    };

    this.state = createInitialState(stateOptions);
    this.nextBotExternalActionAt = Object.fromEntries(
      Object.keys(this.state.bots).map((playerId) => [playerId, 0]),
    ) as Record<string, number>;
  }

  static createPlayVsComputer(
    seed = 'ice-king-default-seed',
    humanName = 'Player',
    configMode: 'PROD' | 'DEV_FAST' = 'PROD',
    botControlMode: 'INTERNAL_HEURISTIC' | 'EXTERNAL' = 'INTERNAL_HEURISTIC',
  ): GameEngine {
    return new GameEngine({
      botControlMode,
      configMode,
      seed,
      players: [
        {
          id: 'P1',
          name: humanName,
          color: 'BLUE',
          controller: 'HUMAN',
        },
        {
          id: 'P2',
          name: 'Ice Bot',
          color: 'RED',
          controller: 'BOT',
        },
      ],
    });
  }

  getState(): GameState {
    return this.state;
  }

  replaceState(nextState: GameState): void {
    this.state = nextState;
  }

  getNetWorth(): NetWorthBreakdown[] {
    return computeNetWorth(this.state, this.config).sort((a, b) => b.value - a.value);
  }

  getPlayerStorage(playerId: string): {
    refrigeratedCapacity: number;
    refrigeratedIce: number;
    unrefrigeratedIce: number;
  } {
    const player = this.state.players[playerId];
    if (!player) {
      return {
        refrigeratedCapacity: 0,
        refrigeratedIce: 0,
        unrefrigeratedIce: 0,
      };
    }
    return playerStorageSplit(player, this.config.economy.refrigeratorStoragePerUnit);
  }

  private resetSummerSkipVotes(): void {
    for (const playerId of this.state.playerOrder) {
      this.state.summerSkipVotesByPlayerId[playerId] = false;
    }
  }

  private applySeasonFlipEffects(flip: SeasonFlip): void {
    this.resetSummerSkipVotes();

    const seasonFlipIncome = this.config.economy.seasonFlipIncome;
    if (seasonFlipIncome !== 0) {
      for (const player of Object.values(this.state.players)) {
        player.money += seasonFlipIncome;
      }
    }

    if (flip.from === 'WINTER' && flip.to === 'SUMMER') {
      applyWinterToSummerMelt(this.state, this.config);
    }
  }

  tick(deltaMs: number): void {
    if (deltaMs <= 0) {
      return;
    }

    this.state.nowMs += deltaMs;

    if (!this.state.match.paused && !this.state.match.ended) {
      const seasonUpdate = updateSeasonClock(this.state, this.state.nowMs);

      for (const flip of seasonUpdate.flips) {
        this.applySeasonFlipEffects(flip);
      }

      updatePondHarvestJobs(this.state);
      updateFactoryJobs(this.state);
      syncTrainYear(this.state);

      if (this.botControlMode === 'INTERNAL_HEURISTIC') {
        tickBots(this.state, this.config, (action) => this.applyAction(action, 'BOT'));
      }
      evaluateTimeWin(this.state, this.config);
    }
  }

  suggestHeuristicBotAction(botPlayerId: string): GameAction | null {
    return chooseHeuristicBotAction(this.state, this.config, botPlayerId);
  }

  listBotCandidateActions(botPlayerId: string, maxActions = 28): GameAction[] {
    return enumerateCandidateBotActions(this.state, this.config, botPlayerId, maxActions);
  }

  applyExternalBotAction(actionInput: unknown): ActionResult {
    if (this.botControlMode !== 'EXTERNAL') {
      return {
        ok: false,
        code: 'INVALID_ACTION',
        message: 'External bot actions are disabled for this engine instance.',
      };
    }
    return this.applyAction(actionInput, 'BOT');
  }

  applyAction(actionInput: unknown, source: 'PLAYER' | 'BOT' = 'PLAYER'): ActionResult {
    const parse = GameActionSchema.safeParse(actionInput);
    if (!parse.success) {
      const result: ActionResult = {
        ok: false,
        code: 'INVALID_ACTION',
        message: 'Action payload failed schema validation.',
      };
      addLog(this.state, 'action.rejected', {
        source,
        reason: 'SCHEMA_VALIDATION_FAILED',
      });
      return result;
    }

    const action = parse.data as GameAction;

    if (source === 'BOT') {
      const actor = this.state.players[action.playerId];
      if (!actor || actor.controller !== 'BOT') {
        const invalidBotActor: ActionResult = {
          ok: false,
          code: 'INVALID_PLAYER',
          message: 'Bot action must be issued by a BOT player.',
        };
        addLog(this.state, 'action.rejected', {
          source,
          reason: 'BOT_ACTOR_INVALID',
          actionType: action.type,
          playerId: action.playerId,
        });
        return invalidBotActor;
      }

      if (this.botControlMode === 'EXTERNAL') {
        const nextAllowedAt = this.nextBotExternalActionAt[action.playerId] ?? 0;
        if (this.state.nowMs < nextAllowedAt) {
          const throttledResult: ActionResult = {
            ok: false,
            code: 'LIMIT_REACHED',
            message: 'Bot decision cadence throttled. Try again later.',
          };
          addLog(this.state, 'action.rejected', {
            source,
            reason: 'BOT_CADENCE_THROTTLED',
            actionType: action.type,
            playerId: action.playerId,
            nextAllowedAt,
          });
          return throttledResult;
        }
        this.nextBotExternalActionAt[action.playerId] =
          this.state.nowMs + this.config.timing.botDecisionCadenceMs;
      }
    }

    let result: ActionResult;

    switch (action.type) {
      case 'tile.buy':
        result = buyUnownedTile(this.state, this.config, action.playerId, action.x, action.y);
        break;
      case 'tile.buyFromPlayer':
        result = buyOwnedTile(this.state, this.config, action.playerId, action.x, action.y);
        break;
      case 'tile.buildFactory':
        result = buildFactory(this.state, this.config, action.playerId, action.x, action.y);
        break;
      case 'tile.buildManMadePond':
        result = buildManMadePond(this.state, this.config, action.playerId, action.x, action.y);
        break;
      case 'pond.harvest.start':
        result = startPondHarvest(this.state, this.config, action.playerId, action.x, action.y);
        break;
      case 'pond.harvest.claim':
        result = claimPondHarvest(this.state, this.config, action.playerId, action.pondJobId);
        break;
      case 'season.skipSummerVote': {
        const player = this.state.players[action.playerId];
        if (!player) {
          result = { ok: false, code: 'INVALID_PLAYER', message: 'Unknown player.' };
          break;
        }
        if (player.controller !== 'HUMAN') {
          result = {
            ok: false,
            code: 'INVALID_ACTION',
            message: 'Only human players can vote to skip summer.',
          };
          break;
        }
        if (this.state.season.logicSeason !== 'SUMMER') {
          result = {
            ok: false,
            code: 'WRONG_SEASON',
            message: 'Summer can only be skipped during summer.',
          };
          break;
        }

        this.state.summerSkipVotesByPlayerId[action.playerId] = true;
        const allPlayersVoted = this.state.playerOrder.every(
          (playerId) => this.state.summerSkipVotesByPlayerId[playerId] === true,
        );

        if (allPlayersVoted) {
          const forcedFlip = forceSeasonFlip(this.state, 'WINTER');
          if (forcedFlip) {
            this.applySeasonFlipEffects(forcedFlip);
          }
        }

        result = {
          ok: true,
          code: 'OK',
          message: allPlayersVoted
            ? 'Both players voted. Summer skipped to winter.'
            : 'Summer skip vote recorded.',
          payload: {
            allPlayersVoted,
          },
        };
        break;
      }
      case 'structure.house.sellIce':
        result = sellIceAtHouse(
          this.state,
          this.config,
          action.playerId,
          action.x,
          action.y,
          action.quantity,
        );
        break;
      case 'structure.house.sellBlueIce':
        result = sellBlueIceAtHouse(
          this.state,
          this.config,
          action.playerId,
          action.x,
          action.y,
          action.quantity,
        );
        break;
      case 'structure.factory.craftRefrigerator':
        result = startFactoryCraft(
          this.state,
          this.config,
          action.playerId,
          action.x,
          action.y,
          'REFRIGERATOR',
        );
        break;
      case 'structure.factory.craftBlueIce':
        result = startFactoryCraft(
          this.state,
          this.config,
          action.playerId,
          action.x,
          action.y,
          'BLUE_ICE',
        );
        break;
      case 'structure.train.sellAnnualShipment':
        result = sellAnnualTrainShipment(
          this.state,
          this.config,
          action.playerId,
          action.x,
          action.y,
        );
        break;
      case 'camera.move': {
        const camera = this.state.cameraByPlayer[action.playerId];
        if (!camera) {
          result = { ok: false, code: 'INVALID_PLAYER', message: 'Unknown camera owner.' };
          break;
        }

        camera.x = clamp(action.x, 0, this.state.width - camera.viewportTiles);
        camera.y = clamp(action.y, 0, this.state.height - camera.viewportTiles);
        result = {
          ok: true,
          code: 'OK',
          message: 'Camera moved.',
          payload: {
            x: camera.x,
            y: camera.y,
          },
        };
        break;
      }
      case 'tile.select':
        if (action.x < 0 || action.y < 0 || action.x >= this.state.width || action.y >= this.state.height) {
          result = { ok: false, code: 'INVALID_TILE', message: 'Selected tile is out of bounds.' };
          break;
        }
        if (this.state.tiles[action.y * this.state.width + action.x]?.type === 'VOID') {
          result = {
            ok: false,
            code: 'INVALID_ACTION',
            message: 'Border tiles cannot be selected.',
          };
          break;
        }
        this.state.selectedTileByPlayer[action.playerId] = { x: action.x, y: action.y };
        result = {
          ok: true,
          code: 'OK',
          message: 'Tile selected.',
          payload: {
            x: action.x,
            y: action.y,
          },
        };
        break;
      case 'player.forfeit':
        forfeitMatch(this.state, action.playerId);
        result = {
          ok: true,
          code: 'OK',
          message: 'Player forfeited.',
          payload: {
            winnerId: this.state.match.winnerId,
          },
        };
        break;
      default:
        result = { ok: false, code: 'INVALID_ACTION', message: 'Unsupported action.' };
    }

    if (result.ok) {
      addLog(this.state, 'action.accepted', {
        source,
        actionType: action.type,
        playerId: action.playerId,
      });
    } else {
      addLog(this.state, 'action.rejected', {
        source,
        actionType: action.type,
        playerId: action.playerId,
        code: result.code,
        message: result.message,
      });
    }

    return result;
  }
}
