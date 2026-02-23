import type { GameConfig } from '@ice-king/config';
import type { ActionResult, GameAction, GameState, TileState } from '@ice-king/shared';
import { playerStorageSplit, tileIndex } from '../helpers';

interface Point {
  x: number;
  y: number;
}

const BOT_ACTION_COOLDOWN_MIN_MS = 20000;
const BOT_ACTION_COOLDOWN_MAX_MS = 30000;

function deterministicJitterMs(nowMs: number, playerId: string, maxJitter: number): number {
  let hash = 0;
  const key = `${playerId}:${nowMs}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % Math.max(1, maxJitter);
}

function deterministicActionCooldownMs(nowMs: number, playerId: string): number {
  const spread = BOT_ACTION_COOLDOWN_MAX_MS - BOT_ACTION_COOLDOWN_MIN_MS;
  const jitter = deterministicJitterMs(nowMs, `${playerId}:cooldown`, spread + 1);
  return BOT_ACTION_COOLDOWN_MIN_MS + jitter;
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

function allTilesByOwner(state: GameState, ownerId: string): TileState[] {
  return state.tiles.filter((tile) => tile.ownerId === ownerId);
}

function neighbors(state: GameState, x: number, y: number): Point[] {
  const points: Point[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < state.width && ny < state.height) {
        points.push({ x: nx, y: ny });
      }
    }
  }
  return points;
}

function tileAt(state: GameState, x: number, y: number): TileState {
  return state.tiles[tileIndex(state.width, x, y)] as TileState;
}

function isPlayableTile(tile: TileState): boolean {
  return tile.type !== 'VOID';
}

function ownedPondWithoutJob(state: GameState, playerId: string): Point | null {
  const ownedPonds = allTilesByOwner(state, playerId).filter((tile) => tile.type === 'POND');
  for (const pond of ownedPonds) {
    const hasJob = state.ponds.some(
      (job) =>
        job.pondX === pond.x &&
        job.pondY === pond.y &&
        job.ownerId === playerId &&
        (job.status === 'ACTIVE' || job.status === 'CLAIMABLE'),
    );
    if (!hasJob) {
      return { x: pond.x, y: pond.y };
    }
  }
  return null;
}

function claimablePondJob(state: GameState, playerId: string): string | null {
  const job = state.ponds.find((entry) => entry.ownerId === playerId && entry.status === 'CLAIMABLE');
  return job?.id ?? null;
}

function availableFactory(state: GameState, playerId: string): Point | null {
  const ownedFactories = allTilesByOwner(state, playerId).filter((tile) => tile.type === 'FACTORY');
  for (const factory of ownedFactories) {
    const busy = state.factoryJobs.some(
      (job) => job.x === factory.x && job.y === factory.y && job.status === 'ACTIVE',
    );
    if (!busy) {
      return { x: factory.x, y: factory.y };
    }
  }
  return null;
}

function ownStructure(state: GameState, playerId: string, type: 'HOUSE' | 'TRAIN'): Point | null {
  const tile = allTilesByOwner(state, playerId).find((entry) => entry.type === type);
  return tile ? { x: tile.x, y: tile.y } : null;
}

function ownBuildableTile(state: GameState, playerId: string): Point | null {
  const tile = allTilesByOwner(state, playerId).find(
    (entry) => entry.type === 'GRASS' || entry.type === 'FOREST',
  );
  return tile ? { x: tile.x, y: tile.y } : null;
}

function ownBuildableTiles(state: GameState, playerId: string, limit: number): Point[] {
  const points: Point[] = [];
  for (const tile of allTilesByOwner(state, playerId)) {
    if (tile.type === 'GRASS' || tile.type === 'FOREST') {
      points.push({ x: tile.x, y: tile.y });
      if (points.length >= limit) {
        break;
      }
    }
  }
  return points;
}

function availableFactories(state: GameState, playerId: string, limit: number): Point[] {
  const points: Point[] = [];
  const ownedFactories = allTilesByOwner(state, playerId).filter((tile) => tile.type === 'FACTORY');
  for (const factory of ownedFactories) {
    const busy = state.factoryJobs.some(
      (job) => job.x === factory.x && job.y === factory.y && job.status === 'ACTIVE',
    );
    if (!busy) {
      points.push({ x: factory.x, y: factory.y });
      if (points.length >= limit) {
        break;
      }
    }
  }
  return points;
}

function ownHouses(state: GameState, playerId: string): Point[] {
  return allTilesByOwner(state, playerId)
    .filter((tile) => tile.type === 'HOUSE')
    .map((tile) => ({ x: tile.x, y: tile.y }));
}

function ownPondsWithoutJobs(state: GameState, playerId: string, limit: number): Point[] {
  const points: Point[] = [];
  const ownedPonds = allTilesByOwner(state, playerId).filter((tile) => tile.type === 'POND');
  for (const pond of ownedPonds) {
    const hasJob = state.ponds.some(
      (job) =>
        job.pondX === pond.x &&
        job.pondY === pond.y &&
        job.ownerId === playerId &&
        (job.status === 'ACTIVE' || job.status === 'CLAIMABLE'),
    );
    if (!hasJob) {
      points.push({ x: pond.x, y: pond.y });
      if (points.length >= limit) {
        break;
      }
    }
  }
  return points;
}

interface ExpansionTarget {
  x: number;
  y: number;
  buyout: boolean;
}

function collectExpansionTargets(
  state: GameState,
  playerId: string,
  includeFallback: boolean,
  limit: number,
): ExpansionTarget[] {
  const targets: ExpansionTarget[] = [];
  const seen = new Set<string>();

  const push = (target: ExpansionTarget): void => {
    const key = `${target.x},${target.y},${target.buyout ? 'B' : 'U'}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    targets.push(target);
  };

  const owned = allTilesByOwner(state, playerId);
  for (const tile of owned) {
    for (const point of neighbors(state, tile.x, tile.y)) {
      const candidate = tileAt(state, point.x, point.y);
      if (!isPlayableTile(candidate)) {
        continue;
      }
      if (candidate.ownerId === null) {
        push({ x: candidate.x, y: candidate.y, buyout: false });
      } else if (candidate.ownerId !== playerId) {
        push({ x: candidate.x, y: candidate.y, buyout: true });
      }
      if (targets.length >= limit) {
        return targets;
      }
    }
  }

  for (const tile of state.tiles) {
    if (!isPlayableTile(tile)) {
      continue;
    }
    if (tile.type === 'POND' || tile.type === 'HOUSE' || tile.type === 'TRAIN') {
      if (tile.ownerId === null) {
        push({ x: tile.x, y: tile.y, buyout: false });
      } else if (tile.ownerId !== playerId) {
        push({ x: tile.x, y: tile.y, buyout: true });
      }
    }
    if (targets.length >= limit) {
      return targets;
    }
  }

  if (!includeFallback) {
    return targets;
  }

  for (const tile of state.tiles) {
    if (!isPlayableTile(tile)) {
      continue;
    }
    if (tile.ownerId === null) {
      push({ x: tile.x, y: tile.y, buyout: false });
    }
    if (targets.length >= limit) {
      break;
    }
  }

  return targets;
}

function addAction(
  actions: GameAction[],
  seen: Set<string>,
  action: GameAction,
  maxActions: number,
): void {
  if (actions.length >= maxActions) {
    return;
  }
  const key = canonicalize(action);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  actions.push(action);
}

function tileStrategicValue(tile: TileState): number {
  switch (tile.type) {
    case 'TRAIN':
      return 80;
    case 'HOUSE':
      return 68;
    case 'POND':
      return 52;
    case 'FACTORY':
      return 44;
    case 'FOREST':
      return 26;
    case 'VOID':
      return 0;
    case 'GRASS':
    default:
      return 22;
  }
}

function seasonMsUntilFlip(state: GameState): number {
  const flipAtMs = state.season.cycleStartMs + state.season.cycleDurationMs;
  return Math.max(0, flipAtMs - state.nowMs);
}

function ownedCountByType(state: GameState, playerId: string, type: TileState['type']): number {
  let count = 0;
  for (const tile of state.tiles) {
    if (tile.ownerId === playerId && tile.type === type) {
      count += 1;
    }
  }
  return count;
}

function scoreBotAction(
  state: GameState,
  config: GameConfig,
  botPlayerId: string,
  action: GameAction,
): number {
  const player = state.players[botPlayerId];
  if (!player) {
    return 0;
  }

  const storage = playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit);
  const msToFlip = seasonMsUntilFlip(state);
  const ownedFactories = ownedCountByType(state, botPlayerId, 'FACTORY');
  const ownedPonds = ownedCountByType(state, botPlayerId, 'POND');

  switch (action.type) {
    case 'pond.harvest.claim':
      return 160;
    case 'pond.harvest.start':
      if (state.season.logicSeason !== 'WINTER') {
        return 0;
      }
      return 128;
    case 'structure.train.sellAnnualShipment':
      return 112 + Math.max(0, 8 - player.money);
    case 'tile.buy':
    case 'tile.buyFromPlayer': {
      const tile = tileAt(state, action.x, action.y);
      const isBuyout = action.type === 'tile.buyFromPlayer';
      const cost =
        action.type === 'tile.buy'
          ? config.economy.buyUnownedTileCost
          : tile.currentPrice + config.economy.buyoutTransferFee;
      return (
        76 +
        tileStrategicValue(tile) +
        (isBuyout ? -Math.min(25, cost * 2) : 18) +
        Math.max(-24, 10 - cost)
      );
    }
    case 'tile.buildFactory':
      return 102 + (ownedFactories === 0 ? 24 : 0);
    case 'tile.buildManMadePond':
      return 94 + (ownedPonds < 2 ? 18 : 0) + (state.season.logicSeason === 'WINTER' ? 8 : 0);
    case 'structure.factory.craftRefrigerator':
      return 88 + storage.unrefrigeratedIce * 7 + (msToFlip < 25000 ? 12 : 0);
    case 'structure.factory.craftBlueIce':
      return 80 + (player.money < 8 ? 8 : 0) + (state.season.logicSeason === 'SUMMER' ? 6 : 0);
    case 'structure.house.sellIce':
      if (state.season.logicSeason !== 'SUMMER') {
        return 0;
      }
      return 72 + Math.min(24, action.quantity * 4) + (msToFlip < 20000 ? 10 : 0);
    case 'structure.house.sellBlueIce':
      if (state.season.logicSeason !== 'SUMMER') {
        return 0;
      }
      return 66 + Math.min(18, action.quantity * 5) + (player.money < 10 ? 10 : 0);
    case 'camera.move':
    case 'tile.select':
    case 'player.forfeit':
    default:
      return 0;
  }
}

export function enumerateCandidateBotActions(
  state: GameState,
  config: GameConfig,
  botPlayerId: string,
  maxActions = 28,
): GameAction[] {
  const player = state.players[botPlayerId];
  if (!player) {
    return [];
  }

  const actions: GameAction[] = [];
  const seen = new Set<string>();
  const storage = playerStorageSplit(player, config.economy.refrigeratorStoragePerUnit);
  const msToFlip = seasonMsUntilFlip(state);

  for (const job of state.ponds) {
    if (job.ownerId === botPlayerId && job.status === 'CLAIMABLE') {
      addAction(
        actions,
        seen,
        {
          type: 'pond.harvest.claim',
          playerId: botPlayerId,
          pondJobId: job.id,
        },
        maxActions,
      );
    }
  }

  if (state.season.logicSeason === 'WINTER' && player.money >= config.economy.pondHarvestCost) {
    const freePonds = ownPondsWithoutJobs(state, botPlayerId, 8);
    for (const pond of freePonds) {
      addAction(
        actions,
        seen,
        {
          type: 'pond.harvest.start',
          playerId: botPlayerId,
          x: pond.x,
          y: pond.y,
        },
        maxActions,
      );
    }
  }

  const houses = ownHouses(state, botPlayerId);
  const canSellAtHouse = state.season.logicSeason === 'SUMMER';
  for (const house of houses.slice(0, 2)) {
    if (canSellAtHouse) {
      if (storage.unrefrigeratedIce > 0) {
        addAction(
          actions,
          seen,
          {
            type: 'structure.house.sellIce',
            playerId: botPlayerId,
            x: house.x,
            y: house.y,
            quantity: storage.unrefrigeratedIce,
          },
          maxActions,
        );
      }

      if (player.ice > 0) {
        addAction(
          actions,
          seen,
          {
            type: 'structure.house.sellIce',
            playerId: botPlayerId,
            x: house.x,
            y: house.y,
            quantity: 1,
          },
          maxActions,
        );

        if (player.ice > 1) {
          addAction(
            actions,
            seen,
            {
              type: 'structure.house.sellIce',
              playerId: botPlayerId,
              x: house.x,
              y: house.y,
              quantity: player.ice,
            },
            maxActions,
          );
        }
      }

      if (player.blueIce > 0) {
        addAction(
          actions,
          seen,
          {
            type: 'structure.house.sellBlueIce',
            playerId: botPlayerId,
            x: house.x,
            y: house.y,
            quantity: 1,
          },
          maxActions,
        );

        if (player.blueIce > 1) {
          addAction(
            actions,
            seen,
            {
              type: 'structure.house.sellBlueIce',
              playerId: botPlayerId,
              x: house.x,
              y: house.y,
              quantity: player.blueIce,
            },
            maxActions,
          );
        }
      }
    }
  }

  const trainTile = ownStructure(state, botPlayerId, 'TRAIN');
  if (
    trainTile &&
    player.ice >= config.economy.trainShipmentIceCost &&
    state.trainSales.usedByPlayerId[botPlayerId] !== state.trainSales.currentYear
  ) {
    addAction(
      actions,
      seen,
      {
        type: 'structure.train.sellAnnualShipment',
        playerId: botPlayerId,
        x: trainTile.x,
        y: trainTile.y,
      },
      maxActions,
    );
  }

  if (
    player.money >= config.economy.factoryCraftMoneyCost &&
    player.ice >= config.economy.factoryCraftIceCost
  ) {
    for (const factory of availableFactories(state, botPlayerId, 4)) {
      addAction(
        actions,
        seen,
        {
          type: 'structure.factory.craftBlueIce',
          playerId: botPlayerId,
          x: factory.x,
          y: factory.y,
        },
        maxActions,
      );
      addAction(
        actions,
        seen,
        {
          type: 'structure.factory.craftRefrigerator',
          playerId: botPlayerId,
          x: factory.x,
          y: factory.y,
        },
        maxActions,
      );
    }
  }

  const ownedFactories = ownedCountByType(state, botPlayerId, 'FACTORY');
  const ownedPonds = ownedCountByType(state, botPlayerId, 'POND');

  for (const tile of ownBuildableTiles(state, botPlayerId, 10)) {
    if (
      ownedFactories === 0 &&
      player.money >= config.economy.buildFactoryMoneyCost &&
      player.ice >= config.economy.buildFactoryIceCost
    ) {
      addAction(
        actions,
        seen,
        {
          type: 'tile.buildFactory',
          playerId: botPlayerId,
          x: tile.x,
          y: tile.y,
        },
        maxActions,
      );
    }

    if (
      player.money >= config.economy.buildManMadePondMoneyCost &&
      player.ice >= config.economy.buildManMadePondIceCost
    ) {
      addAction(
        actions,
        seen,
        {
          type: 'tile.buildManMadePond',
          playerId: botPlayerId,
          x: tile.x,
          y: tile.y,
        },
        maxActions,
      );
    }
    if (
      ownedPonds >= 2 &&
      player.money >= config.economy.buildFactoryMoneyCost &&
      player.ice >= config.economy.buildFactoryIceCost
    ) {
      addAction(
        actions,
        seen,
        {
          type: 'tile.buildFactory',
          playerId: botPlayerId,
          x: tile.x,
          y: tile.y,
        },
        maxActions,
      );
    }
  }

  const expansionTargets = collectExpansionTargets(state, botPlayerId, true, 18);
  for (const target of expansionTargets) {
    if (!target.buyout) {
      if (player.money >= config.economy.buyUnownedTileCost) {
        addAction(
          actions,
          seen,
          {
            type: 'tile.buy',
            playerId: botPlayerId,
            x: target.x,
            y: target.y,
          },
          maxActions,
        );
      }
      continue;
    }

    const tile = tileAt(state, target.x, target.y);
    const buyoutCost = tile.currentPrice + config.economy.buyoutTransferFee;
    if (player.money >= buyoutCost) {
      addAction(
        actions,
        seen,
        {
          type: 'tile.buyFromPlayer',
          playerId: botPlayerId,
          x: target.x,
          y: target.y,
        },
        maxActions,
      );
    }
  }

  return actions
    .map((action, index) => ({
      action,
      index,
      score: scoreBotAction(state, config, botPlayerId, action),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxActions)
    .map((entry) => entry.action);
}

export function chooseHeuristicBotAction(
  state: GameState,
  config: GameConfig,
  botPlayerId: string,
): GameAction | null {
  const ranked = enumerateCandidateBotActions(state, config, botPlayerId, 1);
  return ranked[0] ?? null;
}

export function tickBots(
  state: GameState,
  config: GameConfig,
  dispatchAction: (action: GameAction) => ActionResult,
): void {
  if (state.match.ended) {
    return;
  }

  for (const bot of Object.values(state.bots)) {
    const player = state.players[bot.playerId];
    if (!player || !player.connected) {
      continue;
    }

    if (bot.pendingAction && state.nowMs >= bot.pendingAction.executeAtMs) {
      const result = dispatchAction(bot.pendingAction.action);
      bot.pendingAction = null;
      if (result.ok) {
        bot.nextDecisionAtMs = state.nowMs + deterministicActionCooldownMs(state.nowMs, bot.playerId);
      } else {
        bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs;
      }
    }

    if (bot.pendingAction) {
      continue;
    }

    if (state.nowMs < bot.nextDecisionAtMs) {
      continue;
    }

    const action = chooseHeuristicBotAction(state, config, bot.playerId);
    if (!action) {
      bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs;
      continue;
    }

    const jitter = deterministicJitterMs(state.nowMs, bot.playerId, config.timing.botActionJitterMs);
    bot.pendingAction = {
      id: `bot_action_${bot.playerId}_${state.nowMs}`,
      executeAtMs: state.nowMs + config.timing.botReactionDelayMs + jitter,
      action,
    };

    bot.nextDecisionAtMs = state.nowMs + config.timing.botDecisionCadenceMs;
  }
}
