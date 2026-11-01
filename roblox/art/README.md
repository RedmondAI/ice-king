# Art pipeline

Roblox only shows images that have been **uploaded to Roblox** (you reference them by
asset id, e.g. `rbxassetid://123`). You can't point at a local file. So the art ships
in two steps: the files live here in the repo, and you upload them once and paste the
ids into [`../src/client/ui/Assets.luau`](../src/client/ui/Assets.luau).

The code already falls back to flat colors / styled text until ids are filled in, so the
game is always playable; it switches to real graphics the moment the ids appear.

## Files ready to upload

- `tiles/` — the tiles the game uses: one season sheet per tile type,
  `{grass,forest,pond,house,factory,train}-transition-winter-to-summer-grid.png`.
  Each is 768×768: 9 frames of 256×256 in a 3×3 grid, frame 0 = full winter,
  frame 8 = full summer. These are the **original game's tiles**, copied from
  `apps/client/src/assets/tiles-transition256/`, except these, which are rebuilt by
  script (run from `roblox/`; none modifies its inputs; shared helpers live in
  `scripts/tileart.py` and the kie.ai client in `scripts/kie.py`):
  - house: the original sheet swaps the winter log cabin for a different summer cottage,
    so `scripts/build-house-tile.py` keeps the winter cabin in every frame and only melts
    its snow.
  - factory and train: the originals also swap to a different structure in summer.
    `scripts/generate-structure-art.py` cuts each winter structure out onto magenta
    (`source/<name>-winter-cutout.png`) and has Nano Banana Pro paint the same structure
    without snow (`source/<name>-summer.png`). `scripts/build-structure-tiles.py` clips
    that to the winter silhouette and melts between the two, so the shape never changes.
    Settings and prompts are in `scripts/structures.py`.
  - forest: the pines are AI-generated (Nano Banana Pro on kie.ai, using the original
    forest tile as a style reference) by `scripts/generate-forest-art.py` into
    `source/forest-trees-{winter,summer}.png`. `scripts/build-forest-tile.py` cuts them
    out onto the grass tile's own ground (so it blends with grass) and melts the snow
    off in summer. Regenerating needs `KIE_API_KEY`, e.g.
    `KIE_API_KEY="$(op read 'op://Robin/Codex Shared API Tokens/KIE_API_KEY')" python3 scripts/generate-forest-art.py`.
- `ui/ice-king-logo.png` — the title logo
- `ui/splash-ice-king.png` — the splash hero (converted from the original `.webp`)

Only `tiles/` and `ui/` are uploaded.

In game, the board follows the engine's `transitionProgress` (the last 60s of each
season, 15s in fast mode), cross-fading between neighbouring frames so the change is
gradual. A sudden flip (the skip-summer vote) plays the change over 1.5s instead.

## Alternative: generated pixel-art tiles

`generated-tiles/` holds an alternative set of true pixel-art tiles (same sheet format)
drawn in code by `scripts/generate-tiles.py`: shared seamless ground, snow that spreads in
patches with shaded drifts, ponds that freeze inward, trees that drop their leaves, and
windows that light up. `generated-tiles/preview-*.png` shows what they look like.

The generator only ever writes to `generated-tiles/`, so it can't replace the tiles in
use. To try the generated set in game, copy it over and upload:

```bash
python3 scripts/generate-tiles.py --preview /tmp/iceking-preview   # needs numpy + Pillow
cp art/generated-tiles/*-grid.png art/tiles/
lune run scripts/upload-art.luau
```

To go back to the original tiles:

```bash
cp ../apps/client/src/assets/tiles-transition256/*-grid.png art/tiles/
lune run scripts/upload-art.luau
```

## Upload with the script (recommended)

`scripts/upload-art.luau` uploads every image through Roblox Open Cloud and writes the
ids into `src/client/ui/Assets.luau` for you.

**One-time: create an API key**

1. Go to https://create.roblox.com/dashboard/credentials → **API Keys** → **Create API Key**.
   (To upload as a group, switch the dashboard to that group first.)
2. Under **Access Permissions**, add the **Assets** API and tick **Read** and **Write**.
3. Under **Security → Accepted IP Addresses**, add `0.0.0.0/0` (or just your own IP).
4. Create the key and copy it. Roblox only shows it once.
5. Find your user id: it's the number in your profile URL,
   `https://www.roblox.com/users/<this number>/profile`.
6. Create `roblox/.env` (git-ignored, never commit it):
   ```
   ROBLOX_API_KEY=paste-the-key-here
   ROBLOX_USER_ID=12345678
   ```
   For a group, use `ROBLOX_GROUP_ID=...` instead of `ROBLOX_USER_ID`.

**Upload**

From the `roblox/` folder:

```bash
lune run scripts/upload-art.luau --dry-run   # preview: lists what would upload
lune run scripts/upload-art.luau             # upload + fill in Assets.luau
```

The ids are recorded in `art/uploads.json` (commit it) together with a hash of each
file, so re-running only uploads images that are new or have changed. Redraw a tile,
run the script again, and `Assets.luau` picks up the new id.

New uploads go through Roblox's automatic moderation; an image can show blank in
Studio for a few seconds to minutes until it's approved.

## Upload with Roblox Studio (no extra tools)

1. In Studio, open **Asset Manager** (View → Asset Manager).
2. Click **Images → Import** (the little import icon) and select everything in `art/tiles/`
   and `art/ui/`. Studio uploads them; each is auto-moderated (usually seconds).
3. For each uploaded image, right-click → **Copy ID to Clipboard**.
4. Paste the ids into `src/client/ui/Assets.luau`:
   - uncomment the `Assets.tileSheets` lines and fill each tile type's sheet id,
   - set `Assets.logo` and `Assets.splash`.
5. Save. With `rojo serve` running, press **Play** — tiles, logo and splash now render.

Example once filled in:

```lua
Assets.tileSheets = {
    GRASS = "rbxassetid://111",
    -- ...the other five tile types...
}
Assets.logo = "rbxassetid://201"
Assets.splash = "rbxassetid://202"
```

## Tile image rules

- Each sheet: 768×768, 3×3 grid of 256×256 frames, row-major, frame 0 = winter → 8 = summer.
  Keep it ≤ 1024 px per side (Roblox downscales larger images).
- Pixel art with integer scaling; the board keeps it crisp with `ResampleMode = Pixelated`.
- **Seamless edges**: objects (and their shadows) stay off the outer tile edge; only the
  shared ground pattern touches it. The generator's previews make seams easy to spot.
- No frames/gutters at the tile edge. The game draws ownership and selection borders
  *inside* the tile.
