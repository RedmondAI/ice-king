# ARCHITECTURE

Last updated: 2026-02-27

## Architecture Style
- Current architecture is modular state + systems (not ECS).
- Single authoritative in-memory `GameState` managed by `GameEngine`.
- Gameplay mutations happen only through validated `GameAction` handling in engine/system functions.
- Rendering/UI reads state snapshots and dispatches typed actions.

## Monorepo Layout
- `apps/client`
- Vite app bootstrap, splash/menu/lobby/end screens.
- Runtime orchestration (`GameRuntime`).
- Canvas renderer + HUD + minimap + bot policy clients.
- Local dev middleware (`/api/bot/decide`) in `vite.config.ts`.
- Multiplayer transport helpers in `src/multiplayer/client.ts` plus menu/lobby runtime wiring in `src/app/bootstrap.ts`.
- `packages/game-core`
- Deterministic game engine + systems.
- Map generation, economy, season, structures, pond lifecycle, win logic, bot logic.
- `packages/shared`
- Shared state contracts + `GameActionSchema`.
- `packages/config`
- Tunable economy/timing/map/win constants.
- `packages/theme-default`
- Theme tokens and transition helpers.

## Runtime Flow
1. `bootstrapApp` renders splash on root every visit.
2. Splash acts as first menu surface with local account auth (username/password create+login), account stats, and menu controls (`Create Game`, `Join Game`, `How to Play`, `Settings`).
3. `Create Game` opens a mode-picker popup (`Play vs Computer`, `Play Online`, `Solo`, `Friendly`, `Team`, plus locked placeholder for `Ice Wars`).
4. Lobby is rendered for local (`Play vs Computer`, `Solo`) or online multiplayer room flow.
5. `GameRuntime` runs either:
- local play-vs-computer engine,
- local solo engine (no active bot actions), or
- multiplayer-synced state via `/api/multiplayer/*` room endpoints.
  - lobby polls `/api/multiplayer/state`, ready/start uses `ready` and `start`, gameplay actions post to `/api/multiplayer/action`, and chat posts to `/api/multiplayer/chat`.
6. Match end writes account progression:
- non-solo modes convert final money into Ice Coins;
- `Friendly` and `Team` run with multiplayer sessions and team ownership:
  - `Friendly` players share ownership of all land but keep separate money/ice.
  - `Team` runs in 4-player rooms with a selectable `Blue`/`Red` split, requiring exactly two players per team before start; lobby requires all players to pick sides.
  - engine setup scales map size/pond count/house count by 2 for TEAM rooms.
  - `/api/multiplayer/team` writes each player's preferred side and start applies the selected teams into game state.
7. Frame loop:
- Input handling (keys, map drag, minimap drag, two-step click tile behavior).
- Fixed-step engine tick (local mode) or remote state sync poll (multiplayer mode).
- External bot director update (when enabled).
- HUD/action panel updates.
- Multiplayer chat sync/render updates (multiplayer mode only).
- Main canvas + minimap render.

## State and Validation Boundaries
- Source of truth: `GameState` (`packages/shared/src/index.ts`).
- All user/bot gameplay actions pass through `GameActionSchema`.
- Engine owns mutation; UI/runtime never mutates core state directly.
- Runtime map includes a non-interactable `VOID` border ring around playable content; engine validation blocks selection/purchase/action use on `VOID`.
- Multiplayer session integrity is enforced by room token + room code checks and reconnect-aware heartbeats.

## Systems in `packages/game-core`
- `seasonSystem`
- Season clock, transition progress, keyframe index.
- `economySystem`
- Tile purchases/buyouts, melt logic, net worth.
- `pondSystem`
  - Harvest start/claim lifecycle (timed completion; starts are winter-only, claims complete into player ice).
- `structureSystem`
- Build actions, house sales, train shipment, factory crafting jobs.
- `botSystem`
- Candidate action generation, ranking, heuristic choice, cadence handling.
- `winConditionSystem`
- Match end, overtime, forfeit/time winner logic (time winner is highest money, not net worth).

## Rendering and Layering
- Main map: single `canvas` (`#game-canvas`) filling a centered square stage that scales uniformly to fit the browser window (max `1280 x 1280`).
- Tile rendering uses `256x256` tile assets with `5x5` viewport draw.
- Background grass texture is world-anchored and scrolls with camera pan.
- Minimap is separate canvas in the right-side control rail (outside the main game area).
- Minimap keeps terrain color by tile type and overlays owner identity with larger standalone red/blue checkmarks.
- DOM overlay layer sits above canvas and includes a dedicated right-side control rail that contains:
  - Instructions panel (above Stats; collapsed by default).
  - Stats HUD (collapsible).
  - Solo mode hides the opponent-stats subsection.
- Multiplayer mode also mounts a dedicated left-side chat rail (full stage height) for room chat.
- Chat composer includes an emoji-picker popup for quick emoji insertion.
- Tile action popup host (small action menu anchored above clicked tiles, shown on second click).
- Season bar, toasts, debug overlay.
- Tile job overlay panel (progress frame + label + remaining time + chunked progress fill) for active pond/factory jobs.
- Debug overlay includes cumulative bot token counters for API-cost tracking.
- Layer ordering keeps HUD/panels above map visuals.

## Input Model (Current)
- Camera movement:
- `WASD` / arrows.
- Main-map pointer drag pan.
- Minimap drag/click pan.
- Tile action opening is intentionally two-step:
- First click selects tile.
- Second click on same tile opens action menu.
- Fullscreen/debug controls:
- `F`, `Esc`, `F3`, `Q`.
- While typing in chat/text inputs, camera/input hotkeys are ignored.

## Bot Decision Pipeline
- Runtime asks game-core for legal candidate actions.
- External mode:
- `OpenAiBotPolicy` calls `/api/bot/decide`.
- Middleware sends indexed legal actions to OpenAI and receives `actionIndex`.
- Selected action is revalidated by engine before apply.
- Fallback:
- Heuristic policy takes over on timeout/unavailable/invalid output.
- Cost controls:
- Runtime bot director throttles primary LLM calls and only requests LLM decisions for complex strategic windows.
- Heuristic fallback is used directly for trivial/low-value windows.
- A post-action cooldown enforces `20-30` seconds between accepted bot actions.

## Networking Status
- Multiplayer room API is now implemented in `apps/client/vite.config.ts` as an in-memory authoritative service.
- Endpoints: `create`, `join`, `ready`, `start`, `state`, `action`, `chat` under `/api/multiplayer/*`.
- Chat payload is room-scoped and bounded (latest messages only) to keep room state lightweight.
- Current limitations:
- room state is process-memory only (no persistence, no cross-instance coordination).
- no dedicated `apps/server` deployment target yet.
- room lifecycle now includes disconnect gating and expiry:
  - disconnected players can reconnect during a configured pause window (`ICEKING_MULTIPLAYER_RECONNECT_PAUSE_MS`)
  - exceeded pause windows forfeit the disconnected player during active matches
  - idle rooms return `ROOM_EXPIRED` with human-readable detail text

## Configuration and Environment
- Static defaults in `packages/config/src/index.ts`.
- Default match start season is `WINTER`.
- Fast mode via `?fast=1`.
- Env loaded from repo root and `apps/client`.
- Key env vars:
- `OPENAI_API_KEY`
- `ICEKING_BOT_MODEL`
- `ICEKING_BOT_MODEL_FALLBACKS`
- `ICEKING_BOT_TIMEOUT_MS`
- `ICEKING_BOT_MAX_OUTPUT_TOKENS`
- `VITE_ENABLE_LLM_BOT`
- `VITE_DISABLE_LLM_BOT`
- `ICEKING_MULTIPLAYER_ROOM_TTL_MS` (room inactivity expiry in ms, default 6h)
- `ICEKING_MULTIPLAYER_RECONNECT_PAUSE_MS` (disconnect grace window in ms, default 90s)
- `ICEKING_MULTIPLAYER_MAX_ROOMS` (soft per-process room cap)
- `ICEKING_MULTIPLAYER_MAX_BODY_BYTES` (API body cap)

## Testing and Validation
- Baseline checks:
- `npm run test`
- `npm run build`
- Gameplay/manual automation checks should validate:
- splash -> lobby -> match flow
- drag pan + two-click tile actions
- no console errors
- debug hooks (`render_game_to_text`, `advanceTime`) remain working
- Multiplayer regression: `npm run test:multiplayer` (create/join/ready/start/actions/reconnect/expiry)

## Extension Rules
- Add new mechanics as isolated system/module changes in `packages/game-core`.
- Extend shared action/state schemas before wiring runtime/UI.
- Keep rendering/art concerns out of core gameplay logic.
- Keep `GAME_SPEC.md`, `artstyle.md`, and `progress.md` aligned with code updates.
