#!/usr/bin/env python3
"""Build the forest season sheet from the AI-generated tree art.

`scripts/generate-forest-art.py` makes two images of the same pines on flat magenta
(winter with snow, summer without). This script:

- cuts the trees out of both images and scales them down to tile size,
- lays them on the grass tile's own frames, so the forest blends seamlessly with grass,
- adds a soft drop shadow,
- keeps every tree the same shape all year: the snow melts off in patches as summer
  comes, frame by frame (no translucent ghosting).

Inputs (never modified):
  art/source/forest-trees-winter.png
  art/source/forest-trees-summer.png
  art/tiles/grass-transition-winter-to-summer-grid.png
Output:
  art/tiles/forest-transition-winter-to-summer-grid.png

Usage (from roblox/):  python3 scripts/build-forest-tile.py   # needs numpy + Pillow
"""

from pathlib import Path

import numpy as np
from PIL import Image

from tileart import FRAME, FRAMES, fill_from_neighbours, is_magenta, load_frames, save_sheet, scale_down, smooth_noise

ROOT = Path(__file__).resolve().parent.parent
WINTER_TREES = ROOT / "art/source/forest-trees-winter.png"
SUMMER_TREES = ROOT / "art/source/forest-trees-summer.png"
GRASS = ROOT / "art/tiles/grass-transition-winter-to-summer-grid.png"
OUTPUT = ROOT / "art/tiles/forest-transition-winter-to-summer-grid.png"

EDGE_MARGIN = 14  # trees and shadows stay this far from the tile edge
SHADOW_OFFSET = (2, 4)  # (down, right)
# The trees' bounding box is scaled to fill the tile inside the margin and shadow.
TREES_FIT = FRAME - 2 * (EDGE_MARGIN + max(SHADOW_OFFSET))
WINTER_SHADOW = np.array([0.78, 0.84, 0.94])
SUMMER_SHADOW = np.array([0.55, 0.63, 0.55])
SUMMER_GAMMA = 0.85  # lift the summer needles so they read against the bright grass
SUMMER_TINT = np.array([1.04, 1.12, 0.92])


def tree_layers():
    """Winter and summer tree colours plus one shared tree mask, at tile scale."""
    winter = np.asarray(Image.open(WINTER_TREES).convert("RGB"), dtype=float)
    summer = np.asarray(Image.open(SUMMER_TREES).convert("RGB"), dtype=float)
    ys, xs = np.nonzero(~is_magenta(winter))
    crop = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    winter, summer = winter[crop], summer[crop]
    scale = TREES_FIT / max(winter.shape[:2])
    size = (round(winter.shape[1] * scale), round(winter.shape[0] * scale))
    winter_small, mask = scale_down(winter, (~is_magenta(winter)).astype(float), size)
    summer_small, summer_mask = scale_down(summer, (~is_magenta(summer)).astype(float), size)

    # Keep the winter silhouette in summer too; fill any gap from the nearest summer pixel.
    summer_small, _ = fill_from_neighbours(summer_small, summer_mask, mask)
    summer_small = 255 * (np.clip(summer_small, 0, 255) / 255) ** SUMMER_GAMMA * SUMMER_TINT
    return winter_small, summer_small, mask


def place(layer, mask):
    """Centre the trees in the tile; returns full-frame arrays."""
    ys, xs = np.nonzero(mask)
    top = (FRAME - (ys.max() - ys.min() + 1)) // 2 - ys.min()
    left = (FRAME - (xs.max() - xs.min() + 1)) // 2 - xs.min()
    full_layer = np.zeros((FRAME, FRAME, 3))
    full_mask = np.zeros((FRAME, FRAME), bool)
    height, width = mask.shape
    full_layer[top:top + height, left:left + width] = layer
    full_mask[top:top + height, left:left + width] = mask
    return full_layer, full_mask


def build():
    grass = load_frames(GRASS)
    winter_small, summer_small, small_mask = tree_layers()
    winter, tree = place(winter_small, small_mask)
    summer, _ = place(summer_small, small_mask)
    shadow = np.roll(np.roll(tree, SHADOW_OFFSET[0], 0), SHADOW_OFFSET[1], 1) & ~tree

    ys, xs = np.nonzero(tree | shadow)
    assert min(ys.min(), xs.min()) >= EDGE_MARGIN and max(ys.max(), xs.max()) < FRAME - EDGE_MARGIN, "trees too close to the edge"

    melt_order = smooth_noise(seed=5)
    frames = []
    for k in range(FRAMES):
        t = k / (FRAMES - 1)
        frame = grass[k].copy()
        frame[shadow] *= WINTER_SHADOW * (1 - t) + SUMMER_SHADOW * t
        melted = melt_order <= t if k else np.zeros_like(tree)
        frame[tree] = np.where(melted[tree][:, None], summer[tree], winter[tree])
        frames.append(frame)

    save_sheet(frames, OUTPUT)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
