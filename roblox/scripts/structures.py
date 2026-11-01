"""Factory and train tiles: shared settings for generate-structure-art.py and
build-structure-tiles.py.

Each structure keeps its original winter frame (frame 0) all year. An image model
paints a summer version of the same cut-out structure with the snow removed, and the
build script melts between the two.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGINAL_TILES = ROOT.parent / "apps/client/src/assets/tiles-transition256"
SOURCE_DIR = ROOT / "art/source"

STRUCTURES = {
    "factory": {
        "summer_prompt": (
            "Edit this image to summer. It shows a pixel-art factory seen from above on a flat "
            "magenta background. Keep the factory exactly the same: same building, brick chimney, "
            "pipes and storage tanks, in the same positions, sizes and silhouette, with the same "
            "colours of steel and brick and the same 16-bit pixel art style and dark outlines. Only "
            "remove the snow: wherever snow covers the roof, tank tops, pipes and ledges, show the "
            "surface underneath (grey-blue metal roof panels, steel tank tops, steel pipes, brick). "
            "The ground patch under the factory stays dry packed dirt. Do not add, remove or move "
            "any objects. Keep the background one flat, solid, pure magenta color (#FF00FF) exactly "
            "as it is: no grass, no shadows, no smoke, no border, no text."
        ),
        "smoke_puffs": [(62, 140, 2.5), (56, 142, 3.2), (50, 146, 3.6), (44, 152, 3.4), (39, 159, 3.0)],
        "melt_seed": 3,
    },
    "train": {
        "summer_prompt": (
            "Edit this image to summer. It shows a pixel-art steam train seen from above on a flat "
            "magenta background: a black locomotive with two passenger cars, a small wooden station "
            "with a lamp post, a short stretch of railway track, and a few pine trees behind. Keep "
            "everything exactly the same: same objects in the same positions, sizes and silhouette, "
            "the same colours of the locomotive, cars and station walls, and the same 16-bit pixel "
            "art style and dark outlines. Only remove the snow: the car roofs show their dark red "
            "metal roofs, the station roof shows brown wooden shingles, the pine trees are green, "
            "and the track shows wooden sleepers and brown gravel. Do not add, remove or move any "
            "objects. Keep the background one flat, solid, pure magenta color (#FF00FF) exactly as "
            "it is: no grass, no shadows, no smoke, no border, no text."
        ),
        "smoke_puffs": [(86, 79, 2.2), (81, 81, 2.8), (76, 85, 3.2), (73, 92, 3.4), (71, 100, 3.2), (70, 108, 2.8)],
        "melt_seed": 4,
    },
}


def original_sheet(name):
    return ORIGINAL_TILES / f"{name}-transition-winter-to-summer-grid.png"


def cutout_path(name):
    return SOURCE_DIR / f"{name}-winter-cutout.png"


def summer_path(name):
    return SOURCE_DIR / f"{name}-summer.png"
