#!/usr/bin/env python3
"""Generate the forest tile's tree art with Nano Banana Pro on kie.ai.

Writes two 1024x1024 images of the same pines on a flat magenta background:
  art/source/forest-trees-winter.png   (snow on the branches)
  art/source/forest-trees-summer.png   (same trees, snow melted)
`scripts/build-forest-tile.py` cuts the trees out and builds the season sheet.

The winter pass uses the original game's forest tile as a style reference; the summer
pass edits the winter result so the trees keep their positions and shapes.

Usage (from roblox/):
  KIE_API_KEY=... python3 scripts/generate-forest-art.py [--only winter|summer]
"""

import argparse
from pathlib import Path

from PIL import Image

import kie

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "art/source"
STYLE_REFERENCE = ROOT.parent / "apps/client/src/assets/tiles-transition256/forest-transition-winter-to-summer-grid.png"
WINTER_OUT = SOURCE_DIR / "forest-trees-winter.png"
SUMMER_OUT = SOURCE_DIR / "forest-trees-summer.png"

WINTER_PROMPT = (
    "Use the attached image only as the art style reference: its snow-covered pine trees "
    "(dark teal needles, thick white snow resting on every branch tier, crisp dark outline, "
    "top-down 3/4 view, 16-bit pixel art). Create a NEW image in exactly that style: about 15 "
    "snowy pine trees of varied sizes (a few tall, most medium, some small saplings) scattered "
    "naturally across the WHOLE image, like trees dotted over an open meadow seen from above. "
    "Spread them over all areas of the image, including near every corner and side, not bunched "
    "in the middle. Use uneven, organic spacing: a few single trees on their own, a couple of "
    "pairs, one or two small groups of three, and open gaps of empty space between them; no "
    "rows, no grid, no ring, no symmetry. Every tree is about 12 to 18 percent of the image "
    "height. Keep every tree fully inside the image with a small margin (about 5 percent) from "
    "the edges. The background must be one flat, solid, pure magenta color (#FF00FF) "
    "everywhere: no ground, no snow on the ground, no grass, no shadows, no border, no frame, "
    "no text. Crisp hard-edged pixel art, no blur, no glow."
)
SUMMER_PROMPT = (
    "Edit this image to summer. Keep every tree in exactly the same position, size and "
    "silhouette, and keep the same 16-bit pixel art style and dark outlines. Remove all the snow "
    "from the branches: the pine needles become rich evergreen green with lighter sunlit green "
    "on the tops of each branch tier where the snow was, and darker green underneath. Keep the "
    "brown trunks. Keep the background one flat, solid, pure magenta color (#FF00FF) exactly as "
    "it is: no ground, no grass, no shadows, no border, no text."
)


def style_reference():
    """The original winter forest frame, scaled up 4x so the model sees its pixels."""
    sheet = Image.open(STYLE_REFERENCE).convert("RGB")
    path = SOURCE_DIR / ".style-reference.png"
    sheet.crop((0, 0, 256, 256)).resize((1024, 1024), Image.NEAREST).save(path)
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["winter", "summer"])
    args = parser.parse_args()
    key = kie.api_key()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    if args.only != "summer":
        print("winter pass")
        reference = style_reference()
        kie.download(kie.generate(WINTER_PROMPT, [kie.upload(reference, key, "ice-king/forest")], key), WINTER_OUT)
        reference.unlink()
        print(f"  wrote {WINTER_OUT.relative_to(ROOT)}")
    if args.only != "winter":
        print("summer pass")
        kie.download(kie.generate(SUMMER_PROMPT, [kie.upload(WINTER_OUT, key, "ice-king/forest")], key), SUMMER_OUT)
        print(f"  wrote {SUMMER_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
