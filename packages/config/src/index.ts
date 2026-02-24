import type { Season } from '@ice-king/shared';

export interface EconomyConfig {
  buyUnownedTileCost: number;
  buyoutTransferFee: number;
  seasonFlipIncome: number;
  pondHarvestCost: number;
  houseSellIcePrice: number;
  houseSellBlueIcePrice: number;
  buildFactoryMoneyCost: number;
  buildFactoryIceCost: number;
  buildManMadePondMoneyCost: number;
  buildManMadePondIceCost: number;
  factoryCraftMoneyCost: number;
  factoryCraftIceCost: number;
  trainShipmentIceCost: number;
  trainShipmentMoneyGain: number;
  refrigeratorStoragePerUnit: number;
}

export interface TimingConfig {
  seasonDurationMs: number;
  transitionDurationMs: number;
  pondHarvestDurationMs: number;
  factoryCraftDurationMs: number;
  matchDurationMs: number;
  reconnectPauseMs: number;
  botDecisionCadenceMs: number;
  botReactionDelayMs: number;
  botActionJitterMs: number;
}

export interface MapConfig {
  width: number;
  height: number;
  viewportTiles: number;
  naturalPondCount: number;
  housesCount: number;
  trainCount: number;
  pondMinDistance: number;
  pondClusterMin: number;
  pondClusterMax: number;
  forestDensity: number;
}

export interface GameConfig {
  startingSeason: Season;
  startingMoney: number;
  startingIce: number;
  startingBlueIce: number;
  startingRefrigerators: number;
  economy: EconomyConfig;
  timing: TimingConfig;
  map: MapConfig;
  win: {
    overtimeEnabled: boolean;
    overtimeDurationMs: number;
    refrigeratorNetWorthValue: number;
    regularIceNetWorthValue: number;
    blueIceNetWorthValue: number;
  };
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  startingSeason: 'WINTER',
  startingMoney: 20,
  startingIce: 0,
  startingBlueIce: 0,
  startingRefrigerators: 1,
  economy: {
    buyUnownedTileCost: 1,
    buyoutTransferFee: 1,
    seasonFlipIncome: 2,
    pondHarvestCost: 1,
    houseSellIcePrice: 2,
    houseSellBlueIcePrice: 8,
    buildFactoryMoneyCost: 2,
    buildFactoryIceCost: 2,
    buildManMadePondMoneyCost: 2,
    buildManMadePondIceCost: 1,
    factoryCraftMoneyCost: 2,
    factoryCraftIceCost: 2,
    trainShipmentIceCost: 3,
    trainShipmentMoneyGain: 9,
    refrigeratorStoragePerUnit: 2,
  },
  timing: {
    seasonDurationMs: 5 * 60 * 1000,
    transitionDurationMs: 60 * 1000,
    pondHarvestDurationMs: 60 * 1000,
    factoryCraftDurationMs: 2 * 60 * 1000,
    matchDurationMs: 30 * 60 * 1000,
    reconnectPauseMs: 90 * 1000,
    botDecisionCadenceMs: 2500,
    botReactionDelayMs: 750,
    botActionJitterMs: 900,
  },
  map: {
    width: 10,
    height: 10,
    viewportTiles: 5,
    naturalPondCount: 3,
    housesCount: 4,
    trainCount: 1,
    pondMinDistance: 3,
    pondClusterMin: 1,
    pondClusterMax: 2,
    forestDensity: 0.12,
  },
  win: {
    overtimeEnabled: true,
    overtimeDurationMs: 2 * 60 * 1000,
    refrigeratorNetWorthValue: 2,
    regularIceNetWorthValue: 2,
    blueIceNetWorthValue: 8,
  },
};

export function createGameConfig(
  overrides: Partial<GameConfig> = {},
  mode: 'PROD' | 'DEV_FAST' = 'PROD',
): GameConfig {
  const merged: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    ...overrides,
    economy: {
      ...DEFAULT_GAME_CONFIG.economy,
      ...(overrides.economy ?? {}),
    },
    timing: {
      ...DEFAULT_GAME_CONFIG.timing,
      ...(overrides.timing ?? {}),
    },
    map: {
      ...DEFAULT_GAME_CONFIG.map,
      ...(overrides.map ?? {}),
    },
    win: {
      ...DEFAULT_GAME_CONFIG.win,
      ...(overrides.win ?? {}),
    },
  };

  if (mode === 'DEV_FAST') {
    merged.timing.seasonDurationMs = 75 * 1000;
    merged.timing.transitionDurationMs = 15 * 1000;
    merged.timing.factoryCraftDurationMs = 20 * 1000;
    merged.timing.matchDurationMs = 8 * 60 * 1000;
    merged.timing.botDecisionCadenceMs = 1200;
    merged.timing.botReactionDelayMs = 250;
    merged.timing.botActionJitterMs = 350;
  }

  return merged;
}
