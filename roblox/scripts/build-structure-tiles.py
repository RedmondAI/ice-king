#!/usr/bin/env python3
"""Rebuild the factory and train season sheets so each structure keeps its shape all year.

The original sheets cross-fade to a different factory / train in summer. Here:

- the structure is cut out of the original winter frame (frame 0),
- its summer look comes from art/source/<name>-summer.png (the same structure with the
  snow removed, painted by `scripts/generate-structure-art.py`), clipped to the winter
  silhouette so the shape cannot change,
- the ground is the grass tile's own transition, with the winter frame's snowy clearing
  (and its smoke) fading out as the season turns; frame 0 is the original winter frame,
- each in-between frame melts the snow in patches, and summer smoke fades in.

Usage (from roblox/):  python3 scripts/build-structure-tiles.py [factory|train ...]
"""

import sys

import numpy as np
from PIL import Image

from structures import ROOT, STRUCTURES, original_sheet, summer_path
from tileart import (
    FRAME,
    FRAMES,
    clearing_weight,
    draw_smoke,
    fill_from_neighbours,
    is_magenta,
    load_frames,
    save_sheet,
    scale_down,
    smooth_noise,
    structure_mask,
)

GRASS = ROOT / "art/tiles/grass-transition-winter-to-summer-grid.png"


def summer_layer(name, winter, mask):
    """The painted summer structure at tile scale, clipped to the winter silhouette.

    Small gaps in the painting are filled from neighbouring summer pixels; anything the
    model left unpainted beyond that (smoke wisps, a stray grass tuft) keeps its winter
    pixels, so the silhouette never changes."""
    art = np.asarray(Image.open(summer_path(name)).convert("RGB"), dtype=float)
    r, g, b = art[..., 0], art[..., 1], art[..., 2]
    background = is_magenta(art) | ((r - g > 30) & (b - g > 30))  # also dark purple edge blends
    colour, painted = scale_down(art, (~background).astype(float), (FRAME, FRAME))
    colour, filled = fill_from_neighbours(colour, painted & mask, mask, max_steps=2)
    return np.where(filled[..., None], colour, winter)


def build(name):
    settings = STRUCTURES[name]
    winter = load_frames(original_sheet(name))[0]
    grass = load_frames(GRASS)
    mask = structure_mask(winter)
    summer = summer_layer(name, winter, mask)
    melt_order = smooth_noise(seed=settings["melt_seed"])

    frames = []
    winter_clearing = (winter - grass[0]) * clearing_weight()
    for k in range(FRAMES):
        t = k / (FRAMES - 1)
        frame = np.clip(grass[k] + winter_clearing * (1 - t), 0, 255)
        melted = melt_order <= t if k else np.zeros_like(mask)
        frame[mask] = np.where(melted[mask][:, None], summer[mask], winter[mask])
        draw_smoke(frame, t, settings["smoke_puffs"])
        frames.append(frame)

    output = ROOT / f"art/tiles/{name}-transition-winter-to-summer-grid.png"
    save_sheet(frames, output)
    print(f"wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    for structure in sys.argv[1:] or STRUCTURES:
        build(structure)
