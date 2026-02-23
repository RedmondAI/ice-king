# GAME_SPEC

Last updated: 2026-02-23

## Current Playable Mode
- Supported modes:
- `Play vs Computer` (local client-first loop).
- `Create Game` / `Join Game` (two human players over `/api/multiplayer/*` room service).
- Multiplayer authority currently runs in the Vite host process (in-memory, no persistent backend yet).

## Multiplayer Flow (Current)
- Lobby contract:
  - `POST /api/multiplayer/create` returns host room session info and lobby snapshot.
  - `POST /api/multiplayer/join` joins a known room code and returns guest session.
  - `POST /api/multiplayer/ready` toggles readiness per player.
  - `POST /api/multiplayer/start` is host-gated (`P1` only), requires both players ready.
  - `GET /api/multiplayer/state` polls lobby and state.
  - `POST /api/multiplayer/action` applies validated gameplay actions.
  - `POST /api/multiplayer/chat` appends a room chat message and returns updated room payload.
- Session semantics:
  - sessions are token-based (`session.token` + `roomCode` + player id), passed on each multiplayer call;
  - host is fixed to `P1`;
  - join/reconnect requires valid token + room code.
- Reconnect behavior:
  - disconnected players are tracked with `disconnectedPlayerId`;
  - during active match pause window, actions return `MATCH_PAUSED`;
  - after timeout window during active matches, disconnect-forfeit resolves match state.
- Room lifecycle:
  - rooms expire after inactivity and return `ROOM_EXPIRED` from state/action/join APIs;
  - expired response includes readable `details`.
  - expiry timer defaults to 6 hours (`ICEKING_MULTIPLAYER_ROOM_TTL_MS`) and can be shortened for test runs.

## Core Loop
- Expand by buying tiles.
- Control ponds and start harvest jobs in winter.
- Claim harvest output when ready (default `1:00`).
- Protect regular ice with refrigerators.
- Build factories and man-made ponds on owned `GRASS`/`FOREST`.
- Craft refrigerators or blue ice at owned factories.
- Sell at owned houses and use yearly train shipment.
- Win by higher net worth.

## Economy (Default Config)
- Start per player: `$20`, `0 ice`, `0 blue ice`, `1 refrigerator`.
- Buy unowned tile: `$1`.
- Buyout tile: `tile.currentPrice + $1` fee.
- Build factory: `2 ice + $2`.
- Build man-made pond: `1 ice + $2`.
- Pond harvest start: `$1` (winter only).
- House sell (Summer only):
- Ice: `$2` each.
- Blue ice: `$8` each.
- Factory craft:
- Refrigerator: `2 ice + $2`.
- Blue ice: `2 ice + $2`.
- Train shipment:
- Cost: `3 regular ice`.
- Gain: `$9`.
- Limit: once per in-game year per player.
- Refrigerator capacity: `2 regular ice` per refrigerator.
- Melt rule: at `WINTER -> SUMMER`, unrefrigerated regular ice loses `50%` (floor).

## Season + Match Timing
- Match start season: `WINTER` (default config).
- `PROD`:
- Season duration: `5:00`
- Visual transition: last `1:00`
- Pond harvest: `1:00`
- Factory craft: `2:00`
- Match: `30:00`
- `DEV_FAST` (`?fast=1`):
- Season duration: `1:15`
- Transition: `0:15`
- Pond harvest: `1:00`
- Craft: `0:20`
- Match: `8:00`
- Transition keyframes: `9` (`0..8`).

## World, Camera, and Rendering
- Playable world size: `10 x 10` tiles.
- Runtime grid size: `12 x 12` (`1` non-interactable `VOID` border tile around all sides).
- Main viewport: `5 x 5` tiles.
- Draw size: `256 x 256` px per tile.
- Main canvas render size in default play view: `1280 x 1280`.
- Display sizing:
- Game view is a centered square stage that scales uniformly to fit the browser window (max `1280 x 1280`, letterboxing allowed).
- Minimap:
- Right-side rail (outside game area), bottom segment.
- Playable-area preview (non-interactable `VOID` border tiles are hidden).
- Red camera rectangle.
- Click/drag to move camera.
- Ownership is shown with large standalone blue/red checkmarks over terrain colors.

## Tile Set + Generation
- Tile types: `GRASS`, `FOREST`, `POND`, `HOUSE`, `FACTORY`, `TRAIN`, `VOID`.
- Seeded procedural generation.
- Defaults:
- Natural pond centers: `3`
- Houses: `4`
- Train: `1`
- Forest density: `0.12`
- Starting factory tiles: `0`
- Generated playable tiles are wrapped by a `1` tile `VOID` border ring.

## Controls
- Camera pan: `WASD`, arrow keys, minimap drag, or map drag.
- Tile interaction:
- First click selects tile.
- Second click on same tile opens tile action menu.
- Fullscreen toggle: `F`.
- Exit fullscreen: `Esc`.
- Toggle debug panel: `F3`.
- Forfeit match: `Q`.

## UI Behavior Rules
- Root (`http://localhost:5173/`) always opens splash screen.
- Splash includes first menu controls (name input + buttons).
- `Enter` on splash starts Play-vs-Computer when display name is set.
- Instructions panel:
- Above Stats, collapsed by default.
- Provides a themed summary of the rules and controls.
- Stats panel:
- In a right-side rail outside the game area, collapsible, above map layer.
- Shows money, ice, blue ice, refrigerators, refrigerated split, season, and train window status.
- Includes `Other User's Stats` beneath the local player stats, with border color based on opponent color.
- Multiplayer chat panel:
- In multiplayer matches only, a full-height chat window appears on the left side of the map.
- Supports standard text chat and emoji entry, with Enter-to-send and Shift+Enter for newline.
- Tile action menu:
- Hidden by default.
- Appears as a small popup above the selected tile after the second click on the same tile (two-step selection).
- Ownership + hover visuals:
- Blue/red outlines for owned tiles.
- Yellow hover outline on unowned tiles.
- Debug overlay (`F3`) includes cumulative bot token usage (`botTokensIn`, `botTokensOut`, `botTokensTotal`) for API cost estimation.

## Bot Rules
- Bot is `P2`.
- Uses same `GameAction` schema and validation as human.
- External mode:
- LLM chooses from allowed legal action list only.
- Internal heuristic fallback if LLM unavailable/invalid.
- LLM calls are throttled and attempted only in complex strategic windows; heuristic policy handles low-value windows.
- After each accepted bot action, next bot action creation is delayed by `20-30` seconds.

## LLM Environment Rules
- Environment source: repo root `.env` or `apps/client/.env`.
- Required for external bot: `OPENAI_API_KEY`.
- Default model: `gpt-5-nano`.
- Optional overrides:
- `ICEKING_BOT_MODEL`
- `ICEKING_BOT_MODEL_FALLBACKS`
- `ICEKING_BOT_TIMEOUT_MS`
- `VITE_ENABLE_LLM_BOT`
- `VITE_DISABLE_LLM_BOT`

## Runtime Map Data Format
- `GameState.tiles` is a flat array (`width * height`).
- Tile shape:
- `x`, `y`, `type`, `source`, `ownerId`, `currentPrice`.
- Actions and systems must use this schema directly.

## Debug Hooks
- `window.render_game_to_text()`
- Returns concise JSON state for play tests.
- `window.advanceTime(ms)`
- Advances deterministic simulation for tests.
