# ARCHITECTURE

Last updated: 2026-02-10

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
2. Splash acts as first menu surface (name + Create/Join/Play vs Computer/How to Play/Settings).
3. Lobby is rendered; `Play vs Computer` starts runtime when human toggles ready.
4. `GameRuntime` creates `GameEngine.createPlayVsComputer(...)`.
5. Frame loop:
- Input handling (keys, map drag, minimap drag, two-step click tile behavior).
- Fixed-step engine tick.
- External bot director update (when enabled).
- HUD/action panel updates.
- Main canvas + minimap render.

## State and Validation Boundaries
- Source of truth: `GameState` (`packages/shared/src/index.ts`).
- All user/bot gameplay actions pass through `GameActionSchema`.
- Engine owns mutation; UI/runtime never mutates core state directly.
- Runtime map includes a non-interactable `VOID` border ring around playable content; engine validation blocks selection/purchase/action use on `VOID`.

## Systems in `packages/game-core`
- `seasonSystem`
- Season clock, transition progress, keyframe index.
- `economySystem`
- Tile purchases/buyouts, melt logic, net worth.
- `pondSystem`
- Harvest start/claim lifecycle (timed completion; winter-only start constraint).
- `structureSystem`
- Build actions, house sales, train shipment, factory crafting jobs.
- `botSystem`
- Candidate action generation, ranking, heuristic choice, cadence handling.
- `winConditionSystem`
- Match end, overtime, forfeit/time winner logic.

## Rendering and Layering
- Main map: single `canvas` (`#game-canvas`) filling a centered square stage that scales uniformly to fit the browser window (max `1280 x 1280`).
- Tile rendering uses `256x256` tile assets with `5x5` viewport draw.
- Background grass texture is world-anchored and scrolls with camera pan.
- Minimap is separate canvas in lower-right.
- Minimap keeps terrain color by tile type and overlays owner identity with larger standalone red/blue checkmarks.
- DOM overlay layer sits above canvas and contains:
- Instructions panel (top-right, above Stats; collapsed by default).
- Stats HUD (top-right, collapsible).
- Tile action panel (lower-right, hidden until second click on same tile).
- Season bar, toasts, debug overlay, pond popup host.
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
- Dedicated multiplayer server is not implemented yet.
- Current simulation is local client-first with deterministic engine.
- `Create Game` / `Join Game` are staged UI for future multiplayer backend.

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

## Testing and Validation
- Baseline checks:
- `npm run test`
- `npm run build`
- Gameplay/manual automation checks should validate:
- splash -> lobby -> match flow
- drag pan + two-click tile actions
- no console errors
- debug hooks (`render_game_to_text`, `advanceTime`) remain working

## Extension Rules
- Add new mechanics as isolated system/module changes in `packages/game-core`.
- Extend shared action/state schemas before wiring runtime/UI.
- Keep rendering/art concerns out of core gameplay logic.
- Keep `GAME_SPEC.md`, `artstyle.md`, and `progress.md` aligned with code updates.
