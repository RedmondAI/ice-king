# Ice King Master Spec (Current Branch)

Last updated: 2026-02-10

This document is the implementation-aligned spec for the current client-first branch.
If this file conflicts with code, update this file in the same change set.

## Current Build Scope
- Primary playable mode is `Play vs Computer`.
- `Create Game` and `Join Game` exist in UI but are placeholder flows.
- Gameplay runs in a local deterministic engine (`packages/game-core`) inside the client runtime.
- LLM bot decisions are supported through Vite middleware (`/api/bot/decide`) with heuristic fallback.

## Current Non-Negotiables
1. Playable world size is `10 x 10` tiles with a non-interactable `1` tile `VOID` border ring around it (runtime grid is `12 x 12`).
2. Main viewport renders `5 x 5` tiles.
3. Internal render uses `256 x 256` tile assets per tile (`1280 x 1280` canvas for the `5 x 5` viewport).
4. Main map is shown in a centered square stage that scales uniformly to fit the browser window (max `1280 x 1280`, letterboxing allowed).
5. Minimap is always visible in bottom-right and supports drag-to-pan/click-to-pan.
5.1 Minimap renders playable tiles only (the `VOID` border ring is hidden there), so the red camera rectangle can extend off-minimap near far map edges.
6. Tile interactions:
- Drag on main map pans camera.
- Single click selects tile only.
- Second click on the same tile opens tile action panel.
- Drag release suppresses accidental click-open.
7. Tile action panel is anchored lower-right and hidden until the second click on the same tile.
8. Stats panel is top-right, collapsible, and layered above map/overlays.
8.1 Instructions panel is above Stats, collapsed by default, and explains core rules.
9. Splash screen appears at root (`/`) every visit and includes first menu actions.
10. Seasons use 9 keyframes for visual transition while gameplay logic flips at season boundary.

## Core Gameplay Loop
1. Buy territory.
2. Own and operate ponds in winter.
3. Harvest and collect ice when ready (default `1:00`).
4. Avoid summer melt with refrigerators.
5. Build factories and man-made ponds on owned `GRASS`/`FOREST` tiles.
6. Craft refrigerators or blue ice at owned factories.
7. Sell at owned houses and use train yearly shipment window.
8. Win on net worth at match end.

## Economy Defaults (Current)
- Start per player: `$20`, `0 ice`, `0 blue ice`, `1 refrigerator`.
- Buy unowned tile: `$1`.
- Buyout owned tile: `currentPrice + $1` fee.
- Build factory: `2 ice + $2`.
- Build man-made pond: `1 ice + $2`.
- Start pond harvest (winter only): `$1`.
- Sell at house:
- Ice: `$2` each.
- Blue ice: `$8` each.
- Factory craft:
- Refrigerator: `2 ice + $2`, `2:00` duration.
- Blue ice: `2 ice + $2`, `2:00` duration.
- Train shipment: `3 ice -> $9`, once per in-game year.
- Refrigerator capacity: `2 regular ice` per refrigerator.
- Melt rule: on `WINTER -> SUMMER`, unrefrigerated regular ice loses `50%` (floor).

## Timing Defaults (Current)
- Match start season: `WINTER`.
- `PROD`:
- Season: `5:00`
- Transition window: last `1:00`
- Pond harvest: `1:00`
- Craft duration: `2:00`
- Match duration: `30:00`
- `DEV_FAST` (`?fast=1`):
- Season: `1:15`
- Transition: `0:15`
- Pond harvest: `1:00`
- Craft: `0:20`
- Match: `8:00`

## Map Generation Defaults (Current)
- Tile types: `GRASS`, `FOREST`, `POND`, `HOUSE`, `FACTORY`, `TRAIN`, `VOID`.
- Generated at match start by seed.
- A `1` tile `VOID` border ring wraps all generated playable tiles.
- `VOID` border tiles are not selectable, not purchasable, and never valid for gameplay actions.
- Baseline map content:
- Natural pond centers: `3`
- Houses: `4`
- Train: `1`
- Factories at start: `0`
- Forest density: `0.12`

## Bot Rules (Current)
- Bot is `P2` and uses exact same `GameAction` validation path as human.
- Bot cannot mutate state directly.
- External mode uses LLM to pick one action from legal allowed action list.
- Invalid/unavailable LLM output falls back to deterministic heuristic policy.
- LLM calls are throttled and only attempted during strategic windows; low-value turns use heuristic policy directly.
- After each accepted bot action, the bot waits `20-30` seconds before creating its next action.

## Controls (Current)
- Camera: `WASD`/arrow keys, minimap drag, or map drag.
- Tile interaction: click once to select, click same tile again for actions.
- Fullscreen: `F`.
- Exit fullscreen: `Esc`.
- Debug panel: `F3`.
- Forfeit: `Q`.

## Environment
- Copy `.env.example` to `.env` (repo root) or `apps/client/.env`.
- Required for live LLM bot: `OPENAI_API_KEY`.
- Default bot model: `gpt-5-nano`.

## Current Monorepo Boundaries
```text
/apps/client          # Vite client, runtime, rendering, HUD, bot middleware
/packages/game-core   # Deterministic systems + engine
/packages/shared      # Shared types + action schema
/packages/config      # Tunable constants
/packages/theme-default # Palette + transition helpers
```

## Near-Term Roadmap
1. Continue deepening play-vs-computer mechanics and balancing.
2. Expand content variation and transition art coverage.
3. Build true 2-player authoritative networking (`Create/Join` real backend).
4. Add reconnect/session handling once server multiplayer exists.

## Validation Baseline
- `npm run test`
- `npm run build`
- Playwright flow: splash -> lobby -> match -> camera/action interactions -> no console errors
- Keep `window.render_game_to_text()` and `window.advanceTime(ms)` operational.
