# Art Style Specification

Last updated: 2026-02-23

## Update Note (Current Sprint)
- No new art rule changes in this milestone; existing pixel/asset contracts remain:
  - 256x256 tile assets,
  - 768x768 3x3 transition sheets,
  - no frame/border gutters and strict tile-edge continuity.
- Multiplayer chat rail and dual stats UI are DOM layout updates only and do not change tile/sprite asset requirements.

## Core Direction
- Top-down pixel-art strategy style.
- Bright, high-contrast seasonal palette.
- Crisp nearest-neighbor rendering only.
- Readability-first silhouettes for interactable tiles.

Target feel:
- Handcrafted retro-pixel look with modern clarity.
- Tiles must read quickly during active strategy play.

## Current Technical Contract (Do Not Drift)
- Runtime tile render size: `256x256` per map tile (canvas is `1280x1280` for a `5x5` viewport; CSS may scale uniformly to fit the browser window).
- Every map tile asset must be exactly `256x256` pixels.
- Every transition frame must be `256x256` pixels.
- Transition atlas format is fixed to `3x3` grid (`9` frames total), exported at `768x768`.
- World transition playback:
- winter -> summer uses frames `0..8`.
- summer -> winter reuses same atlas in reverse `8..0`.

## Orientation + Composition Rules
- Strict top-down camera view only.
- No isometric angle.
- No side/front perspective shots for map tiles.
- Every tile is square and edge-to-edge usable.
- No gutters, card frames, or decorative borders around tile edges.
- Tile edges must be seamless/tileable on all four sides.

## Shared Border Language (Required)
All tile types must share compatible edge treatment so any adjacency is plausible.

- Summer border: grass field language.
- Winter border: snow field language.
- Center motif carries tile identity.

Per-type center rules:
- `GRASS`: mostly full-field texture with subtle variation.
- `FOREST`: tree mass in the middle; keep edge ring clear grass/snow.
- `POND`: centered oval water/ice body with grass/snow around edges.
- `HOUSE`/`FACTORY`/`TRAIN`: structure centered with border-safe ground around perimeter.

## Seasonal Asset Set (Per Tile Type)
For each tile type (`grass`, `forest`, `pond`, `house`, `factory`, `train`):
1. `*-summer.png` (`256x256`)
2. `*-winter.png` (`256x256`)
3. `*-transition-winter-to-summer-grid.png` (`768x768`, 3x3)

Current runtime paths:
- `apps/client/src/assets/tiles256/*.png`
- `apps/client/src/assets/tiles-transition256/*-transition-winter-to-summer-grid.png`

## Color and Material Guidance
Summer:
- vivid greens, warm highlights, saturated accents.
- clear material contrast for land, structures, rails, and water.

Winter:
- cool blue-lavender snow values.
- bright ice/water transitions.
- warm emissive accents (windows/lights) on structures for legibility.

General:
- avoid pure-black shadows.
- keep ownership outline readability in mind (blue/red strokes are rendered on top).

## Tileability Quality Gates
Before accepting assets:
- Confirm dimensions are exact (`256x256` or `768x768` for transition grids).
- Verify no transparent halos unless explicitly intended.
- Verify seamless wrap on `left/right` and `top/bottom` edges.
- Verify transition frame count is exactly 9 and frames are distinct.

## Naming Rules
Use lowercase kebab names and fixed suffixes:
- `grass-summer.png`
- `grass-winter.png`
- `grass-transition-winter-to-summer-grid.png`

Apply same pattern for each tile type.

## Splash Art Rules
- Splash may use a separate high-detail composition (not tileable).
- Target aspect: widescreen hero image for full-screen cover.
- Current file:
- `apps/client/src/assets/splash-ice-king.webp`

## Image Generation Workflow (Imagen)
When generating tile sets:
1. Generate summer/winter base pairs with strict top-down and tileable-edge constraints.
2. Generate transition sheets as `3x3` progression grids.
3. If needed, post-process to enforce seamless borders and exact dimensions.
4. Export runtime assets as PNG for tiles/transitions.

## Prompting Guardrails (for generators)
Use constraints like:
- "top-down tile"
- "single square tile"
- "seamless/tileable edges"
- "no border or frame"
- "center motif, edge-compatible grass/snow border"
- "pixel art"
- "256x256"

For transitions:
- "3x3 seasonal progression"
- "winter to summer"
- "each cell 256x256"
- "no spacing between cells"
- "total canvas 768x768"

## Anti-Patterns to Reject
- Isometric or angled camera output.
- Framed sprites with empty padding margins.
- Non-square tiles.
- Non-seamless edges causing visible seams in map tiling.
- Transition sheets with gutters or wrong frame count.
