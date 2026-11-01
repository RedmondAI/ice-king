#!/usr/bin/env python3
"""Paint snow-free summer versions of the factory and train with Nano Banana Pro on kie.ai.

For each structure, the winter frame of the original sheet is cut out onto flat magenta
(art/source/<name>-winter-cutout.png, 1024x1024) and the model edits it to summer
(art/source/<name>-summer.png), keeping the same shapes.
`scripts/build-structure-tiles.py` then builds the season sheets.

Usage (from roblox/):
  KIE_API_KEY=... python3 scripts/generate-structure-art.py [factory|train ...]
"""

import sys

import kie
from structures import ROOT, SOURCE_DIR, STRUCTURES, cutout_path, original_sheet, summer_path
from tileart import load_frames, on_magenta, structure_mask


def main():
    names = sys.argv[1:] or list(STRUCTURES)
    key = kie.api_key()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    for name in names:
        print(name)
        winter = load_frames(original_sheet(name))[0]
        on_magenta(winter, structure_mask(winter)).save(cutout_path(name))
        url = kie.upload(cutout_path(name), key, f"ice-king/{name}")
        kie.download(kie.generate(STRUCTURES[name]["summer_prompt"], [url], key), summer_path(name))
        print(f"  wrote {summer_path(name).relative_to(ROOT)}")


if __name__ == "__main__":
    main()
