"""Shared helpers for the tile build scripts (season sheets, masks, keying)."""

from collections import deque

import numpy as np
from PIL import Image

FRAME = 256
FRAMES = 9
LUMA = np.array([0.299, 0.587, 0.114])
OUTLINE_LUMA = 150  # structure outlines are darker than this; the snow ground is lighter


def load_frames(path):
    sheet = np.asarray(Image.open(path).convert("RGB"), dtype=float)
    return [sheet[(k // 3) * FRAME:(k // 3 + 1) * FRAME, (k % 3) * FRAME:(k % 3 + 1) * FRAME] for k in range(FRAMES)]


def save_sheet(frames, path):
    sheet = np.zeros((FRAME * 3, FRAME * 3, 3))
    for k, frame in enumerate(frames):
        r, c = divmod(k, 3)
        sheet[r * FRAME:(r + 1) * FRAME, c * FRAME:(c + 1) * FRAME] = frame
    Image.fromarray(np.clip(sheet, 0, 255).round().astype(np.uint8)).save(path)


def neighbours4(mask, pad_value):
    p = np.pad(mask, 1, constant_values=pad_value)
    return [p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]


def dilate(mask):
    out = mask.copy()
    for n in neighbours4(mask, False):
        out |= n
    return out


def outside_count(mask):
    """How many of each pixel's 4 neighbours are outside the mask."""
    return sum(n.astype(int) for n in neighbours4(~mask, True))


def flood_from_edges(passable):
    seen = np.zeros_like(passable)
    queue = deque()
    for i in range(FRAME):
        for y, x in ((0, i), (FRAME - 1, i), (i, 0), (i, FRAME - 1)):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < FRAME and 0 <= nx < FRAME and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def label_components(mask):
    labels = np.zeros(mask.shape, int)
    count = 0
    for y, x in zip(*np.nonzero(mask)):
        if labels[y, x]:
            continue
        count += 1
        labels[y, x] = count
        queue = deque([(y, x)])
        while queue:
            cy, cx = queue.popleft()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = count
                    queue.append((ny, nx))
    return labels, count


def outlined_region(winter):
    """Everything enclosed by dark outlines in a snowy frame (plus stray grass tufts)."""
    luma = winter @ LUMA
    outline = dilate(luma < OUTLINE_LUMA)  # dilate once to close pinholes in the outline
    return ~flood_from_edges(~outline)


def trim_mask(winter, inside):
    """Drop the ring that only came from the outline dilation, then stray blue ground speckles."""
    luma = winter @ LUMA
    inside = inside & ~((outside_count(inside) > 0) & (luma >= OUTLINE_LUMA))
    speckle = (winter[..., 2] - winter[..., 0] > 60) & (luma > 95)
    for _ in range(4):
        inside &= ~((outside_count(inside) >= 2) & speckle)
    return inside


def structure_mask(winter):
    """The main structure in a winter frame: its biggest outlined piece, holes filled."""
    inside = outlined_region(winter)
    inside[[0, -1], :] = False
    inside[:, [0, -1]] = False
    labels, _ = label_components(inside)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    mask = ~flood_from_edges(~(labels == sizes.argmax()))
    return trim_mask(winter, mask)


def clearing_weight(outer_radius=112, feather=8):
    """1 inside a structure tile's clearing, fading to 0 at its edge (where it meets plain grass)."""
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    radius = np.hypot(yy - 128, xx - 128)
    return np.clip((outer_radius - radius) / feather, 0, 1)[..., None]


def smooth_noise(seed, passes=6):
    rng = np.random.default_rng(seed)
    field = rng.random((FRAME, FRAME))
    for _ in range(passes):
        field = sum(np.roll(np.roll(field, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9
    field -= field.min()
    return field / field.max()


def draw_smoke(frame, strength, puffs):
    """Soft pixel smoke puffs, (row, col, radius) each, blended in by `strength` (0..1)."""
    yy, xx = np.mgrid[0:FRAME, 0:FRAME]
    body = np.zeros((FRAME, FRAME), bool)
    highlight = np.zeros((FRAME, FRAME), bool)
    for cy, cx, r in puffs:
        body |= np.hypot(yy - cy, xx - cx) <= r
        highlight |= np.hypot(yy - cy + 1, xx - cx + 1) <= r - 1.4
    edge = dilate(body) & ~body
    for region, colour, alpha in ((edge, (150, 156, 166), 0.35), (body, (206, 210, 216), 0.6), (highlight, (236, 238, 242), 0.7)):
        a = alpha * strength
        frame[region] = frame[region] * (1 - a) + np.array(colour) * a


def is_magenta(rgb):
    # Includes the darker magenta blends along object edges.
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (np.minimum(r, b) - g > 50) & (np.abs(r - b) < 70)


def scale_down(rgb, coverage, size):
    """Box-filter colour weighted by coverage, so magenta never bleeds into the edges.
    `size` is (width, height); returns colour and a hard mask."""
    def box(channel):
        return np.asarray(Image.fromarray(channel.astype(np.float32), mode="F").resize(size, Image.BOX))

    alpha = box(coverage)
    colour = np.stack([box(rgb[..., c] * coverage) for c in range(3)], -1) / np.maximum(alpha, 1e-6)[..., None]
    return colour, alpha >= 0.5


def fill_from_neighbours(colour, have, want, max_steps=None):
    """Grow `colour` outward from the `have` pixels until every `want` pixel is filled
    (or `max_steps` rings have been grown); returns the colour and what got filled."""
    colour = colour.copy()
    filled = have.copy()
    steps = 0
    while (want & ~filled).any() and (max_steps is None or steps < max_steps):
        steps += 1
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(np.roll(filled, dy, 0), dx, 1) & ~filled
            colour[src] = np.roll(np.roll(colour, dy, 0), dx, 1)[src]
            filled |= src
    return colour, filled


def on_magenta(frame, mask, scale=4):
    """The masked pixels on flat magenta, scaled up so an image model sees the pixels."""
    canvas = np.where(mask[..., None], frame, np.array([255.0, 0.0, 255.0]))
    image = Image.fromarray(np.clip(canvas, 0, 255).round().astype(np.uint8))
    return image.resize((FRAME * scale, FRAME * scale), Image.NEAREST)
