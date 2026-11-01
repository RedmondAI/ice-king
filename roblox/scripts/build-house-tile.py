#!/usr/bin/env python3
"""Rebuild the house season sheet so the winter cabin keeps its shape all year.

The original house sheet cross-fades between two different buildings (a snowy log
cabin in winter, a red-roofed cottage in summer), so the house visibly morphs during
the season change. This script keeps the winter cabin in every frame and only melts
its snow:

- the cabin is cut out of the original winter frame (frame 0),
- a summer version is made by recolouring the snow on the same pixels
  (roof snow -> shingles, snowy shrubs -> green leaves, chimney cap -> stone),
- the ground is the grass tile's own transition, with the winter frame's snowy
  clearing fading out as the season turns (frame 0 is the original winter frame),
- each in-between frame melts the snow in patches (no translucent ghosting).

Inputs (never modified):
  ../apps/client/src/assets/tiles-transition256/house-transition-winter-to-summer-grid.png
  art/tiles/grass-transition-winter-to-summer-grid.png
Output:
  art/tiles/house-transition-winter-to-summer-grid.png

Usage (from roblox/):  python3 scripts/build-house-tile.py   # needs numpy + Pillow
"""

from pathlib import Path

import numpy as np

from tileart import (
    FRAME,
    FRAMES,
    LUMA,
    OUTLINE_LUMA,
    clearing_weight,
    dilate,
    draw_smoke,
    flood_from_edges,
    label_components,
    load_frames,
    save_sheet,
    smooth_noise,
    trim_mask,
)

ROOT = Path(__file__).resolve().parent.parent
SOURCE_HOUSE = ROOT.parent / "apps/client/src/assets/tiles-transition256/house-transition-winter-to-summer-grid.png"
GRASS = ROOT / "art/tiles/grass-transition-winter-to-summer-grid.png"
OUTPUT = ROOT / "art/tiles/house-transition-winter-to-summer-grid.png"

# Region of the original frame that holds the cabin (rows, cols).
CABIN_BOX = (slice(55, 175), slice(60, 200))

# Summer colour ramps, dark -> light.
ROOF_RAMP = [(61, 26, 23), (106, 44, 36), (147, 64, 47), (184, 80, 58), (214, 104, 72), (234, 138, 96)]
LEAF_RAMP = [(22, 52, 30), (34, 84, 40), (52, 120, 48), (78, 154, 60), (114, 184, 72), (156, 208, 94)]
STONE_RAMP = [(60, 58, 62), (92, 90, 96), (126, 124, 128), (160, 158, 160), (190, 188, 186), (214, 212, 208)]
WALL_OUTLINE = (52, 30, 24)
EAVE_ROW = 124  # below this, outline pixels hug the log walls rather than the roof
SMOKE_PUFFS = [(63, 155, 2.0), (59, 157, 2.6), (54, 159, 3.0), (48, 162, 3.0), (43, 166, 2.4)]


def cabin_mask(winter):
    """Pixels of the cabin (roof, walls, shrubs) in the winter frame."""
    outline = dilate(winter @ LUMA < OUTLINE_LUMA)  # dilate once to close pinholes in the outline
    inside = ~flood_from_edges(~outline)
    box = np.zeros_like(inside)
    box[CABIN_BOX] = True
    return trim_mask(winter, inside & box)


def material_for(cy, cx):
    """What a patch of snow at this position covers in summer."""
    if cy < 75 and cx > 145:
        return "stone"  # chimney cap
    if cy <= 135:
        return "roof"  # roof and the little door awning
    if 98 <= cx <= 150:
        return "stone"  # doorstep
    return "leaf"  # snowy shrubs either side of the door


def ramp_colour(ramp, index):
    return np.array(ramp[int(np.clip(index, 0, len(ramp) - 1))], dtype=float)


def summer_cabin(winter, mask):
    """Same cabin pixels with the snow recoloured; warm wood/window pixels are kept."""
    luma = winter @ LUMA
    red, blue = winter[..., 0], winter[..., 2]
    snow = mask & (blue >= red - 5) & (luma >= OUTLINE_LUMA)
    cool = mask & ~snow & (blue > red + 10)  # navy/teal outlines and shrub needles

    labels, count = label_components(snow)
    material = np.full(mask.shape, "", dtype=object)
    for n in range(1, count + 1):
        ys, xs = np.nonzero(labels == n)
        material[ys, xs] = material_for(ys.mean(), xs.mean())

    # Cool outline pixels take the material of the nearest snow.
    near = material.copy()
    for _ in range(6):
        grown = near.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(np.roll(near, dy, 0), dx, 1)
            take = (grown == "") & (shifted != "")
            grown[take] = shifted[take]
        near = grown

    ramps = {"roof": ROOF_RAMP, "leaf": LEAF_RAMP, "stone": STONE_RAMP}
    out = winter.copy()
    roof_top = 70
    for y, x in zip(*np.nonzero(snow)):
        kind = material[y, x]
        index = 1 + (luma[y, x] - OUTLINE_LUMA) / (256 - OUTLINE_LUMA) * 4.6
        if kind == "roof":
            course = (y - roof_top) // 4
            if (y - roof_top) % 4 == 3 or (x + course * 3) % 6 == 0:
                index -= 1  # shingle courses and seams
        out[y, x] = ramp_colour(ramps[kind], index)
    for y, x in zip(*np.nonzero(cool)):
        kind = near[y, x] or "roof"
        if kind == "roof" and y >= EAVE_ROW:
            out[y, x] = WALL_OUTLINE
        elif kind == "leaf" and winter[y, x, 1] > winter[y, x, 0] + 20:
            out[y, x] = ramp_colour(LEAF_RAMP, luma[y, x] / 50)  # needles: shift green
        else:
            out[y, x] = ramp_colour(ramps[kind], luma[y, x] / OUTLINE_LUMA * 2.2)
    return out


def build():
    house = load_frames(SOURCE_HOUSE)
    grass = load_frames(GRASS)
    winter = house[0]
    mask = cabin_mask(winter)
    summer = summer_cabin(winter, mask)
    melt_order = smooth_noise(seed=7)

    frames = []
    # The winter frame's snowy clearing (and its chimney smoke) fades out with the snow.
    winter_clearing = (winter - grass[0]) * clearing_weight()
    for k in range(FRAMES):
        t = k / (FRAMES - 1)
        frame = np.clip(grass[k] + winter_clearing * (1 - t), 0, 255)
        melted = melt_order <= t if k else np.zeros_like(mask)
        frame[mask] = np.where(melted[mask][:, None], summer[mask], winter[mask])
        draw_smoke(frame, t, SMOKE_PUFFS)
        frames.append(frame)

    save_sheet(frames, OUTPUT)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
