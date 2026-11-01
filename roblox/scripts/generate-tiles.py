"""Generates the Ice King tile art as true pixel art.

Every tile is drawn at 64x64 and scaled 4x (nearest neighbour) to 256x256. Each tile type
is exported as one 768x768 sheet of 9 frames (3x3, row-major): frame 0 is full winter and
frame 8 is full summer, so the board can play it forwards (spring) or backwards (autumn).

Why it is drawn in code instead of painted:
- All tiles share one tileable ground field, so any two tiles line up at their edges.
- Summer and winter are the same drawing with snow/ice/light layers on top, so the
  transition frames morph naturally instead of cross-fading between two pictures.

Run from the roblox/ directory:
    python3 scripts/generate-tiles.py              # writes art/generated-tiles/*-grid.png
    python3 scripts/generate-tiles.py --preview D  # also writes preview sheets into directory D

It writes to art/generated-tiles/, not art/tiles/ (the set the game uploads), so it never
replaces the tiles in use. To play with these instead, copy them into art/tiles/ and run
`lune run scripts/upload-art.luau`.
"""

import argparse
import math
import os
import zlib

import numpy as np
from PIL import Image

N = 64  # native pixel-art size of one tile
SCALE = 4  # 64 * 4 = 256
FRAMES = 9
TILE_TYPES = ["grass", "forest", "pond", "house", "factory", "train"]
OUT_DIR = "art/generated-tiles"


def hex_color(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def palette(*values):
    return [hex_color(v) for v in values]


# --- Palette --------------------------------------------------------------------------

GRASS = palette("#2F6B35", "#3E8A3D", "#4FA246", "#64B84E", "#86CF5E")
GRASS_DORMANT = palette("#4A5E36", "#5F7240", "#748548", "#8A9752", "#A3AC62")
FLOWERS = palette("#F7E26B", "#F49AC1", "#FFFFFF", "#9FC7FF")
SNOW = palette("#FFFFFF", "#F1F6FF", "#E0E9F8", "#C6D3EC", "#A7B6DB")
TUFT = palette("#556B4C", "#6E8560")
DIRT = palette("#6E5236", "#8C6B45", "#A98657", "#C4A26E")
STONE = palette("#5C6170", "#7F8695", "#A4AAB6", "#C8CDD6")
WATER = palette("#1D5A9E", "#2777C2", "#3C97DB", "#63B9EC", "#BDEBFF")
ICE = palette("#4E9FCB", "#6DB8DE", "#93CFEA", "#CBEEF9", "#2F6E96")
LILY = palette("#2E7A3A", "#4AA54E", "#F6A6C9")
PINE = palette("#173F33", "#1F5442", "#2A6B52", "#3A8463", "#56A077")
LEAF = palette("#24502A", "#33702F", "#468C38", "#5FA843", "#82C35A")
LEAF_FALL = palette("#5A3A1E", "#8A4E22", "#B8692A", "#D98E36", "#F0B85A")
TRUNK = palette("#3D2716", "#5C3B20")
BARK_LIGHT = hex_color("#7D6248")
ROOF = palette("#7A2A22", "#A23A2C", "#C44E35", "#DE6A45", "#F08A5C")
WALL = palette("#B99B6B", "#D6BD8E", "#EAD7AE", "#F6EAD0")
WOOD = palette("#3E2614", "#5E3B20", "#7E5230", "#A06C42")
GLASS = palette("#25344A", "#3B5574", "#6C93B8", "#A9CBE6")
LIGHT = palette("#C9822C", "#F2B33D", "#FFD866", "#FFF1B0")
BRICK = palette("#5E2C22", "#7E3A2B", "#9E4C35", "#BC6446")
METAL = palette("#3F4652", "#5A6372", "#7A8494", "#9EA8B7", "#C6CEDA")
TEAL_ROOF = palette("#24485A", "#2F6177", "#3E7D96", "#5A9CB3")
RED = palette("#7E1F1F", "#B03030", "#D94A3A")
GOLD = palette("#8A6420", "#C99A3A", "#F0C860")
SMOKE = palette("#9AA2AE", "#C3C9D2", "#E6EAF0")
PAINT_WHITE = palette("#F2EFE8", "#DAD6CE", "#B9B4AA")  # chimney bands, clock face
SHADOW_SUMMER = np.array([0.62, 0.70, 0.66])
SHADOW_SNOW = np.array([0.80, 0.84, 0.96])
# Light drop shadow that snow casts down-right onto whatever is under its edge.
SNOW_DROP_NEAR = np.array([0.80, 0.84, 0.93])
SNOW_DROP_FAR = np.array([0.91, 0.93, 0.97])


def lerp(a, b, t):
    return a + (b - a) * t


def clamp01(x):
    return max(0.0, min(1.0, x))


def smoothstep(e0, e1, x):
    t = clamp01((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


# --- Tileable noise -----------------------------------------------------------------


def value_noise(rng, grid):
    """Smooth value noise on an N x N canvas that wraps seamlessly (period N)."""
    lattice = rng.random((grid, grid))
    coords = np.arange(N) * grid / N
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    s = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % grid
    i0 = i0 % grid
    # rows (y) then columns (x)
    a = lattice[np.ix_(i0, i0)]
    b = lattice[np.ix_(i0, i1)]
    c = lattice[np.ix_(i1, i0)]
    d = lattice[np.ix_(i1, i1)]
    sx = s[None, :]
    sy = s[:, None]
    top = a + (b - a) * sx
    bottom = c + (d - c) * sx
    return top + (bottom - top) * sy


def fbm(seed, octaves):
    rng = np.random.default_rng(seed)
    total = np.zeros((N, N))
    for grid, weight in octaves:
        total += value_noise(rng, grid) * weight
    return total


def to_uniform(field):
    """Re-maps a field so its values are evenly spread over [0, 1] (coverage == threshold)."""
    flat = field.ravel()
    ranks = np.empty(flat.size)
    ranks[np.argsort(flat, kind="stable")] = np.arange(flat.size)
    return (ranks / (flat.size - 1)).reshape(field.shape)


# Shared fields: identical for every tile type, which keeps ground seams invisible.
GROUND_TONE = to_uniform(fbm(11, [(8, 0.45), (16, 0.35), (32, 0.2)]))
GROUND_DETAIL = to_uniform(fbm(12, [(16, 0.4), (32, 0.6)]))
SNOW_FIELD = to_uniform(fbm(13, [(4, 0.5), (8, 0.3), (32, 0.2)]))
SNOW_TONE = to_uniform(fbm(14, [(8, 0.6), (16, 0.4)]))


def _snow_relief():
    """Shading for the snow surface: soft mounds plus wind-blown ripples, lit from the
    top-left. Returns, per pixel, how much that bit of snow faces away from the light
    (0 = most shadowed, 1 = brightest crest), evenly spread so thresholds = coverage."""
    mounds = fbm(15, [(4, 0.6), (8, 0.4)])
    warp = fbm(16, [(4, 0.5), (8, 0.5)])
    ys, xs = np.mgrid[0:N, 0:N]
    # Integer wave numbers keep the ripples tileable.
    ripples = np.sin(math.tau * (2 * xs + 3 * ys) / N + warp * 7.0)
    height = mounds * 1.6 + ripples * 0.18
    # Height minus height two pixels toward the light: negative = slope facing away.
    facing = height - np.roll(height, (2, 2), axis=(0, 1))
    return to_uniform(facing)


SNOW_RELIEF = _snow_relief()


def scatter(seed, count, margin=0):
    rng = np.random.default_rng(seed)
    points = []
    for _ in range(count):
        points.append((int(rng.integers(margin, N - margin)), int(rng.integers(margin, N - margin)), rng.random()))
    return points


GRASS_BLADES = scatter(21, 230)
GRASS_TUFTS = scatter(22, 12)
GRASS_FLOWERS = scatter(23, 22)


# --- Canvas -------------------------------------------------------------------------


class Canvas:
    def __init__(self):
        self.rgb = np.zeros((N, N, 3))
        self.snowy = np.zeros((N, N), dtype=bool)  # ground pixels covered by snow
        self.snow = np.zeros((N, N), dtype=bool)  # every pixel showing snow (ground or object)
        self.solid = np.zeros((N, N), dtype=bool)  # pixels covered by an object

    def set(self, x, y, color, wrap=False, solid=True):
        if wrap:
            x, y = x % N, y % N
        if 0 <= x < N and 0 <= y < N:
            self.rgb[y, x] = color
            self.snow[y, x] = is_snow(color)
            if solid:
                self.solid[y, x] = True

    def paint(self, x, y, color):
        """Writes a ground-level pixel (not part of an object's outline)."""
        self.rgb[y, x] = color
        self.snow[y, x] = is_snow(color)

    def snow_shadows(self):
        """Light drop shadow from every snow edge, cast down-right like the other shadows."""
        bare = ~self.snow
        near = np.roll(self.snow, (1, 1), axis=(0, 1)) | np.roll(self.snow, 1, axis=0)
        far = np.roll(self.snow, (2, 2), axis=(0, 1)) | np.roll(self.snow, (2, 1), axis=(0, 1))
        self.rgb[bare & near] *= SNOW_DROP_NEAR
        self.rgb[bare & ~near & far] *= SNOW_DROP_FAR

    def outline(self):
        """Darkens the rim of every object so it separates from the ground."""
        edge = np.zeros((N, N), dtype=bool)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.zeros((N, N), dtype=bool)
            ys = slice(max(0, dy), N + min(0, dy))
            yd = slice(max(0, -dy), N + min(0, -dy))
            xs = slice(max(0, dx), N + min(0, dx))
            xd = slice(max(0, -dx), N + min(0, -dx))
            shifted[yd, xd] = self.solid[ys, xs]
            edge |= self.solid & ~shifted
        lower = edge & ~np.roll(self.solid, -1, axis=0)
        self.rgb[edge] *= 0.78
        self.rgb[lower] *= 0.85

    def get(self, x, y):
        return self.rgb[y % N, x % N]

    def rect(self, x0, y0, x1, y1, color):
        """Fills the inclusive rectangle x0..x1, y0..y1."""
        for y in range(max(0, y0), min(N, y1 + 1)):
            for x in range(max(0, x0), min(N, x1 + 1)):
                self.rgb[y, x] = color
                self.solid[y, x] = True

    def shade(self, x, y, factor):
        if 0 <= x < N and 0 <= y < N:
            self.rgb[y, x] = self.rgb[y, x] * factor

    def shadow_ellipse(self, cx, cy, rx, ry, strength=1.0):
        for y in range(N):
            for x in range(N):
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if d <= 1:
                    factor = SHADOW_SNOW if self.snowy[y, x] else SHADOW_SUMMER
                    soft = 1 if d < 0.7 else 0.55
                    self.rgb[y, x] = self.rgb[y, x] * lerp(np.ones(3), factor, soft * strength)


def is_snow(color):
    return any(np.array_equal(color, shade) for shade in SNOW)


def canopy_winter(w, delay):
    """Trees shed snow quickly, so crowns only hold it once winter is well under way."""
    return clamp01((w - delay) / (1 - delay))


def snow_cover(w, bias=0.0, cap=1.08):
    """Threshold for SNOW_FIELD: below 0 at w=0 (no snow), `cap` at w=1.

    `bias` makes a surface collect snow earlier (+) or later (-) during the transition
    without leaving snow behind in summer; `cap` < 1 keeps part of it bare in deep winter.
    """
    if w <= 0:
        return -1.0  # full summer: no snow anywhere, whatever the surface bias
    base = w * 1.14 - 0.08 + bias * 4 * w * (1 - w)
    return min(base, cap * w)


# --- Ground -------------------------------------------------------------------------


def draw_ground(c, w, flower_count=22):
    dormancy = smoothstep(0.0, 0.55, w)
    shades = [lerp(GRASS[i], GRASS_DORMANT[i], dormancy) for i in range(5)]
    cover = snow_cover(w)

    for y in range(N):
        for x in range(N):
            tone = GROUND_TONE[y, x] * 0.75 + GROUND_DETAIL[y, x] * 0.25
            idx = 1 if tone < 0.28 else 2 if tone < 0.72 else 3
            c.rgb[y, x] = shades[idx]

    # Grass blades: a bright tip with a darker root pixel under it.
    for x, y, r in GRASS_BLADES:
        c.set(x, y, shades[4] if r > 0.45 else shades[3], wrap=True, solid=False)
        c.set(x, y + 1, shades[0] if r > 0.7 else shades[1], wrap=True, solid=False)

    for i, (x, y, r) in enumerate(GRASS_FLOWERS[:flower_count]):
        if w < 0.35 - r * 0.25:
            color = FLOWERS[i % len(FLOWERS)]
            c.set(x, y, color, wrap=True, solid=False)
            if r > 0.5:
                c.set(x, y - 1, shades[4], wrap=True, solid=False)

    # Snow: patches grow out of SNOW_FIELD as w rises.
    c.snowy = SNOW_FIELD < cover
    for y in range(N):
        for x in range(N):
            if not c.snowy[y, x]:
                continue
            # Drifts: the side facing away from the light is in soft shadow.
            relief = SNOW_RELIEF[y, x]
            color = SNOW[3] if relief < 0.035 else SNOW[2] if relief < 0.17 else SNOW[1]
            if relief > 0.95 or GROUND_DETAIL[y, x] > 0.985:
                color = SNOW[0]
            below_bare = not c.snowy[(y + 1) % N, x]
            above_bare = not c.snowy[(y - 1) % N, x]
            if below_bare:
                color = SNOW[3]
            elif above_bare:
                color = SNOW[0]
            c.rgb[y, x] = color
    c.snow = c.snowy.copy()

    # Dry grass tufts poke through deep snow.
    for x, y, r in GRASS_TUFTS:
        if c.snowy[y % N, x % N] and w > 0.55:
            c.set(x, y, TUFT[1], wrap=True, solid=False)
            c.set(x - 1, y + 1, TUFT[0], wrap=True, solid=False)
            c.set(x + 1, y, TUFT[1], wrap=True, solid=False)
            c.set(x, y + 1, SNOW[3], wrap=True, solid=False)


def snowy_material(x, y, w, base, snow_shades=None, bias=0.0):
    """Returns snow color for a surface pixel if snow has settled there, else base."""
    if SNOW_FIELD[y % N, x % N] < snow_cover(w, bias):
        shades = snow_shades or SNOW
        t = SNOW_TONE[y % N, x % N]
        return shades[1] if t < 0.6 else shades[0] if t > 0.92 else shades[2]
    return base


# --- Grass --------------------------------------------------------------------------


def draw_grass(c, w):
    draw_ground(c, w)
    # A couple of pebbles and a small shrub so plain fields are not totally empty.
    for x, y in [(12, 47), (13, 47), (50, 18)]:
        c.set(x, y, snowy_material(x, y, w, STONE[2], bias=0.1))
        c.set(x, y + 1, STONE[0])
    draw_shrub(c, 44, 46, w)


def draw_shrub(c, cx, cy, w):
    for dy in range(-2, 3):
        for dx in range(-3, 4):
            if dx * dx / 9 + dy * dy / 4 <= 1:
                light = dx + dy < -1
                dark = dx + dy > 1
                base = LEAF[3] if light else LEAF[1] if dark else LEAF[2]
                base = lerp(base, LEAF_FALL[2], smoothstep(0.2, 0.6, w) * 0.5)
                color = snowy_material(cx + dx, cy + dy, w, base, bias=0.12 if light else -0.1)
                c.set(cx + dx, cy + dy, color)
    if w < 0.6:
        c.set(cx + 1, cy + 3, LEAF[0])
        c.set(cx - 1, cy + 3, LEAF[0])


# --- Forest -------------------------------------------------------------------------


def draw_tree_shadow(c, cx, cy, r):
    c.shadow_ellipse(cx + r * 0.4, cy + r * 0.5, r * 1.0, r * 0.75, 0.9)


def draw_pine(c, cx, cy, r, w, seed):
    rng = np.random.default_rng(seed)
    spikes = 8 + int(rng.integers(0, 3))
    phase = rng.random() * math.tau
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)
            edge = r * (0.8 + 0.2 * abs(math.cos(spikes * angle / 2 + phase)))
            if dist > edge:
                continue
            ring = dist / max(edge, 0.1)
            light = -(dx + dy) / (r * 1.4)  # light from the top-left
            level = 3.0 - ring * 1.9 + light * 1.4
            if 0.42 < ring < 0.52 or 0.76 < ring < 0.84:
                level -= 0.9  # layered branch tiers
            color = PINE[int(max(0, min(4, round(level))))]
            # Snow settles on the lit side of each tier; the shaded side stays green.
            field = SNOW_FIELD[y % N, x % N] - 0.3 * light
            if ring < 0.95 and field < snow_cover(canopy_winter(w, 0.15), 0.1, cap=0.62):
                color = SNOW[1] if light > 0.15 else SNOW[2] if light > -0.2 else SNOW[3]
            c.set(x, y, color)
    c.set(int(cx), int(cy), SNOW[1] if w > 0.6 else PINE[4])


def tree_branches(cx, cy, r, seed):
    """Pixels of a bare crown seen from above: limbs radiating from the trunk, with twigs."""
    rng = np.random.default_rng(seed)
    pixels = {}
    limbs = 6 + int(rng.integers(0, 3))
    start = rng.random() * math.tau
    for i in range(limbs):
        angle = start + i * math.tau / limbs + rng.normal(0, 0.25)
        length = r * (0.75 + rng.random() * 0.3)
        x, y = cx, cy
        steps = int(length * 2)
        for step in range(steps):
            angle += rng.normal(0, 0.08)
            x += math.cos(angle) * 0.5
            y += math.sin(angle) * 0.5
            thickness = 0 if step < steps * 0.4 else 1  # 0 = limb, 1 = twig
            key = (int(round(x)), int(round(y)))
            pixels[key] = min(pixels.get(key, 2), thickness)
            if step in (steps // 2, steps * 3 // 4):
                twig_angle = angle + rng.choice([-1, 1]) * (0.5 + rng.random() * 0.4)
                tx, ty = x, y
                for _ in range(int(length * 0.6)):
                    tx += math.cos(twig_angle) * 0.5
                    ty += math.sin(twig_angle) * 0.5
                    key = (int(round(tx)), int(round(ty)))
                    pixels.setdefault(key, 2)
    for dx in (0, 1):
        for dy in (0, 1):
            pixels[(int(cx) + dx, int(cy) + dy)] = 0
    return pixels


LEAF_NOISE = to_uniform(fbm(41, [(16, 0.5), (32, 0.5)]))


def draw_broadleaf(c, cx, cy, r, w, seed):
    """A deciduous tree: full green crown in summer, autumn tint as it turns, then the
    leaves thin out to reveal bare branches that catch snow in deep winter."""
    rng = np.random.default_rng(seed)
    bumps = [(rng.random() * math.tau, 0.75 + rng.random() * 0.3) for _ in range(6)]
    fall = 0.8 * smoothstep(0.12, 0.45, w) * (1 - smoothstep(0.6, 0.85, w))
    leafless = smoothstep(0.45, 0.85, w)

    # Branches first, so they show through as the leaves drop.
    branches = tree_branches(cx, cy, r, seed + 7)
    for (x, y), kind in branches.items():
        if not (0 <= x < N and 0 <= y < N):
            continue
        if leafless < 0.05 and math.hypot(x - cx, y - cy) > r * 0.6:
            continue
        lit = (x - 1, y - 1) not in branches
        color = TRUNK[0] if kind == 0 else TRUNK[1]
        if lit and kind > 0:
            color = BARK_LIGHT
        c.set(x, y, color, solid=False)
    # Snow lies along the top of bare branches.
    if w > 0.6:
        for (x, y), kind in branches.items():
            if 0 <= x < N and 1 <= y < N and (x, y - 1) not in branches:
                if SNOW_FIELD[y % N, x % N] < snow_cover(w, 0.0, cap=0.75):
                    c.set(x, y - 1 if kind == 0 else y, SNOW[1], solid=False)

    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            if not (0 <= x < N and 0 <= y < N):
                continue
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            inside = dist <= r * 0.75
            for a, s in bumps:
                bx, by = cx + math.cos(a) * r * 0.42, cy + math.sin(a) * r * 0.42
                if math.hypot(x - bx, y - by) <= r * 0.55 * s:
                    inside = True
            if not inside:
                continue
            # Leaves drop unevenly; the outer crown goes first.
            if leafless > 0 and LEAF_NOISE[y, x] * 0.8 + (1 - dist / r) * 0.2 < leafless:
                continue
            detail = GROUND_DETAIL[y, x]
            light = -(dx + dy) / (r * 1.4)
            level = 2.3 + light * 1.7 - dist / r * 0.8 + (detail - 0.5) * 1.1
            idx = int(max(0, min(4, round(level))))
            color = lerp(LEAF[idx], LEAF_FALL[idx], fall)
            # Snow only rests on the upper, lit side of the crown; the shaded side keeps
            # its leaf color so the tree still reads against snowy ground.
            field = SNOW_FIELD[y, x] - 0.25 * light
            if light > -0.05 and field < snow_cover(canopy_winter(w, 0.3), 0.0, cap=0.45):
                color = SNOW[1] if light > 0.3 else SNOW[2]
            c.set(x, y, color)


FOREST_TREES = [
    # (kind, x, y, radius)
    ("pine", 19, 13, 7.5),
    ("pine", 33, 11, 7),
    ("leaf", 46, 15, 8),
    ("leaf", 12, 27, 7),
    ("pine", 26, 25, 9),
    ("pine", 41, 27, 8.5),
    ("pine", 53, 30, 6.5),
    ("pine", 17, 40, 8.5),
    ("leaf", 32, 39, 8.5),
    ("pine", 47, 43, 8.5),
    ("pine", 24, 51, 7.5),
    ("leaf", 38, 52, 7),
]


def draw_forest(c, w):
    draw_ground(c, w, flower_count=8)
    # Darker, mossy forest floor under the canopy (kept off the tile edges).
    for y in range(N):
        for x in range(N):
            d = math.hypot((x - 32) / 27, (y - 32) / 27)
            if d < 1:
                c.rgb[y, x] = c.rgb[y, x] * lerp(0.8, 1.0, smoothstep(0.55, 1.0, d))
    for kind, x, y, r in FOREST_TREES:
        draw_tree_shadow(c, x, y, r)
    for i, (kind, x, y, r) in enumerate(sorted(FOREST_TREES, key=lambda t: t[2])):
        if kind == "pine":
            draw_pine(c, x, y, r, w, 100 + i)
        else:
            draw_broadleaf(c, x, y, r, w, 200 + i)


# --- Pond ---------------------------------------------------------------------------

POND_CX, POND_CY, POND_RX, POND_RY = 35.5, 36.5, 19.5, 14.5
POND_EDGE = to_uniform(fbm(31, [(8, 0.6), (16, 0.4)]))
POND_CRACKS = []


def _build_cracks():
    rng = np.random.default_rng(32)
    ox, oy = POND_CX - 4, POND_CY - 1
    for i in range(5):
        x, y = ox, oy
        angle = i * math.tau / 5 + rng.normal(0, 0.3)
        for _ in range(int(rng.integers(9, 16))):
            POND_CRACKS.append((int(round(x)), int(round(y))))
            angle += rng.normal(0, 0.6)
            x += math.cos(angle)
            y += math.sin(angle) * 0.8


_build_cracks()
POND_SPARKLES = scatter(33, 14)
POND_LILIES = [(26, 33, 2), (43, 42, 2), (46, 31, 1)]
# Trees and shrubs on the bank, placed unevenly so it looks grown rather than planted.
POND_TREES = [(13, 15, 10, 301), (30, 9, 7, 302), (51, 20, 7.5, 303)]
# Reed clumps: (x, y of the stalk base, number of stalks).
POND_REEDS = [(17, 38, 4), (52, 46, 3)]


def pond_distance(x, y):
    """0 at the center, 1 at the shoreline (with a slightly wobbly outline)."""
    x, y = min(max(x, 0), N - 1), min(max(y, 0), N - 1)
    d = math.hypot((x - POND_CX) / POND_RX, (y - POND_CY) / POND_RY)
    return d + (POND_EDGE[y, x] - 0.5) * 0.08


def pond_frozen(x, y, freeze):
    """Ice grows inward from the shore as `freeze` goes 0 -> 1."""
    depth = 1 - pond_distance(x, y)
    return depth + (POND_EDGE[y, x] - 0.5) * 0.18 < freeze * 1.15 - 0.05


def draw_reeds(c, x, y, count, w):
    dry = smoothstep(0.35, 0.75, w)
    stalk = lerp(np.array([62, 122, 52.0]), np.array([176, 150, 96.0]), dry)
    stalk_dark = lerp(np.array([44, 92, 40.0]), np.array([138, 112, 70.0]), dry)
    rng = np.random.default_rng(x * 64 + y)
    for i in range(count):
        sx = x + int(rng.integers(-3, 4))
        sy = y + int(rng.integers(-2, 3))
        height = int(rng.integers(3, 7))
        lean = int(rng.choice([-1, 0, 0, 1]))
        for h in range(height):
            px = sx + (lean if h >= height // 2 else 0)
            c.set(px, sy - h, stalk if h % 2 else stalk_dark, solid=False)
        top_x = sx + lean
        if rng.random() < 0.6:
            c.set(top_x, sy - height, WOOD[1], solid=False)  # cattail head
            c.set(top_x, sy - height - 1, WOOD[1], solid=False)
            if w > 0.75:
                c.set(top_x, sy - height - 2, SNOW[1], solid=False)


def draw_pond(c, w):
    draw_ground(c, w, flower_count=16)
    freeze = smoothstep(0.1, 0.75, w)
    for y in range(N):
        for x in range(N):
            d = pond_distance(x, y)
            if d > 1.12:
                continue
            if d > 1.0:
                # Bank: sand with stones; snow settles here like on the ground.
                stone = POND_EDGE[y, x] > 0.62
                base = STONE[2] if stone else DIRT[3]
                if stone and pond_distance(x, y + 1) < d:
                    base = STONE[1]
                c.paint(x, y, snowy_material(x, y, w, base, bias=0.05))
                c.solid[y, x] = True
                continue
            depth = 1 - d
            under_bank = pond_distance(x, y - 1) > 1.0
            if pond_frozen(x, y, freeze):
                # Clear blue ice, deeper toward the middle, with pale streaks.
                idx = 3 if depth < 0.1 else 2 if depth < 0.35 else 1 if depth < 0.7 else 0
                color = ICE[idx]
                streak = (x - y * 2 + 200) % 13
                if depth > 0.15 and streak in (0, 1) and POND_EDGE[y, x] > 0.35:
                    color = ICE[3]
                # Snow only drifts onto the ice near the shore.
                if SNOW_FIELD[y, x] + depth * 1.6 < snow_cover(w, -0.1, cap=0.95):
                    color = SNOW[2] if SNOW_TONE[y, x] < 0.5 else SNOW[1]
                if under_bank:
                    color = ICE[4]
            else:
                idx = 3 if depth < 0.12 else 2 if depth < 0.4 else 1 if depth < 0.75 else 0
                color = WATER[idx]
                if freeze > 0 and pond_frozen(x, y, freeze + 0.06):
                    color = ICE[3]  # thin pale rim on the advancing ice edge
                if under_bank:
                    color = WATER[0]
            c.paint(x, y, color)

    if freeze > 0.85:
        for x, y in POND_CRACKS:
            if 0 <= x < N and 0 <= y < N and pond_distance(x, y) < 0.85:
                c.paint(x, y, ICE[4])
    for x, y, r in POND_SPARKLES:
        if pond_distance(x, y) < 0.8 and not pond_frozen(x, y, freeze):
            c.set(x, y, WATER[4], solid=False)
            if r > 0.5 and pond_distance(x + 1, y) < 0.8:
                c.set(x + 1, y, WATER[3], solid=False)
    for x, y, r in POND_LILIES:
        if w < 0.3 and not pond_frozen(x, y, freeze + 0.1):
            for dy in range(-r, r + 1):
                for dx in range(-r - 1, r + 2):
                    if (dx / (r + 1)) ** 2 + (dy / (r + 0.5)) ** 2 <= 1 and not (dx == 1 and dy == 0):
                        c.set(x + dx, y + dy, LILY[1] if dy < 0 else LILY[0], solid=False)
            if r > 1:
                c.set(x, y - 1, LILY[2], solid=False)

    for x, y, count in POND_REEDS:
        draw_reeds(c, x, y, count, w)
    for x, y, r, seed in POND_TREES:
        draw_tree_shadow(c, x, y, r * lerp(1.0, 0.7, smoothstep(0.45, 0.85, w)))
    for x, y, r, seed in sorted(POND_TREES, key=lambda t: t[1]):
        draw_broadleaf(c, x, y, r, w, seed)


# --- Buildings ----------------------------------------------------------------------


def roof_pixel(x, y, w, base, ridge_side_light=True, bias=0.18):
    """Roofs catch snow earlier than the ground."""
    if SNOW_FIELD[y % N, x % N] < snow_cover(w, bias):
        t = SNOW_TONE[y % N, x % N]
        if not ridge_side_light:
            return SNOW[2] if t < 0.7 else SNOW[3]
        return SNOW[1] if t < 0.7 else SNOW[0]
    return base


def draw_icicles(c, x0, x1, y, w, seed):
    if w < 0.8:
        return
    rng = np.random.default_rng(seed)
    for x in range(x0, x1 + 1):
        if rng.random() < 0.35:
            c.set(x, y, ICE[2])
            if rng.random() < 0.5:
                c.set(x, y + 1, ICE[1])


def draw_smoke(c, x, y, w, seed):
    rng = np.random.default_rng(seed)
    puffs = [(0, 0, 1.6), (1, -3, 2.0), (3, -6, 2.3)]
    for dx, dy, r in puffs:
        px, py = x + dx + rng.normal(0, 0.3), y + dy
        for yy in range(int(py - r - 1), int(py + r + 2)):
            for xx in range(int(px - r - 1), int(px + r + 2)):
                d = math.hypot(xx - px, yy - py)
                if d <= r and 1 <= yy < N - 1:
                    color = SMOKE[2] if (xx - px) + (yy - py) < 0 else SMOKE[1]
                    if d > r - 0.6:
                        color = SMOKE[0]
                    blend = 0.75 if w > 0.5 else 0.55
                    c.rgb[yy, xx] = lerp(c.rgb[yy, xx], color, blend)


def window(c, x, y, w, lit_threshold=0.5, width=4, height=4):
    lit = w >= lit_threshold
    frame = WOOD[3]
    for dy in range(height):
        for dx in range(width):
            px, py = x + dx, y + dy
            if dx == 0 or dy == 0 or dx == width - 1 or dy == height - 1:
                c.set(px, py, frame)
            elif lit:
                c.set(px, py, LIGHT[3] if dx + dy <= 2 else LIGHT[2])
            else:
                c.set(px, py, GLASS[3] if dx + dy <= 2 else GLASS[1])
    if width >= 5:
        for dy in range(1, height - 1):
            c.set(x + width // 2, y + dy, frame)
    if lit:
        # Warm glow spilling onto the ground/snow below the sill.
        for dx in range(width):
            c.shade(x + dx, y + height, np.array([1.08, 1.0, 0.82]))


def draw_house(c, w):
    draw_ground(c, w, flower_count=14)
    # Garden path from the door toward the bottom edge (fades out before the edge).
    for y in range(45, 59):
        for x in range(28, 36):
            if abs(x - 31.5) + max(0, y - 53) * 0.7 < 3.2:
                base = DIRT[2] if (x * 3 + y) % 5 else DIRT[1]
                c.paint(x, y, snowy_material(x, y, w, base, bias=-0.1))
    c.shadow_ellipse(35, 40, 24, 11, 0.95)

    x0, x1 = 12, 51
    roof_top, ridge, eave = 8, 15, 31
    wall_bottom = 45
    # Walls: plaster with timber framing.
    for y in range(eave, wall_bottom + 1):
        for x in range(x0 + 1, x1):
            base = WALL[2] if (x * 2 + y) % 9 else WALL[1]
            c.set(x, y, base)
    for x in (x0 + 1, x0 + 12, x1 - 12, x1 - 1):
        for y in range(eave, wall_bottom + 1):
            c.set(x, y, WOOD[1])
    for x in range(x0 + 1, x1):
        c.set(x, eave, WOOD[0])
        c.set(x, eave + 1, WOOD[1])
        c.set(x, wall_bottom, WOOD[0])
    # Door with a small porch step.
    for y in range(35, wall_bottom):
        for x in range(29, 35):
            edge = x in (29, 34) or y == 35
            c.set(x, y, WOOD[1] if edge else WOOD[3] if (x - 29) % 2 else WOOD[2])
    c.set(33, 40, GOLD[2])
    for x in range(28, 36):
        c.set(x, wall_bottom, roof_pixel(x, wall_bottom, w, STONE[2], bias=0.0))
    # Windows (lit in winter) with flower boxes in summer.
    for wx in (17, 41):
        window(c, wx, 35, w, width=6, height=5)
        for dx in range(6):
            c.set(wx + dx, 40, roof_pixel(wx + dx, 40, w, WOOD[1], bias=0.2))
            if w < 0.3 and dx % 2 == 1:
                c.set(wx + dx, 39, FLOWERS[(dx // 2) % 2])
    # Roof: short back slope (lit) above the ridge, long shingled front slope below.
    for y in range(roof_top, eave):
        inset = max(0, roof_top + 3 - y)
        for x in range(x0 - 2 + inset, x1 + 3 - inset):
            if y < ridge:
                base = ROOF[4] if (x + y * 2) % 6 else ROOF[3]
                light = True
            else:
                row = (y - ridge) % 3
                stagger = ((y - ridge) // 3) % 2 * 2
                base = ROOF[1] if row == 2 or (x + stagger) % 4 == 0 else ROOF[2]
                if y > eave - 3:
                    base = ROOF[1] if row == 2 else ROOF[2] * 0.92
                light = False
            c.set(x, y, roof_pixel(x, y, w, base, light))
    for x in range(x0 - 2, x1 + 3):
        c.set(x, ridge, roof_pixel(x, ridge, w, ROOF[3], True, bias=0.3))
    draw_icicles(c, x0 - 1, x1 + 1, eave, w, 41)
    # Chimney.
    for y in range(4, 13):
        for x in range(40, 45):
            base = BRICK[2] if (y + x // 2) % 3 else BRICK[1]
            if x == 44:
                base = BRICK[0]
            c.set(x, y, base)
    for x in range(39, 46):
        c.set(x, 4, roof_pixel(x, 4, w, STONE[2], bias=0.4))
    # Barrel and a little woodpile beside the house.
    for y in range(39, 46):
        for x in range(54, 58):
            base = WOOD[3] if x < 56 else WOOD[2]
            if y in (40, 43):
                base = METAL[1]
            c.set(x, y, base)
    for x in range(54, 58):
        c.set(x, 39, roof_pixel(x, 39, w, WOOD[1], bias=0.3))
    for i, (lx, ly) in enumerate(((6, 42), (8, 42), (7, 40))):
        for dx in range(2):
            for dy in range(2):
                c.set(lx + dx, ly + dy, WOOD[2] if (dx + dy) % 2 == 0 else WOOD[3])
        c.set(lx, ly, roof_pixel(lx, ly, w, TRUNK[1], bias=0.2))
    draw_smoke(c, 42, 1, w, 42)


def draw_factory(c, w):
    draw_ground(c, w, flower_count=8)
    # Gravel yard under the factory.
    for y in range(N):
        for x in range(N):
            qx, qy = max(0, abs(x - 32) - 20), max(0, abs(y - 33) - 17)
            if math.hypot(qx, qy) > 6:
                continue
            base = STONE[1] if GROUND_DETAIL[y, x] > 0.45 else STONE[2]
            if GROUND_DETAIL[y, x] > 0.9:
                base = STONE[0]
            c.paint(x, y, snowy_material(x, y, w, base, bias=-0.05))
    c.shadow_ellipse(36, 38, 24, 13, 0.95)

    x0, x1 = 17, 52
    top, eave, bottom = 11, 35, 47
    # Sawtooth roof: four teeth, each a glazed riser then a sloped metal plane.
    tooth = (eave - top) // 4
    lit = w >= 0.5
    for i in range(4):
        ty = top + i * tooth
        for y in range(ty, ty + tooth):
            for x in range(x0, x1 + 1):
                if y == ty:
                    c.set(x, y, METAL[0])
                elif y == ty + 1:
                    pane = (x - x0) % 3 != 0
                    if lit:
                        base = LIGHT[2] if pane and (x + i) % 5 else LIGHT[1] if pane else METAL[0]
                    else:
                        base = GLASS[3] if pane and x % 2 else GLASS[2] if pane else METAL[0]
                    c.set(x, y, base)
                else:
                    slope = (y - ty - 2) / max(1, tooth - 3)
                    base = METAL[4] if slope < 0.25 else METAL[3] if slope < 0.7 else METAL[2]
                    if x % 5 == 0:
                        base = base * 0.9
                    c.set(x, y, roof_pixel(x, y, w, base, slope < 0.5, bias=0.15))
    # Brick front wall with a loading door and windows.
    for y in range(eave, bottom + 1):
        for x in range(x0, x1 + 1):
            mortar = y % 3 == 0 or (x + (y // 3) * 2) % 5 == 0
            c.set(x, y, BRICK[1] if mortar else BRICK[2])
    for x in range(x0, x1 + 1):
        c.set(x, eave, BRICK[0])
    for y in range(39, bottom + 1):
        for x in range(30, 40):
            c.set(x, y, METAL[2] if y % 2 else METAL[1])
    for x in range(30, 40):
        c.set(x, 39, METAL[0])
    window(c, 20, 39, w, width=7, height=4)
    window(c, 43, 39, w, width=7, height=4)
    draw_icicles(c, x0, x1, eave + 1, w, 51)
    # Chimney with red/white bands.
    cx0, cx1 = 8, 13
    for y in range(4, 42):
        for x in range(cx0, cx1 + 1):
            band = ((y - 4) // 4) % 2
            base = RED[1] if band else PAINT_WHITE[1]
            if x == cx0:
                base = RED[2] if band else PAINT_WHITE[0]
            if x == cx1:
                base = RED[0] if band else PAINT_WHITE[2]
            c.set(x, y, base)
    for x in range(cx0 - 1, cx1 + 2):
        c.set(x, 4, METAL[0])
        c.set(x, 5, METAL[2])
    c.shadow_ellipse(14, 43, 4, 2, 0.8)
    # Storage tank (top-down cylinder) on the right.
    tcx, tcy, tr = 55, 22, 4.5
    c.shadow_ellipse(tcx + 1, tcy + 4, 5, 3, 0.9)
    for y in range(int(tcy), int(tcy + 5)):
        for x in range(int(tcx - tr), int(tcx + tr + 1)):
            c.set(x, y, METAL[3] if x < tcx else METAL[1])
    for y in range(int(tcy - tr), int(tcy + tr + 1)):
        for x in range(int(tcx - tr), int(tcx + tr + 1)):
            d = math.hypot(x - tcx, (y - tcy) * 1.25)
            if d <= tr:
                base = METAL[4] if x + y < tcx + tcy - 1 else METAL[3]
                c.set(x, y, roof_pixel(x, y, w, base, x + y < tcx + tcy, bias=0.2))
    # Ice-block crates in the yard.
    for bx, by in ((20, 51), (24, 51), (22, 49), (45, 51)):
        for y in range(by, by + 3):
            for x in range(bx, bx + 3):
                base = ICE[3] if (x == bx or y == by) else ICE[1]
                c.set(x, y, roof_pixel(x, y, w, base, bias=0.05))
    draw_smoke(c, 10, 1, w, 52)


def draw_train(c, w):
    draw_ground(c, w, flower_count=12)
    track_y = 46  # top rail row
    # Ballast bed.
    for y in range(track_y - 3, track_y + 6):
        for x in range(3, 61):
            if y in (track_y - 3, track_y + 5) and (x + y) % 2:
                continue
            base = DIRT[1] if GROUND_DETAIL[y, x] > 0.55 else STONE[1]
            c.paint(x, y, snowy_material(x, y, w, base, bias=-0.05))
    # Ties and rails.
    for x in range(4, 60, 3):
        for y in range(track_y - 2, track_y + 5):
            c.paint(x, y, snowy_material(x, y, w, WOOD[2] if y < track_y + 4 else WOOD[1], bias=-0.1))
    for x in range(3, 61):
        for y, color in ((track_y, METAL[4]), (track_y + 1, METAL[1]), (track_y + 3, METAL[4]), (track_y + 4, METAL[1])):
            c.paint(x, y, color)
    for bx, dx in ((2, 1), (61, -1)):
        for y in range(track_y - 1, track_y + 5):
            c.set(bx, y, RED[1])
            c.set(bx + dx, y, RED[2] if y % 2 else RED[0])

    # Platform and station behind the track.
    for y in range(31, 41):
        for x in range(26, 61):
            base = STONE[3] if (x // 3 + y // 2) % 2 else STONE[2]
            if y == 39:
                base = GOLD[2] if x % 4 else STONE[3]
            if y == 40:
                base = STONE[0]
            c.set(x, y, roof_pixel(x, y, w, base, bias=-0.15))
    c.shadow_ellipse(47, 31, 14, 4, 0.8)
    sx0, sx1 = 36, 58
    for y in range(22, 31):
        for x in range(sx0, sx1 + 1):
            c.set(x, y, WALL[2] if (x * 2 + y) % 9 else WALL[1])
    for x in range(sx0, sx1 + 1):
        c.set(x, 30, WOOD[0])
    window(c, 39, 24, w, width=5, height=5)
    window(c, 51, 24, w, width=5, height=5)
    for y in range(24, 30):
        for x in range(45, 49):
            c.set(x, y, WOOD[1] if x in (45, 48) or y == 24 else WOOD[2])
    for y in range(8, 22):
        inset = max(0, 11 - y)
        for x in range(sx0 - 3 + inset, sx1 + 4 - inset):
            if y < 13:
                base = TEAL_ROOF[3] if (x + y) % 5 else TEAL_ROOF[2]
            else:
                base = TEAL_ROOF[1] if (y - 13) % 3 == 2 else TEAL_ROOF[2]
            c.set(x, y, roof_pixel(x, y, w, base, y < 13))
    draw_icicles(c, sx0 - 2, sx1 + 2, 22, w, 61)
    # Station clock.
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        c.set(46 + dx, 15 + dy, PAINT_WHITE[0])
    c.set(46, 15, METAL[0])
    # Lamp post on the platform.
    for y in range(28, 39):
        c.set(29, y, METAL[0])
    c.set(29, 27, LIGHT[3] if w >= 0.5 else GOLD[1])
    c.set(28, 27, METAL[0])
    c.set(30, 27, METAL[0])

    # Steam locomotive (facing left) and its coal tender, sitting on the rails.
    c.shadow_ellipse(27, track_y + 4, 23, 3, 0.9)
    base_y = track_y + 1  # wheel centre row
    lx0 = 6
    boiler_top, boiler_bottom = 33, 43
    for y in range(boiler_top, boiler_bottom + 1):
        for x in range(lx0 + 2, 31):
            rel = (y - boiler_top) / (boiler_bottom - boiler_top)
            base = METAL[2] if rel < 0.2 else METAL[1] if rel < 0.65 else METAL[0]
            if (x - lx0) % 7 == 0:
                base = GOLD[1] if rel < 0.65 else GOLD[0]
            if rel < 0.2:
                base = roof_pixel(x, y, w, base, True, bias=0.0)
            c.set(x, y, base)
    # Smokebox front and headlamp.
    for y in range(boiler_top + 1, boiler_bottom + 1):
        c.set(lx0 + 1, y, METAL[0])
        c.set(lx0, y, METAL[0] if y % 3 else METAL[1])
    c.set(lx0 + 1, boiler_top + 2, LIGHT[3] if w >= 0.5 else GOLD[2])
    # Smokestack with a flared top, and a brass dome.
    for y in range(boiler_top - 6, boiler_top):
        for x in range(lx0 + 4, lx0 + 8):
            c.set(x, y, METAL[1] if x < lx0 + 6 else METAL[0])
    for x in range(lx0 + 3, lx0 + 9):
        c.set(x, boiler_top - 7, roof_pixel(x, boiler_top - 7, w, METAL[0], bias=0.3))
    for y in range(boiler_top - 3, boiler_top):
        for x in range(lx0 + 14, lx0 + 18):
            c.set(x, y, GOLD[2] if x < lx0 + 16 else GOLD[1])
    # Cab.
    for y in range(28, boiler_bottom + 1):
        for x in range(31, 41):
            base = RED[1] if x < 39 else RED[0]
            if 30 <= y <= 33 and 33 <= x <= 37:
                base = LIGHT[2] if w >= 0.5 else GLASS[2]
            c.set(x, y, base)
    for x in range(30, 42):
        c.set(x, 27, roof_pixel(x, 27, w, METAL[0], bias=0.3))
        c.set(x, 26, roof_pixel(x, 26, w, METAL[1], bias=0.3))
    # Tender with a coal heap.
    for y in range(34, boiler_bottom + 1):
        for x in range(42, 54):
            base = METAL[1] if y > 35 else METAL[0]
            if y == 39:
                base = GOLD[1]
            c.set(x, y, base)
    for y in range(31, 35):
        for x in range(43, 53):
            if abs(x - 47.5) / 5.5 + (35 - y) / 4.5 <= 1.1:
                base = METAL[0] if GROUND_DETAIL[y, x] > 0.5 else np.array([30, 32, 38.0])
                c.set(x, y, roof_pixel(x, y, w, base, bias=0.25))
    # Cow-catcher.
    for i, y in enumerate(range(boiler_bottom - 2, base_y + 1)):
        c.set(lx0 - 1 - i // 2, y, RED[0])
        c.set(lx0 - i // 2, y, RED[1])
    # Wheels: a small leading wheel, two big drivers, and tender wheels.
    for wx, r in ((lx0 + 5, 1.6), (lx0 + 13, 2.6), (lx0 + 20, 2.6), (45, 1.6), (51, 1.6)):
        for y in range(int(base_y - r - 1), int(base_y + r + 2)):
            for x in range(int(wx - r - 1), int(wx + r + 2)):
                d = math.hypot(x - wx, y - base_y)
                if d <= r:
                    c.set(x, y, METAL[0] if d < 0.8 else RED[2] if d < r - 0.7 else RED[0])
    for x in range(lx0 + 11, lx0 + 23):
        c.set(x, base_y, GOLD[1])  # coupling rod
    draw_smoke(c, lx0 + 5, boiler_top - 11, w, 62)


DRAWERS = {
    "grass": draw_grass,
    "forest": draw_forest,
    "pond": draw_pond,
    "house": draw_house,
    "factory": draw_factory,
    "train": draw_train,
}


def render(tile_type, w):
    c = Canvas()
    DRAWERS[tile_type](c, w)
    c.snow_shadows()
    c.outline()
    return np.clip(np.round(c.rgb), 0, 255).astype(np.uint8)


def winter_amount(frame):
    """Frame 0 is full winter, frame 8 full summer."""
    return 1 - frame / (FRAMES - 1)


def build_sheet(tile_type):
    sheet = Image.new("RGB", (3 * N * SCALE, 3 * N * SCALE))
    frames = []
    for frame in range(FRAMES):
        pixels = render(tile_type, winter_amount(frame))
        frames.append(pixels)
        img = Image.fromarray(pixels, "RGB").resize((N * SCALE, N * SCALE), Image.NEAREST)
        sheet.paste(img, ((frame % 3) * N * SCALE, (frame // 3) * N * SCALE))
    return sheet, frames


def write_previews(directory, all_frames):
    os.makedirs(directory, exist_ok=True)
    # Every tile, every frame: rows = tile types, columns = frames winter -> summer.
    strip = Image.new("RGB", (FRAMES * N * 2, len(TILE_TYPES) * N * 2))
    for row, tile_type in enumerate(TILE_TYPES):
        for frame, pixels in enumerate(all_frames[tile_type]):
            img = Image.fromarray(pixels, "RGB").resize((N * 2, N * 2), Image.NEAREST)
            strip.paste(img, (frame * N * 2, row * N * 2))
    strip.save(os.path.join(directory, "frames.png"))
    # A small map at three moments, to judge seams and readability together.
    rng = np.random.default_rng(5)
    layout = [[str(rng.choice(TILE_TYPES + ["grass"] * 3)) for _ in range(6)] for _ in range(5)]
    for frame in (8, 4, 0):
        board = Image.new("RGB", (6 * N * 2, 5 * N * 2))
        for y, row in enumerate(layout):
            for x, tile_type in enumerate(row):
                pixels = all_frames[tile_type][frame]
                img = Image.fromarray(pixels, "RGB").resize((N * 2, N * 2), Image.NEAREST)
                board.paste(img, (x * N * 2, y * N * 2))
        board.save(os.path.join(directory, f"map-frame{frame}.png"))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--preview", help="directory to write preview images into")
    args = parser.parse_args()

    if not os.path.isdir("art"):
        raise SystemExit("run this from the roblox/ directory: python3 scripts/generate-tiles.py")

    os.makedirs(OUT_DIR, exist_ok=True)
    all_frames = {}
    for tile_type in TILE_TYPES:
        sheet, frames = build_sheet(tile_type)
        all_frames[tile_type] = frames
        path = os.path.join(OUT_DIR, f"{tile_type}-transition-winter-to-summer-grid.png")
        sheet.save(path, optimize=True)
        print(f"  wrote {path}")
    if args.preview:
        write_previews(args.preview, all_frames)
        print(f"  previews in {args.preview}")


if __name__ == "__main__":
    main()
