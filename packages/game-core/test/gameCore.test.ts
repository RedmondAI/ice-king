import { describe, expect, test } from 'vitest';
import { GameEngine } from '../src/engine';
import type { TileState } from '@ice-king/shared';

function createHeadToHeadEngine(overrides: Parameters<typeof GameEngine>[0]['config'] = {}) {
  return new GameEngine({
    seed: 'test-seed',
    config: {
      startingSeason: 'SUMMER',
      timing: {
        seasonDurationMs: 1000,
        transitionDurationMs: 200,
        pondHarvestDurationMs: 600,
        factoryCraftDurationMs: 300,
        matchDurationMs: 100000,
        reconnectPauseMs: 1000,
        botDecisionCadenceMs: 200,
        botReactionDelayMs: 50,
        botActionJitterMs: 1,
      },
      ...overrides,
    },
    players: [
      { id: 'P1', name: 'Blue', color: 'BLUE', controller: 'HUMAN' },
      { id: 'P2', name: 'Red', color: 'RED', controller: 'HUMAN' },
    ],
  });
}

function firstTileBy(
  engine: GameEngine,
  predicate: (tile: TileState) => boolean,
): { x: number; y: number } {
  const tile = engine.getState().tiles.find(predicate);
  if (!tile) {
    throw new Error('No matching tile found for test setup');
  }
  return { x: tile.x, y: tile.y };
}

describe('tile purchase economics', () => {
  test('buy unowned then buyout transfers correct funds and price progression', () => {
    const engine = createHeadToHeadEngine();
    const startMoney = engine.config.startingMoney;
    const buyCost = engine.config.economy.buyUnownedTileCost;
    const buyoutFee = engine.config.economy.buyoutTransferFee;
    const target = firstTileBy(engine, (tile) => tile.ownerId === null && tile.type !== 'VOID');

    const buyResult = engine.applyAction({ type: 'tile.buy', playerId: 'P1', ...target });
    expect(buyResult.ok).toBe(true);

    const afterBuy = engine.getState();
    expect(afterBuy.players.P1.money).toBe(startMoney - buyCost);

    const tileAfterBuy = afterBuy.tiles.find((tile) => tile.x === target.x && tile.y === target.y);
    expect(tileAfterBuy?.ownerId).toBe('P1');
    expect(tileAfterBuy?.currentPrice).toBe(1);

    const buyoutResult = engine.applyAction({ type: 'tile.buyFromPlayer', playerId: 'P2', ...target });
    expect(buyoutResult.ok).toBe(true);

    const afterBuyout = engine.getState();
    expect(afterBuyout.players.P2.money).toBe(startMoney - (buyCost + buyoutFee));
    expect(afterBuyout.players.P1.money).toBe(startMoney);

    const tileAfterBuyout = afterBuyout.tiles.find((tile) => tile.x === target.x && tile.y === target.y);
    expect(tileAfterBuyout?.ownerId).toBe('P2');
    expect(tileAfterBuyout?.currentPrice).toBe(2);
  });

  test('net worth increases with territory expansion', () => {
    const engine = createHeadToHeadEngine();
    const state = engine.getState();
    state.players.P2.money = 20;

    const before = engine.getNetWorth().find((entry) => entry.playerId === 'P2')?.value ?? 0;
    const expansionTargets = state.tiles
      .filter((tile) => tile.ownerId === null && tile.type !== 'VOID')
      .slice(0, 5);
    expect(expansionTargets.length).toBe(5);

    for (const target of expansionTargets) {
      const result = engine.applyAction({
        type: 'tile.buy',
        playerId: 'P2',
        x: target.x,
        y: target.y,
      });
      expect(result.ok).toBe(true);
    }

    const after = engine.getNetWorth().find((entry) => entry.playerId === 'P2')?.value ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  test('border tiles are non-interactable', () => {
    const engine = createHeadToHeadEngine();
    const border = firstTileBy(engine, (tile) => tile.type === 'VOID');

    const buyResult = engine.applyAction({ type: 'tile.buy', playerId: 'P1', ...border });
    expect(buyResult.ok).toBe(false);

    const selectResult = engine.applyAction({ type: 'tile.select', playerId: 'P1', ...border });
    expect(selectResult.ok).toBe(false);
  });
});

describe('build and structure actions', () => {
  test('factory and man-made pond obey ownership and resource gates', () => {
    const engine = createHeadToHeadEngine();
    const state = engine.getState();

    const tile = firstTileBy(engine, (entry) => entry.type === 'GRASS' && entry.ownerId === null);
    engine.applyAction({ type: 'tile.buy', playerId: 'P1', ...tile });

    const noIceResult = engine.applyAction({ type: 'tile.buildFactory', playerId: 'P1', ...tile });
    expect(noIceResult.ok).toBe(false);

    state.players.P1.ice = 10;
    state.players.P1.money = 10;

    const buildFactoryResult = engine.applyAction({ type: 'tile.buildFactory', playerId: 'P1', ...tile });
    expect(buildFactoryResult.ok).toBe(true);

    const tileState = state.tiles.find((entry) => entry.x === tile.x && entry.y === tile.y);
    expect(tileState?.type).toBe('FACTORY');

    const invalidPondBuild = engine.applyAction({
      type: 'tile.buildManMadePond',
      playerId: 'P1',
      ...tile,
    });
    expect(invalidPondBuild.ok).toBe(false);

    const secondTile = firstTileBy(
      engine,
      (entry) => entry.ownerId === null && (entry.type === 'GRASS' || entry.type === 'FOREST'),
    );
    engine.applyAction({ type: 'tile.buy', playerId: 'P1', ...secondTile });

    const buildPondResult = engine.applyAction({
      type: 'tile.buildManMadePond',
      playerId: 'P1',
      ...secondTile,
    });
    expect(buildPondResult.ok).toBe(true);

    const secondTileState = state.tiles.find((entry) => entry.x === secondTile.x && entry.y === secondTile.y);
    expect(secondTileState?.type).toBe('POND');
  });

  test('factory jobs complete after craft duration and produce output', () => {
    const engine = createHeadToHeadEngine();
    const state = engine.getState();

    const factoryTile = firstTileBy(engine, (entry) => entry.type === 'GRASS' || entry.type === 'FOREST');
    const tileRef = state.tiles.find((entry) => entry.x === factoryTile.x && entry.y === factoryTile.y);
    if (!tileRef) {
      throw new Error('Factory tile missing.');
    }

    tileRef.ownerId = 'P1';
    tileRef.type = 'FACTORY';
    state.players.P1.ice = 10;
    state.players.P1.money = 10;

    const craftResult = engine.applyAction({
      type: 'structure.factory.craftBlueIce',
      playerId: 'P1',
      ...factoryTile,
    });
    expect(craftResult.ok).toBe(true);

    engine.tick(299);
    expect(state.players.P1.blueIce).toBe(0);

    engine.tick(1);
    expect(state.players.P1.blueIce).toBe(1);
  });

  test('train shipment limited to once per year and resets after two flips', () => {
    const engine = createHeadToHeadEngine();
    const state = engine.getState();

    const trainTile = firstTileBy(engine, (entry) => entry.type === 'TRAIN');
    const tileRef = state.tiles.find((entry) => entry.x === trainTile.x && entry.y === trainTile.y);
    if (!tileRef) {
      throw new Error('Train tile missing.');
    }

    tileRef.ownerId = 'P1';
    state.players.P1.ice = 10;

    const firstSale = engine.applyAction({
      type: 'structure.train.sellAnnualShipment',
      playerId: 'P1',
      ...trainTile,
    });
    expect(firstSale.ok).toBe(true);

    const secondSaleSameYear = engine.applyAction({
      type: 'structure.train.sellAnnualShipment',
      playerId: 'P1',
      ...trainTile,
    });
    expect(secondSaleSameYear.ok).toBe(false);

    engine.tick(2000);

    const secondYearSale = engine.applyAction({
      type: 'structure.train.sellAnnualShipment',
      playerId: 'P1',
      ...trainTile,
    });
    expect(secondYearSale.ok).toBe(true);
  });
});

describe('season and pond systems', () => {
  test('season transition progress and keyframe index update correctly', () => {
    const engine = createHeadToHeadEngine();
    const season = engine.getState().season;

    engine.tick(700);
    expect(season.transitionProgress).toBe(0);
    expect(season.logicSeason).toBe('SUMMER');

    engine.tick(200);
    expect(season.transitionProgress).toBeCloseTo(0.5, 3);
    expect(season.transitionKeyframeIndex).toBe(4);

    engine.tick(100);
    expect(season.logicSeason).toBe('WINTER');
    expect(season.transitionProgress).toBe(0);
  });

  test('players receive free money on each season flip', () => {
    const engine = createHeadToHeadEngine({ economy: { seasonFlipIncome: 2 } });
    const state = engine.getState();

    state.players.P1.money = 0;
    state.players.P2.money = 3;

    engine.tick(1000);
    expect(state.players.P1.money).toBe(2);
    expect(state.players.P2.money).toBe(5);

    engine.tick(1000);
    expect(state.players.P1.money).toBe(4);
    expect(state.players.P2.money).toBe(7);
  });

  test('summer skip requires both votes and then flips to winter', () => {
    const engine = createHeadToHeadEngine({
      startingSeason: 'SUMMER',
      economy: { seasonFlipIncome: 2 },
    });
    const state = engine.getState();

    state.players.P1.money = 1;
    state.players.P2.money = 4;

    const firstVote = engine.applyAction({
      type: 'season.skipSummerVote',
      playerId: 'P1',
    });
    expect(firstVote.ok).toBe(true);
    expect(state.season.logicSeason).toBe('SUMMER');
    expect(state.summerSkipVotesByPlayerId.P1).toBe(true);
    expect(state.summerSkipVotesByPlayerId.P2).toBe(false);

    const secondVote = engine.applyAction({
      type: 'season.skipSummerVote',
      playerId: 'P2',
    });
    expect(secondVote.ok).toBe(true);
    expect(state.season.logicSeason).toBe('WINTER');
    expect(state.players.P1.money).toBe(3);
    expect(state.players.P2.money).toBe(6);
    expect(state.summerSkipVotesByPlayerId.P1).toBe(false);
    expect(state.summerSkipVotesByPlayerId.P2).toBe(false);
  });

  test('pond harvest becomes claimable after harvest duration and can be claimed', () => {
    const engine = createHeadToHeadEngine({ startingSeason: 'WINTER' });
    const state = engine.getState();

    const pondTile = firstTileBy(engine, (entry) => entry.type === 'POND');
    const pondRef = state.tiles.find((entry) => entry.x === pondTile.x && entry.y === pondTile.y);
    if (!pondRef) {
      throw new Error('Pond tile missing.');
    }

    pondRef.ownerId = 'P1';
    state.players.P1.money = 5;

    const startResult = engine.applyAction({
      type: 'pond.harvest.start',
      playerId: 'P1',
      ...pondTile,
    });
    expect(startResult.ok).toBe(true);

    const harvestMs = engine.config.timing.pondHarvestDurationMs;
    engine.tick(harvestMs - 1);
    expect(state.ponds.find((entry) => entry.ownerId === 'P1')?.status).toBe('ACTIVE');

    engine.tick(1);

    const job = state.ponds.find((entry) => entry.ownerId === 'P1');
    expect(job?.status).toBe('CLAIMABLE');

    const claimResult = engine.applyAction({
      type: 'pond.harvest.claim',
      playerId: 'P1',
      pondJobId: job?.id,
    });
    expect(claimResult.ok).toBe(true);
    expect(state.players.P1.ice).toBe(1);
  });

  test('pond harvest can only be started in winter', () => {
    const engine = createHeadToHeadEngine({ startingSeason: 'SUMMER' });
    const state = engine.getState();

    const pondTile = firstTileBy(engine, (entry) => entry.type === 'POND');
    const pondRef = state.tiles.find((entry) => entry.x === pondTile.x && entry.y === pondTile.y);
    if (!pondRef) {
      throw new Error('Pond tile missing.');
    }

    pondRef.ownerId = 'P1';
    state.players.P1.money = 5;

    const startResult = engine.applyAction({
      type: 'pond.harvest.start',
      playerId: 'P1',
      ...pondTile,
    });

    expect(startResult.ok).toBe(false);
    expect(startResult.code).toBe('WRONG_SEASON');
    expect(state.ponds).toHaveLength(0);
  });

  test('pond harvest and house sale update player stats end-to-end', () => {
    const engine = createHeadToHeadEngine({ startingSeason: 'WINTER' });
    const state = engine.getState();

    const pondTile = firstTileBy(engine, (entry) => entry.type === 'POND');
    const houseTile = firstTileBy(engine, (entry) => entry.type === 'HOUSE');
    const pondRef = state.tiles.find((entry) => entry.x === pondTile.x && entry.y === pondTile.y);
    const houseRef = state.tiles.find((entry) => entry.x === houseTile.x && entry.y === houseTile.y);
    if (!pondRef || !houseRef) {
      throw new Error('Pond or house tile missing.');
    }

    pondRef.ownerId = 'P1';
    houseRef.ownerId = 'P1';
    state.players.P1.money = 5;
    state.players.P1.ice = 0;

    const startHarvestResult = engine.applyAction({
      type: 'pond.harvest.start',
      playerId: 'P1',
      ...pondTile,
    });
    expect(startHarvestResult.ok).toBe(true);
    expect(state.players.P1.money).toBe(4);

    engine.tick(engine.config.timing.pondHarvestDurationMs);

    const claimable = state.ponds.find(
      (entry) => entry.ownerId === 'P1' && entry.pondX === pondTile.x && entry.pondY === pondTile.y,
    );
    expect(claimable?.status).toBe('CLAIMABLE');

    const claimResult = engine.applyAction({
      type: 'pond.harvest.claim',
      playerId: 'P1',
      pondJobId: claimable?.id,
    });
    expect(claimResult.ok).toBe(true);
    expect(state.players.P1.ice).toBe(1);

    state.season.logicSeason = 'SUMMER';
    state.season.visualFromSeason = 'SUMMER';
    state.season.visualToSeason = 'WINTER';

    const sellResult = engine.applyAction({
      type: 'structure.house.sellIce',
      playerId: 'P1',
      ...houseTile,
      quantity: 1,
    });
    expect(sellResult.ok).toBe(true);
    expect(state.players.P1.ice).toBe(0);
    expect(state.players.P1.money).toBe(6);
  });

  test('winter to summer applies melt only to unrefrigerated regular ice', () => {
    const engine = createHeadToHeadEngine({ startingSeason: 'WINTER' });
    const state = engine.getState();

    state.players.P1.ice = 7;
    state.players.P1.refrigerators = 1;

    engine.tick(1000);
    expect(state.players.P1.ice).toBe(5);
  });
});

describe('match outcome rules', () => {
  test('time winner is based on highest money (not net worth)', () => {
    const engine = createHeadToHeadEngine({ win: { overtimeEnabled: false } });
    const state = engine.getState();

    state.players.P1.money = 12;
    state.players.P1.ice = 0;
    state.players.P1.blueIce = 0;
    state.players.P1.refrigerators = 0;

    state.players.P2.money = 8;
    state.players.P2.ice = 25;
    state.players.P2.blueIce = 4;
    state.players.P2.refrigerators = 8;

    state.match.durationMs = 1;
    engine.tick(1);

    expect(state.match.ended).toBe(true);
    expect(state.match.winnerId).toBe('P1');
  });

  test('time tie on money is a draw when overtime is disabled', () => {
    const engine = createHeadToHeadEngine({ win: { overtimeEnabled: false } });
    const state = engine.getState();

    state.players.P1.money = 10;
    state.players.P2.money = 10;
    state.players.P2.ice = 50;
    state.players.P2.blueIce = 10;
    state.players.P2.refrigerators = 12;

    state.match.durationMs = 1;
    engine.tick(1);

    expect(state.match.ended).toBe(true);
    expect(state.match.winnerId).toBeNull();
  });
});

describe('bot behavior constraints', () => {
  test('external bot mode enforces bot identity and cadence throttle', () => {
    const engine = GameEngine.createPlayVsComputer('bot-test', 'Human', 'DEV_FAST', 'EXTERNAL');
    const state = engine.getState();
    const target = firstTileBy(engine, (tile) => tile.ownerId === null && tile.type !== 'VOID');

    const invalidHumanBotAction = engine.applyExternalBotAction({
      type: 'tile.buy',
      playerId: 'P1',
      ...target,
    });
    expect(invalidHumanBotAction.ok).toBe(false);

    state.players.P2.money = 10;
    const firstBotAction = engine.applyExternalBotAction({
      type: 'tile.buy',
      playerId: 'P2',
      ...target,
    });
    expect(firstBotAction.ok).toBe(true);

    const secondBotAction = engine.applyExternalBotAction({
      type: 'tile.buy',
      playerId: 'P2',
      x: target.x + 1,
      y: target.y,
    });
    expect(secondBotAction.ok).toBe(false);
    if (!secondBotAction.ok) {
      expect(secondBotAction.code).toBe('LIMIT_REACHED');
    }
  });

  test('internal heuristic bot performs legal actions over time', () => {
    const engine = GameEngine.createPlayVsComputer('bot-legality', 'Human', 'DEV_FAST');

    for (let i = 0; i < 240; i += 1) {
      engine.tick(250);
    }

    const logs = engine.getState().actionLog;
    const botAccepted = logs.filter(
      (entry) =>
        entry.type === 'action.accepted' &&
        entry.payload.source === 'BOT' &&
        entry.payload.playerId === 'P2',
    );

    expect(botAccepted.length).toBeGreaterThan(0);

    const botOwnedTiles = engine
      .getState()
      .tiles.filter((tile) => tile.ownerId === 'P2')
      .length;
    expect(botOwnedTiles).toBeGreaterThan(0);
  });

  test('bot candidate action list is rich, deduplicated, and season-aware', () => {
    const engine = GameEngine.createPlayVsComputer('bot-candidates', 'Human', 'DEV_FAST', 'EXTERNAL');
    const state = engine.getState();

    state.players.P2.money = 30;
    state.players.P2.ice = 12;
    state.players.P2.blueIce = 2;

    const ownedGrass = state.tiles.find((tile) => tile.ownerId === null && tile.type === 'GRASS');
    const ponds = state.tiles.filter((tile) => tile.type === 'POND');
    const house = state.tiles.find((tile) => tile.type === 'HOUSE');
    const factory = state.tiles.find((tile) => tile.ownerId === null && tile.type === 'GRASS');
    const train = state.tiles.find((tile) => tile.type === 'TRAIN');

    if (!ownedGrass || ponds.length < 2 || !house || !factory || !train) {
      throw new Error('Unable to allocate required tiles for bot candidate setup.');
    }

    const [pond, freePond] = ponds;

    ownedGrass.ownerId = 'P2';
    pond.ownerId = 'P2';
    freePond.ownerId = 'P2';
    house.ownerId = 'P2';
    train.ownerId = 'P2';
    factory.ownerId = 'P2';
    factory.type = 'FACTORY';

    state.season.logicSeason = 'SUMMER';
    state.season.visualFromSeason = 'SUMMER';
    state.season.visualToSeason = 'WINTER';
    state.ponds.push({
      id: 'claimable-test-job',
      ownerId: 'P2',
      pondX: pond.x,
      pondY: pond.y,
      status: 'CLAIMABLE',
      harvestIceYield: 1,
      createdAtMs: state.nowMs,
      claimAtMs: state.nowMs,
      claimedAtMs: null,
    });

    const summerActions = engine.listBotCandidateActions('P2', 40);
    expect(summerActions.length).toBeGreaterThan(6);
    expect(summerActions.length).toBeLessThanOrEqual(40);

    const summerSerialized = summerActions.map((action) => JSON.stringify(action));
    expect(new Set(summerSerialized).size).toBe(summerActions.length);
    expect(summerActions.every((action) => action.playerId === 'P2')).toBe(true);

    const summerTypes = new Set(summerActions.map((action) => action.type));
    expect(summerTypes.has('pond.harvest.claim')).toBe(true);
    expect(summerTypes.has('structure.house.sellIce')).toBe(true);
    expect(summerTypes.has('structure.factory.craftBlueIce')).toBe(true);
    expect(summerTypes.has('structure.train.sellAnnualShipment')).toBe(true);
    expect(summerTypes.has('tile.buy')).toBe(true);
    expect(summerTypes.has('pond.harvest.start')).toBe(false);

    state.season.logicSeason = 'WINTER';
    state.season.visualFromSeason = 'WINTER';
    state.season.visualToSeason = 'SUMMER';

    const winterActions = engine.listBotCandidateActions('P2', 40);
    const winterTypes = new Set(winterActions.map((action) => action.type));
    expect(winterTypes.has('pond.harvest.start')).toBe(true);
  });

  test('heuristic prioritizes high-value expansion targets early', () => {
    const engine = GameEngine.createPlayVsComputer('bot-priority', 'Human', 'DEV_FAST', 'EXTERNAL');
    const state = engine.getState();
    state.players.P2.money = 20;

    const action = engine.suggestHeuristicBotAction('P2');
    expect(action).not.toBeNull();
    if (!action) {
      return;
    }

    expect(action.type === 'tile.buy' || action.type === 'tile.buyFromPlayer').toBe(true);
    if (action.type !== 'tile.buy' && action.type !== 'tile.buyFromPlayer') {
      return;
    }

    const targetTile = state.tiles.find((tile) => tile.x === action.x && tile.y === action.y);
    expect(targetTile).toBeTruthy();
    if (!targetTile) {
      return;
    }

    expect(['TRAIN', 'HOUSE', 'POND']).toContain(targetTile.type);
  });
});
