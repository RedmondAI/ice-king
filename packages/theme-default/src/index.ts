import type { ThemeManifest } from '@ice-king/shared';

export const themePalette = {
  grassBase: '#2ECC40',
  grassHighlight: '#7EFF3F',
  dirtPath: '#C47F17',
  dirtWarmEdge: '#E06D10',
  waterCerulean: '#1E90FF',
  waterTurquoise: '#00D4AA',
  treeShadow: '#1A7A2E',
  treeHighlight: '#76D726',
  trunkDark: '#5C3317',
  trunkHighlight: '#B5651D',
  rockSlate: '#5A6E82',
  rockLavenderShadow: '#9B7FC4',
  shadowPurple: '#3D1F56',
  shadowTeal: '#0D4F4F',
  warmGold: '#FFE066',
  warmPink: '#FFB6C1',
  bodyText: '#3E2723',
  snowBase: '#CFE8FF',
  snowShade: '#A9C6EA',
  iceBase: '#8FE9FF',
  iceCrack: '#4E92D4',
  uiPanel: '#F6E7C8',
  uiBorder: '#6B4F2A',
  ownershipBlue: '#37A6FF',
  ownershipRed: '#F56A6A',
  highlightYellow: '#F8E36B',
};

const transitionFrames = ['kf0', 'kf1', 'kf2', 'kf3', 'kf4', 'kf5', 'kf6', 'kf7', 'kf8'];

export const defaultThemeManifest: ThemeManifest = {
  id: 'default-snes-vivid',
  displayName: 'SNES Vivid Cozy',
  tileSprites: {
    GRASS: 'proc://grass-variants',
    FOREST: 'proc://forest-variants',
    POND: 'proc://pond-variants',
    HOUSE: 'proc://house',
    FACTORY: 'proc://factory',
    TRAIN: 'proc://train-station',
  },
  uiSprites: {
    panel: 'proc://ui-panel',
    button: 'proc://ui-button',
    minimapFrame: 'proc://ui-minimap-frame',
  },
  paletteTokens: themePalette,
  seasonTransitionFrames: {
    SUMMER_TO_WINTER: transitionFrames,
    WINTER_TO_SUMMER: transitionFrames,
  },
};

export const SEASON_KEYFRAME_SECONDS = [0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60] as const;

export function seasonTintBlend(from: 'SUMMER' | 'WINTER', progress: number): {
  grassShift: number;
  snowCoverage: number;
  waterFreeze: number;
  treeDesaturation: number;
} {
  const clamped = Math.max(0, Math.min(1, progress));
  if (from === 'SUMMER') {
    return {
      grassShift: -0.45 * clamped,
      snowCoverage: clamped,
      waterFreeze: clamped,
      treeDesaturation: clamped * 0.7,
    };
  }

  return {
    grassShift: 0.45 * clamped,
    snowCoverage: 1 - clamped,
    waterFreeze: 1 - clamped,
    treeDesaturation: (1 - clamped) * 0.7,
  };
}
