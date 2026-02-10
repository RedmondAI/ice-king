import type { TileType } from '@ice-king/shared';

import grassSummerUrl from '../../assets/tiles256/grass-summer.png';
import grassWinterUrl from '../../assets/tiles256/grass-winter.png';
import forestSummerUrl from '../../assets/tiles256/forest-summer.png';
import forestWinterUrl from '../../assets/tiles256/forest-winter.png';
import pondSummerUrl from '../../assets/tiles256/pond-summer.png';
import pondWinterUrl from '../../assets/tiles256/pond-winter.png';
import houseSummerUrl from '../../assets/tiles256/house-summer.png';
import houseWinterUrl from '../../assets/tiles256/house-winter.png';
import factorySummerUrl from '../../assets/tiles256/factory-summer.png';
import factoryWinterUrl from '../../assets/tiles256/factory-winter.png';
import trainSummerUrl from '../../assets/tiles256/train-summer.png';
import trainWinterUrl from '../../assets/tiles256/train-winter.png';

import grassTransitionUrl from '../../assets/tiles-transition256/grass-transition-winter-to-summer-grid.png';
import forestTransitionUrl from '../../assets/tiles-transition256/forest-transition-winter-to-summer-grid.png';
import pondTransitionUrl from '../../assets/tiles-transition256/pond-transition-winter-to-summer-grid.png';
import houseTransitionUrl from '../../assets/tiles-transition256/house-transition-winter-to-summer-grid.png';
import factoryTransitionUrl from '../../assets/tiles-transition256/factory-transition-winter-to-summer-grid.png';
import trainTransitionUrl from '../../assets/tiles-transition256/train-transition-winter-to-summer-grid.png';

type ArtTileType = 'GRASS' | 'FOREST' | 'POND' | 'HOUSE' | 'FACTORY' | 'TRAIN';

interface TileArtBundle {
  summer: HTMLImageElement;
  winter: HTMLImageElement;
  transitionSheet: HTMLImageElement;
  transitionFrames: HTMLCanvasElement[];
}

function clampFrameIndex(index: number): number {
  return Math.max(0, Math.min(8, index));
}

function createImage(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

function sliceTransitionSheet(sheet: HTMLImageElement): HTMLCanvasElement[] {
  if (!sheet.naturalWidth || !sheet.naturalHeight) {
    return [];
  }

  const sourceCellW = Math.floor(sheet.naturalWidth / 3);
  const sourceCellH = Math.floor(sheet.naturalHeight / 3);
  if (sourceCellW <= 0 || sourceCellH <= 0) {
    return [];
  }

  const frames: HTMLCanvasElement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const frame = document.createElement('canvas');
      frame.width = 256;
      frame.height = 256;
      const ctx = frame.getContext('2d');
      if (!ctx) {
        continue;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sheet,
        col * sourceCellW,
        row * sourceCellH,
        sourceCellW,
        sourceCellH,
        0,
        0,
        256,
        256,
      );
      frames.push(frame);
    }
  }
  return frames;
}

function buildBundle(summerUrl: string, winterUrl: string, transitionUrl: string): TileArtBundle {
  const summer = createImage(summerUrl);
  const winter = createImage(winterUrl);
  const transitionSheet = createImage(transitionUrl);

  const bundle: TileArtBundle = {
    summer,
    winter,
    transitionSheet,
    transitionFrames: [],
  };

  const updateFrames = () => {
    bundle.transitionFrames = sliceTransitionSheet(transitionSheet);
  };

  if (transitionSheet.complete && transitionSheet.naturalWidth > 0) {
    updateFrames();
  } else {
    transitionSheet.addEventListener('load', updateFrames, { once: true });
  }

  return bundle;
}

export class TileArtLibrary {
  private readonly bundles: Record<ArtTileType, TileArtBundle>;

  constructor() {
    this.bundles = {
      GRASS: buildBundle(grassSummerUrl, grassWinterUrl, grassTransitionUrl),
      FOREST: buildBundle(forestSummerUrl, forestWinterUrl, forestTransitionUrl),
      POND: buildBundle(pondSummerUrl, pondWinterUrl, pondTransitionUrl),
      HOUSE: buildBundle(houseSummerUrl, houseWinterUrl, houseTransitionUrl),
      FACTORY: buildBundle(factorySummerUrl, factoryWinterUrl, factoryTransitionUrl),
      TRAIN: buildBundle(trainSummerUrl, trainWinterUrl, trainTransitionUrl),
    };
  }

  private bundleFor(type: TileType): TileArtBundle {
    switch (type) {
      case 'GRASS':
      case 'FOREST':
      case 'POND':
      case 'HOUSE':
      case 'FACTORY':
      case 'TRAIN':
        return this.bundles[type];
      case 'VOID':
        return this.bundles.GRASS;
      default:
        return this.bundles.GRASS;
    }
  }

  frameFor(type: TileType, frameIndex: number): CanvasImageSource | null {
    if (type === 'VOID') {
      return null;
    }
    const bundle = this.bundleFor(type);
    const index = clampFrameIndex(frameIndex);

    if (bundle.transitionFrames.length === 9) {
      return bundle.transitionFrames[index] ?? bundle.transitionFrames[0] ?? null;
    }

    // Fallback if transition sheet has not loaded yet.
    return index <= 4 ? bundle.winter : bundle.summer;
  }
}
