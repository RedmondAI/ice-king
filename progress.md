Original prompt: I want you to create a web-based game called "Ice King". I want you to make all of the art yourself. This is the first version of the game, and we will be adding features and changing mechanics as we start testing. Make sure everything is modular to allow easy modifications later, even if that means adding code you wouldn't normally write. I want you to use the PlayWrite MCP to play-test the game as you go. You can look up specific documentation using the context7 MCP.

# Progress Log

## 2026-02-27 (Milestone Update 40)
- Implemented `Friendly` mode creation from Create Game popup:
  - added mode-aware lobby mapping from server mode payloads;
  - `FRIENDLY` rooms now assign a shared team id for land ownership while keeping separate player resources;
  - `Join Game` and reconnect paths map mode from lobby mode payload instead of assuming local human play.
- Added Friendly coin gating:
  - host needs `50` Ice Coins to create a Friendly room;
  - option is unlocked in menu when funds are sufficient and shown as locked otherwise.
- Updated lobby behavior for Friendly:
  - room code, invite link, ready/start flow, and host-only start gating now use shared multiplayer handling for both `PLAY_ONLINE` and `FRIENDLY`.
- Added Playwright UI regression for Friendly:
  - host creates Friendly, guest joins via room code, both ready/start, gameplay starts, and minimal action path verifies live game rendering.
- Updated docs:
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
- Validation:
  - `npm run test` -> pass
  - `npm run build` -> pass
  - `npm run test:multiplayer:ui` -> pass

## 2026-02-26 (Milestone Update 39)
- Updated new-account defaults:
  - new users now start with `100` Ice Coins.
  - this is applied during account creation only (existing users keep their current coin balances).
- Files updated:
  - `apps/client/src/app/auth.ts`
  - `progress.md`
- Validation:
  - Playwright account-creation check: new user stats panel shows `Ice Coins: 100` (artifact: `output/web-game/stats-and-solo/new-user-100-coins.png`)
  - `npm run build` -> pass

## 2026-02-26 (Milestone Update 38)
- Added Create Game mode picker popup on splash:
  - `Create Game` now opens a modal with options:
    - `1: Play vs Computer`
    - `2: Play Online`
    - `3: Solo`
    - `4: Friendly (Locked, 50 Ice Coins)`
    - `5: Team (Locked, 80 Ice Coins)`
    - `6: Ice Wars (Locked, 80 Ice Coins)`
  - Removed standalone `Play vs Computer` button from the landing menu.
  - `Enter` on signed-in splash now opens the mode picker.
- Added local `Solo` mode runtime path:
  - lobby supports `Solo` start flow.
  - runtime boots a no-active-bot local engine variant for solo runs.
  - in-game opponent stats rail is hidden for solo.
- Added persistent account progression + stats:
  - account storage now includes `iceCoins`, game outcomes, solo counters, and all-time earnings.
  - non-solo matches convert final player money into `Ice Coins` on match end.
  - solo matches do not convert money to coins and instead track solo run metrics.
  - splash now shows account stats panel for signed-in users.
- Updated Playwright multiplayer UI regression for mode picker:
  - host now selects `2: Play Online` after clicking `Create Game`.
- Synced docs for mode picker, solo mode, and account coin/stat behavior.
- Files updated:
  - `apps/client/src/app/bootstrap.ts`
  - `apps/client/src/app/auth.ts`
  - `apps/client/src/game/runtime.ts`
  - `apps/client/src/game/types.ts`
  - `apps/client/src/game/ui/hud.ts`
  - `apps/client/src/styles.css`
  - `scripts/multiplayer-ui-regression.spec.cjs`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `progress.md`
- Validation:
  - `develop-web-game` Playwright client run via `web_game_playwright_client.js` -> pass artifact captured (`output/web-game/menu-mode-picker/shot-0.png`)
  - custom Playwright UI checks:
    - mode picker options visible and locked entries disabled
    - solo end screen + no-coin transfer behavior
    - play-vs-computer end screen + coin transfer behavior
    - account stats persistence after return to splash
    - no console errors in exercised flow
  - `npm run test` -> pass
  - `npm run build` -> pass
  - `npm run test:multiplayer:ui` -> pass (`1 passed`)

## 2026-02-26 (Milestone Update 37)
- Added splash-level local account auth (username/password) for client entry flow:
  - new auth module with localStorage-backed account creation/login/logout.
  - password validation now enforces minimum length of `4`.
  - no email required.
- Updated splash/menu wiring:
  - unauthenticated users now see Username + Password fields with `Create Account` and `Log In`.
  - authenticated users see signed-in status and `Log Out`.
  - Create/Join/Play flows now use logged-in username as player name.
  - reconnect button is now gated to stored sessions that belong to the logged-in account.
- Updated multiplayer Playwright UI regression to create accounts before host/guest room flow.
- Synced docs for account-gated splash behavior.
- Files updated:
  - `apps/client/src/app/auth.ts`
  - `apps/client/src/app/bootstrap.ts`
  - `apps/client/src/styles.css`
  - `scripts/multiplayer-ui-regression.spec.cjs`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `progress.md`
- Validation:
  - `npm run build` -> pass
  - `npm run test` -> pass
  - `npm run test:multiplayer:ui` -> pass (`1 passed`)
  - `develop-web-game` Playwright client run via `web_game_playwright_client.js` -> pass (artifact screenshots in `output/web-game/auth-smoke/`)

## 2026-02-23 (Milestone Update 36)
- Added multiplayer chat emoji-picker popup UI:
  - chat composer now has an `Emoji` button.
  - button opens a popup picker with quick-select emojis.
  - selected emoji inserts at cursor in chat input, then user sends normally.
- Synced core docs for latest behavior:
  - winner is highest money at end of match (not net worth).
  - multiplayer chat now explicitly documents emoji-picker popup behavior.
- Files updated:
  - `apps/client/src/game/runtime.ts`
  - `apps/client/src/styles.css`
  - `packages/game-core/src/systems/winConditionSystem.ts`
  - `packages/game-core/test/gameCore.test.ts`
  - `apps/client/src/game/ui/hud.ts`
  - `iceking.md`
  - `ARCHITECTURE.md`
  - `artstyle.md`
  - `GAME_SPEC.md`
  - `progress.md`

## 2026-02-23 (Milestone Update 35)
- Updated end-of-match winner logic to money-only:
  - time winner now resolves by highest `player.money` only.
  - if money is tied, overtime/draw behavior is preserved based on existing config.
  - removed net-worth-based winner resolution path.
- Added/updated tests for match outcome behavior:
  - winner by higher money even when opponent has higher assets.
  - equal-money draw when overtime is disabled.
- Updated player-facing/docs wording from net worth to money-based win condition.
- Files updated:
  - `packages/game-core/src/systems/winConditionSystem.ts`
  - `packages/game-core/test/gameCore.test.ts`
  - `apps/client/src/game/ui/hud.ts`
  - `iceking.md`
  - `GAME_SPEC.md`
  - `progress.md`

## 2026-02-23 (Milestone Update 34)
- Fixed remaining game-core test failure and completed documentation sync:
  - Updated `packages/game-core/test/gameCore.test.ts` bot candidate coverage to be season-aware.
  - Summer assertions now validate sell/craft/train/claim candidate presence.
  - Winter assertions now validate `pond.harvest.start` candidate presence.
  - Synced `iceking.md`, `GAME_SPEC.md`, and `ARCHITECTURE.md` with current winter-only pond harvest behavior and latest multiplayer UI/network behavior.
  - Updated `artstyle.md` timestamp + sprint note (no art contract changes).
- Validation:
  - `npm run test -w @ice-king/game-core` -> pass (`15/15`)
  - `npm run test` -> pass
  - `npm run test:multiplayer:ui` -> pass (`1 passed`)

## 2026-02-22 (Milestone Update 33)
- Added multiplayer in-match chat with emoji-capable input and full-height left rail UI:
  - New in-memory room chat endpoint: `POST /api/multiplayer/chat`.
  - Multiplayer room payloads now include a `chat` message list.
  - Runtime now renders a multiplayer-only chat panel on the left side of the map and syncs chat via state/action/chat responses.
  - Chat composer supports Enter to send and Shift+Enter for newline.
  - Hardened Playwright UI regression script prompt handling for `Join Game` to avoid dialog click deadlock in headless runs.
- Files updated:
  - `apps/client/vite.config.ts`
  - `apps/client/src/multiplayer/client.ts`
  - `apps/client/src/game/runtime.ts`
  - `apps/client/src/styles.css`
  - `scripts/multiplayer-ui-regression.spec.cjs`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `progress.md`
- Validation:
  - `npm install --save-dev @playwright/test` -> pass
  - `npm run build` -> pass
  - `npm run test:multiplayer` -> pass
  - `npm run test` -> fails in existing `packages/game-core/test/gameCore.test.ts` (`pond.harvest.start` candidate assertion).
  - `npm run test:multiplayer:ui` -> pass (`1 passed`)

## 2026-02-22 (Milestone Update 32)
- Completed multiplayer flow hardening and automated regression coverage:
  - `scripts/multiplayer-regression.mjs` now validates `create -> join -> ready -> start -> action -> reconnect -> expiry`.
  - join no longer short-circuits with placeholder UX; live room entry now works end-to-end.
  - room-pausing for disconnects and room-expiry (`ROOM_EXPIRED`) are now surfaced from `/api/multiplayer/*`.
  - root `npm run test` now runs both `game-core` tests and multiplayer regression.
  - root `npm run build` works in workspace+TS context using `npx tsx` in `apps/client` scripts.
  - added `scripts/run-multiplayer-ui-regression.mjs` wrapper + Playwright lobby/start action regression scaffold.
- Files updated:
  - `scripts/multiplayer-regression.mjs`
  - `scripts/multiplayer-ui-regression.spec.cjs`
  - `scripts/run-multiplayer-ui-regression.mjs`
  - `apps/client/vite.config.ts`
  - `apps/client/src/app/bootstrap.ts`
  - `apps/client/package.json`
  - `package.json`
  - `iceking.md`
  - `ARCHITECTURE.md`
  - `GAME_SPEC.md`
  - `artstyle.md`
  - `progress.md`
- Validation:
  - `npm run build` -> pass
  - `npm run test` -> pass
  - `npm run test:multiplayer:ui` scaffolded, but requires `@playwright/test` resolution in local environment to execute.

## 2026-02-22 (Milestone Update 31)
- Implemented first-pass online multiplayer create/join flow (replacing splash placeholder path):
  - Added authoritative in-memory room middleware in `apps/client/vite.config.ts`:
    - `POST /api/multiplayer/create`
    - `POST /api/multiplayer/join`
    - `POST /api/multiplayer/ready`
    - `POST /api/multiplayer/start`
    - `GET /api/multiplayer/state`
    - `POST /api/multiplayer/action`
  - Added typed client transport in `apps/client/src/multiplayer/client.ts`.
  - Updated splash + lobby flow in `apps/client/src/app/bootstrap.ts`:
    - `Create Game` now creates a room and enters lobby.
    - `Join Game` now prompts for a room code and joins that room.
    - Human lobbies poll room state, support ready toggles, and host-controlled start.
    - Lobby auto-enters gameplay once room start is observed.
  - Updated runtime networking support in `apps/client/src/game/runtime.ts`:
    - Added multiplayer session sync/poll path.
    - Gameplay actions post to authoritative room action endpoint.
    - Camera/select remain local for responsiveness.
    - Runtime debug mode labels multiplayer runs as `MULTIPLAYER`.
  - Added engine state replacement hook in `packages/game-core/src/engine.ts` for remote state hydration.
  - Extended runtime init contract in `apps/client/src/game/types.ts` for multiplayer session + initial state.
- No tests/build/playwright run in this edit chunk (not requested).

## 2026-02-22
- Added summer-only house sale gating:
  - `packages/game-core/src/systems/structureSystem.ts`: `sellIceAtHouse` and `sellBlueIceAtHouse` now fail with `WRONG_SEASON` outside `SUMMER`.
  - `apps/client/src/game/runtime.ts`: house sale actions are disabled in winter and surface popup warning text.
  - `apps/client/src/game/ui/hud.ts`: popup menu supports `warningText`.
  - `apps/client/src/styles.css`: added red popup warning style.
  - `packages/game-core/src/systems/botSystem.ts`: house sale bot candidates/actions are summer-gated.

## 2026-02-08
- Initialized implementation session.
- Loaded and reviewed:
  - `iceking.md` (full product/game architecture spec)
  - `artstyle.md` (pixel-art direction and theme constraints)
  - skill docs for `develop-web-game` and `playwright`.
- Verified environment prerequisites:
  - `npx` available
  - `node` and `npm` available
- Created initial monorepo directory structure:
  - `apps/client/src`
  - `packages/config/src`
  - `packages/shared/src`
  - `packages/theme-default/src`
  - `packages/game-core/src`
  - `packages/game-core/test`

## 2026-02-22 (Milestone Update 30)
- Updated pond harvest behavior:
  - Pond harvest can now start in any season.
  - Summer-started harvest jobs still take the normal duration but yield only half ice on claim.
  - The harvest action popup now warns that summer harvest yields are halved.
- Core updates:
  - `packages/game-core/src/systems/pondSystem.ts` for seasonal yield tracking and claim payout.
  - `packages/shared/src/index.ts` to persist `harvestIceYield` per pond job.
  - `apps/client/src/game/runtime.ts` for popup warning + year-round start UI path.
  - `packages/game-core/src/systems/botSystem.ts` to allow pond-start candidates outside winter.
  - `packages/game-core/test/gameCore.test.ts` fixture update for the new pond job field.

## Current Focus
- Scaffold runnable workspace configs and package wiring.
- Implement modular, deterministic game-core systems.
- Build first playable client loop and art/theme rendering.
- Run Playwright-based play-tests after each meaningful milestone.

## TODO (Living List)
- Add root workspace config (`package.json`, `tsconfig`, scripts).
- Add package-level configs and build/test scripts.
- Implement shared types + action schemas.
- Implement tunable game config module (timers, costs, capacities).
- Implement deterministic seeded map generation.
- Implement core systems:
  - season timing + transition phases
  - ownership/tile economics
  - pond jobs + claim lifecycle
  - structure actions (house/factory/train)
  - refrigerator melt protection
  - bot decision loop via same action API
- Implement client:
  - menu/lobby stubs with Play vs Computer flow
  - map renderer + camera + minimap drag
  - ownership and hover/selection outlines
  - popup/action panels
  - right-side rail UI containing instructions/stats/minimap outside gameplay viewport
  - debug overlay toggle (`F3`)
  - `window.render_game_to_text` + `window.advanceTime(ms)`
- Implement theme-default art rendering per `artstyle.md`.
- Add vitest coverage for key systems.
- Run Playwright MCP/manual play-tests, capture issues, fix regressions.

## Open Questions
- Keep default season duration at production value (5:00) with a debug-speed override unless user requests faster default.

## 2026-02-08 (Milestone Update 1)
- Added monorepo/tooling scaffold:
  - root `package.json` workspaces + scripts
  - root `tsconfig.base.json` and `tsconfig.json`
  - package manifests for `apps/client`, `packages/shared`, `packages/config`, `packages/theme-default`, `packages/game-core`
  - `apps/client/vite.config.ts`
- Implemented shared modular contracts in `packages/shared/src/index.ts`:
  - strongly typed state model and action unions
  - `GameActionSchema` (Zod)
  - system/theme interfaces
- Implemented config-driven game tuning in `packages/config/src/index.ts`:
  - economy/map/timing/win configs
  - `createGameConfig` with `PROD` and `DEV_FAST`
- Implemented default theme tokens + seasonal transition helpers in `packages/theme-default/src/index.ts`.
- Implemented initial deterministic game-core modules:
  - seeded RNG + map generation (`mapGenerator.ts`)
  - state initialization (`stateInit.ts`)
  - season clock and transition state (`seasonSystem.ts`)
  - ownership/economy + melt + net worth (`economySystem.ts`)
  - pond harvest lifecycle (`pondSystem.ts`)
  - structure actions: build/house/factory/train (`structureSystem.ts`)
  - bot logic baseline (`botSystem.ts`)
  - win conditions and overtime (`winConditionSystem.ts`)
  - engine orchestrator (`engine.ts`)

## 2026-02-08 (Milestone Update 2)
- User requested LLM-driven bot turn decisions.
- Next implementation chunk:
  - keep heuristic bot as safe fallback
  - add pluggable LLM bot policy path so we can switch decision strategy without rewiring game rules.

## 2026-02-08 (Milestone Update 3)
- Fixed deterministic RNG bug in `packages/game-core/src/rng.ts` (signed bitwise issue causing invalid map indices).
- Added comprehensive core-system tests in `packages/game-core/test/gameCore.test.ts`.
- Verified test results: `9/9` tests passing via Vitest.
- Began client app implementation with modular layers for screens, runtime, rendering, HUD, input, and bot policy routing.

## 2026-02-08 (Milestone Update 4)
- Resolved UI interaction blocker in HUD popup layering:
  - `apps/client/src/game/ui/hud.ts`
  - fix: popup host no longer intercepts clicks when empty; popup itself remains clickable.
- Re-ran Playwright MCP flow:
  - menu -> lobby -> start match
  - verified `window.render_game_to_text` and `window.advanceTime(ms)` hooks
  - verified tile select + action button interactions execute without click interception regressions.

## 2026-02-08 (Milestone Update 5)
- Hardened external LLM bot pipeline while preserving fairness and modularity:
  - `apps/client/src/game/runtime.ts`
    - `Play vs Computer` now defaults to external bot mode unless explicitly disabled with `VITE_DISABLE_LLM_BOT=1`.
  - `apps/client/src/game/bot/botDirector.ts`
    - added canonical action equality and strict allowed-action enforcement for both primary and fallback policies.
  - `apps/client/src/game/bot/llmPolicy.ts`
    - added request timeout, temporary backoff when unavailable, and strict action validation against allowed action set.
  - `apps/client/vite.config.ts`
    - upgraded `/api/bot/decide` middleware to index-based decision mapping (`actionIndex`) so model cannot return out-of-contract actions.
    - added resilient JSON extraction/parsing for model output.
    - added graceful disabled response when `OPENAI_API_KEY` is missing (no browser console errors).
- Playwright MCP validation after changes (served on `http://localhost:5174`):
  - started new match successfully.
  - confirmed runtime bot mode reports `LLM_EXTERNAL`.
  - confirmed no browser console errors in error-level logs during match start + simulated advance.
- Verification:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`9/9`).
  - `npm run build` -> pass.

## 2026-02-08 (Milestone Update 6)
- Expanded play-vs-computer gameplay mechanics around bot decision quality:
  - moved bot action candidate generation into shared game-core logic instead of client-local ad hoc assembly.
  - new candidate builder supports richer strategic options (claims, winter pond starts, house sells, factory crafts, train shipment, build actions, expansion/buyouts).
  - candidates are deduplicated and consistently capped for predictable LLM prompt size.
- Files updated:
  - `packages/game-core/src/systems/botSystem.ts`
  - `packages/game-core/src/engine.ts`
  - `apps/client/src/game/runtime.ts`
  - `packages/game-core/test/gameCore.test.ts`
- Added debug data to `window.render_game_to_text`:
  - global ownership counts by player
  - recent action/event tail for play-test assertions.
- Verification:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`10/10`).
  - `npm run build` -> pass.
  - Playwright MCP (`?fast=1`) confirms bot activity with `LLM_EXTERNAL` mode and accepted bot actions in recent events.

## 2026-02-08 (Milestone Update 7)
- Wired `.env` scaffolding and env loading behavior:
  - added root `.env.example` with bot model/key/timeouts/toggles.
  - added `.gitignore` entries for local env files and build/cache outputs.
  - updated Vite config to load env from both repo root and `apps/client`.
- Improved OpenAI middleware robustness:
  - primary model + fallback model chain (`ICEKING_BOT_MODEL_FALLBACKS`).
  - graceful unavailable responses (`action: null`) when API key is missing, model is unavailable, quota is exhausted, or request errors occur.
  - avoids browser console error spam while allowing heuristic fallback bot play to continue.
- Live GPT-backed test attempt:
  - direct POST to `/api/bot/decide` executed with provided key.
  - OpenAI responded with `insufficient_quota`, so live model decisions could not be completed in this environment.
  - fallback handling verified and in-game Playwright remained stable with no browser error logs.

## 2026-02-08 (Milestone Update 8)
- Updated bot model target to `gpt-5-nano`:
  - `apps/client/vite.config.ts` default model changed to `gpt-5-nano`.
  - `.env.example` updated (`ICEKING_BOT_MODEL=gpt-5-nano`).
- Ran live endpoint validation with a new API key (env-only, not stored in repo files):
  - direct `POST /api/bot/decide` returned `source: "llm"` successfully.
- Ran Playwright MCP live match test at `?fast=1`:
  - mode confirmed as `LLM_EXTERNAL`.
  - bot executed accepted actions during the match (`tile.buy` actions observed in recent bot events).
  - no browser console errors.
- Regression checks:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`10/10`).
  - `npm run build` -> pass.

## 2026-02-08 (Milestone Update 9)
- Tuned LLM bot prompt for fewer null decisions and stronger aggression:
  - enriched decision prompt with explicit aggressive priority ordering and stronger null-avoidance language.
  - added `preferredActionIndex` support so the prompt can use ranked fallback guidance.
  - improved action-index parser robustness (JSON/object/number/regex extraction).
  - configured OpenAI request for lower-reasoning, low-verbosity, schema-constrained JSON output to reduce truncation.
  - added deterministic index fallback when model output is malformed (keeps bot acting instead of stalling).
- Expanded play-vs-computer gameplay/economy strategy depth:
  - bot candidate action generation now aggressively prioritizes strategic expansion targets (train/house/pond), winter pond cycles, factory/pond build sequencing, and liquidity/risk actions.
  - candidate actions are scored and ranked by strategic value before selection.
  - heuristic bot now resolves from ranked candidates for consistent behavior across internal and external modes.
- Files updated:
  - `apps/client/vite.config.ts`
  - `apps/client/src/game/bot/llmPolicy.ts`
  - `apps/client/src/game/runtime.ts`
  - `packages/game-core/src/systems/botSystem.ts`
  - `packages/game-core/test/gameCore.test.ts`
- Added regression test:
  - heuristic prioritizes high-value early expansion targets (`TRAIN`/`HOUSE`/`POND`).
- Live validation with `gpt-5-nano`:
  - direct `/api/bot/decide` calls now return `source: "llm"` with non-null selected actions in repeated checks.
  - Playwright MCP match (`?fast=1`) confirms active bot turn-taking in `LLM_EXTERNAL` mode with accepted actions and no browser console errors.
- Verification:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`).
  - `npm run build` -> pass.

## 2026-02-09 (Milestone Update 10)
- Added root context/bootstrap docs for future threads:
  - `AGENTS.md`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `TODO.md`
- Each file now reflects current implementation status for client-first play-vs-computer development.
- Added stable agent guidance for coding style, folder boundaries, run/dev/test flow, naming rules, art pipeline references, and mobile safety guardrails.
- Established prioritized backlog in `TODO.md` so new threads can start with aligned priorities.

## 2026-02-09 (Milestone Update 11)
- Added a new first-visit epic splash screen experience for the client:
  - generated original splash art via OpenAI Image API (`imagegen` skill workflow)
  - selected and integrated final art asset: `apps/client/src/assets/splash-ice-king.webp`
  - wired splash entry flow in `apps/client/src/app/bootstrap.ts`
    - splash appears on first visit
    - entering marks local browser state (`iceking.splashSeen.v1`) and proceeds to menu
    - splash can be skipped with button or Enter/Space key
- Added modern pixel-art splash styling and motion overlays in `apps/client/src/styles.css`:
  - animated cinematic background pan
  - vignette + frost overlays
  - responsive card/button layout tuned for desktop and mobile widths
- Validation and regressions:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP checks:
    - first-visit splash render confirmed
    - menu transition confirmed
    - play-vs-computer lobby -> ready -> start match flow confirmed
  - mobile viewport splash usability confirmed
  - browser console error logs: none

## 2026-02-09 (Milestone Update 12)
- Completed a strict 64x64 seasonal art pass for all map tile types and transitions.
- Replaced runtime tile assets with regenerated, normalized top-down pixel-art tiles:
  - `apps/client/src/assets/tiles64/*.png`
  - `apps/client/src/assets/tiles-transition64/*-transition-winter-to-summer-grid.png`
- Art pipeline outputs for this pass:
  - raw generations: `output/imagegen/tile-pass4/raw/*.png`
  - previews: `output/imagegen/tile-pass4/previews/*-3x3.png`
- Enforced tileability and sheet integrity:
  - all runtime tile files are `64x64`
  - edge seam metrics are zero for every tile (`left/right` and `top/bottom`)
  - all transition sheets are `192x192` (3x3 of 64x64), `9/9` distinct frames, fully opaque (`alpha=255`)
- Playwright MCP in-game verification (`http://localhost:5173/?fast=1`):
  - main map canvas fills viewport (full-screen mount)
  - action panel is hidden until tile selection and then appears in the lower-right (`right: 14px`, `bottom: 266px`)
  - stats HUD layers above map/overlays (`hud z-index: 120`, canvas below)
  - seasonal transition keyframes advance and produce visible frame deltas during transitions
  - browser console errors: none

## 2026-02-09 (Milestone Update 13)
- Updated splash/menu flow so root URL always lands on splash with playable menu controls:
  - `/` now renders splash every visit (no localStorage splash gate).
  - integrated first menu actions directly into splash card:
    - display name input
    - Create Game / Join Game / Play vs Computer / How to Play / Settings
  - Enter key from splash now quick-starts `Play vs Computer` when a display name is set.
  - menu/back routes now return to splash presentation (with same embedded menu controls).
- Files updated:
  - `apps/client/src/app/bootstrap.ts`
- Validation:
  - `npm run build` -> pass
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`)
  - Playwright MCP (`http://localhost:5173/`):
    - root opens splash + art + menu controls
    - entering display name enables main action buttons
    - Enter key from splash moves into lobby
    - lobby Back returns to splash
    - browser console errors: none

## 2026-02-09 (Milestone Update 14)
- Updated map interaction behavior in match runtime:
  - dragging on the main map now pans camera directly (mouse drag / pointer drag).
  - clicking a tile once selects/highlights it but keeps tile actions hidden.
  - clicking the same tile a second time opens the tile action panel.
  - drag release suppresses the accidental click that often follows a pan gesture.
- Fixed camera movement precision:
  - camera positions are now tile-aligned integers when applying `camera.move`.
  - prevents fractional camera indices from blank/invalid tile sampling during pan.
- Shifted default world scale:
  - map size changed to `10x10`.
  - player viewport changed to `5x5`.
  - adjusted default map placement settings for small-map density.
- Hardened map generator for small worlds:
  - relaxed distance constraints progressively when necessary.
  - added robust fallback placement to still populate requested structures/pond centers.
  - replaced oversized fixed structure-distance constants with map-size-derived distances.
- Files updated:
  - `apps/client/src/game/runtime.ts`
  - `packages/game-core/src/engine.ts`
  - `packages/config/src/index.ts`
  - `packages/game-core/src/mapGenerator.ts`
- Validation:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP live checks (`http://localhost:5173/`):
    - viewport reports `5` tiles and visible tile count is `25`
    - first click keeps action panel hidden
    - second click on same tile opens action panel
    - drag pan changes camera and preserves valid visible tiles
    - panning to edge reaches visible max coordinate `9` (consistent with `10x10` world)
    - browser console errors: none

## 2026-02-09 (Milestone Update 15)
- Remade tile art at higher per-tile resolution (`256x256`) with strict seamless-border rules:
  - all tile types now use a shared tileable border language by season.
  - forest/house/factory/train motifs are constrained to center regions with border-safe grass/snow edges.
  - pond tiles now use centered oval pond/ice shapes with grass/snow around all edges for adjacency blending.
- New art generation + processing pass:
  - generated new raw seasonal assets in `output/imagegen/tile-pass5/raw/*.png`.
  - built normalized runtime tiles in `apps/client/src/assets/tiles256/*.png`.
  - generated 3x3 transition sheets in `apps/client/src/assets/tiles-transition256/*-transition-winter-to-summer-grid.png`.
  - generated seam preview mosaics in `output/imagegen/tile-pass5/previews/*-3x3.png`.
- Clarified transition spec:
  - transition remains `9` frames (3x3 grid), now at `256x256` per frame.
  - each transition sheet is `768x768`.
- Renderer integration updates:
  - switched tile art imports from `tiles64`/`tiles-transition64` to `tiles256`/`tiles-transition256`.
  - updated transition frame slicing target from `64x64` to `256x256`.
- Validation:
  - seam metrics for all final `tiles256` assets: edgeMAD `0.00` on left/right and top/bottom.
  - transition sheet checks: `768x768`, frame size `256x256`, `9/9` unique frames, alpha fully opaque.
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP live check (`http://localhost:5173/`): match loads, tile panel opens on double click, hooks intact, no browser console errors.

## 2026-02-09 (Milestone Update 16)
- Enabled true full-resolution tile display in runtime draw path:
  - changed client tile size constants so on-screen draw size is `256x256` per tile.
  - with viewport `5x5`, canvas render buffer is now `1280x1280` (no downscale from 256 assets per tile).
- File updated:
  - `apps/client/src/game/view.ts`
- Validation:
  - `npm run test -- --cache ./.vitest-cache` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP (`http://localhost:5173/`):
    - canvas internal size confirmed `1280x1280`
    - visible tiles remain `25` (5x5 viewport)
    - double-click tile action behavior still correct (first hidden, second shown)
    - drag pan still moves camera with valid visible tile set
    - browser console errors: none

## 2026-02-09 (Milestone Update 17)
- Synchronized core context/spec docs to current implementation state (removed stale `100x100/25x25`, first-visit splash persistence, and `16x16` assumptions).
- Updated:
  - `iceking.md`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `artstyle.md`
- Documentation now matches live branch behavior:
  - world `10x10`, viewport `5x5`, true `256x256` tile display.
  - splash screen always shown at root and includes first menu actions.
  - map drag panning + double-click tile action opening.
  - action panel lower-right and stats panel layered above map.
  - art pipeline standardized on `256x256` tiles + `3x3` (`768x768`) transition sheets.
- Validation:
  - stale-reference sweep across updated docs for old sizing/splash assumptions returned clean.

## 2026-02-09 (Milestone Update 18)
- Fixed map pan rendering so the world background texture scrolls with camera movement:
  - camera now preserves fractional tile coordinates during pan (no forced integer snap).
  - renderer now draws a world-anchored tiled grass background layer before tile overlays, and applies camera sub-tile pixel offsets consistently.
  - updated visible-tile debug extraction to use integer world-origin indexing while camera remains fractional.
- Hardened tile action button reliability for double-click -> action workflows:
  - action panel DOM now avoids redundant per-tick rerendering when content is unchanged.
  - HUD click handlers now resolve clicks via `closest(...)` on action attributes to prevent missed events on nested/inner click targets.
  - this eliminates intermittent no-op clicks where `Buy Tile` could appear but not fire.
- Increased tile highlight border thicknesses:
  - yellow hover border increased from `2` to `6` (3x thicker).
  - white selected border increased from `3` to `9` (3x thicker).
- Files updated:
  - `packages/game-core/src/engine.ts`
  - `apps/client/src/game/view.ts`
  - `apps/client/src/game/render/pixelRenderer.ts`
  - `apps/client/src/game/ui/hud.ts`
  - `apps/client/src/game/runtime.ts`
- Validation:
  - `npm run test` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP live checks (`http://localhost:5174/?fast=1`):
    - drag-pan yields fractional camera coordinates (`x=2.133...`, `y=2.076...`) and renders without tile/background desync.
    - repeated double-click + `Buy Tile` actions execute correctly after pan (money decrements, ownership updates, accepted `tile.buy` events recorded).
    - browser console errors: none
  - Post-fix screenshot captured:
    - `output/post-fixes-main-map.png`

## 2026-02-09 (Milestone Update 19)
- Updated minimap ownership visualization to avoid pond/owner blue ambiguity:
  - minimap tile fill now always uses terrain/type color.
  - ownership is now shown with a centered checkbox overlay on owned tiles (blue check for BLUE owner, red check for RED owner).
  - preserves pond blue tile readability while still showing ownership clearly.
- Updated game default start season:
  - switched config default from `SUMMER` to `WINTER`, so every new match starts in winter.
- Files updated:
  - `apps/client/src/game/render/minimap.ts`
  - `packages/config/src/index.ts`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `iceking.md`
- Validation:
  - `npm run test` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP live run (`http://localhost:5173/?fast=1`) confirms:
    - `render_game_to_text().season.logic === "WINTER"` immediately after match start.
    - minimap owned tiles show checkbox overlays while tile corners remain terrain colors.
    - no browser console errors (only a canvas readback performance warning from test sampling).
  - Screenshot captured:
    - `output/minimap-checkboxes-winter-start.png`

## 2026-02-09 (Milestone Update 20)
- Minimap ownership mark readability update:
  - replaced checkbox-with-border ownership marker with a larger standalone checkmark.
  - increased checkmark stroke width and added dark under-stroke for contrast on all terrain colors.
  - ownership indicator now shows only the colored check (no surrounding box).
- Main map outline normalization update:
  - white selected border now matches yellow hover border thickness.
  - blue/red ownership borders now also match yellow hover border thickness.
  - all tile outlines are now a single shared width value.
- Files updated:
  - `apps/client/src/game/render/minimap.ts`
  - `apps/client/src/game/render/pixelRenderer.ts`
- Validation:
  - `npm run test` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright MCP visual check (`http://localhost:5173/?fast=1`) confirms:
    - large standalone minimap checkmarks are visible/readable.
    - border widths appear matched across white/yellow/blue/red outlines.
  - Screenshot captured:
    - `output/minimap-checkmark-large-and-borders-equal.png`

## 2026-02-09 (Milestone Update 21)
- Optimized LLM bot usage to reduce API cost:
  - bot now only attempts LLM planning during strategic windows (season windows, contested/claim opportunities, pending production/research decisions, or active job pressure).
  - non-strategic turns skip LLM and use deterministic heuristic fallback directly.
  - increased primary LLM request spacing to `max(20000ms, cadenceMs * 8)` to avoid frequent low-value calls.
  - reduced tile summary candidate payload to the top `12` tiles to shrink prompt/context size.
- Minimap + map readability updates finalized:
  - train marker on minimap is now dark gray for clearer contrast against terrain and ownership marks.
  - shared tile outline width normalization keeps white/yellow/red/blue borders visually consistent.
- Job UX updates validated:
  - active extraction/crafting tiles render a pixel-art progress panel with task label, remaining duration text, and chunked progress fill.
  - progress panel art uses `apps/client/src/assets/ui/progress-job-frame.png`.
- Validation:
  - `npm run test` -> pass (`11/11`)
  - `npm run build` -> pass
  - Playwright live checks (`http://127.0.0.1:5173/?fast=1`) confirm:
    - double-click tile + `Buy Tile` applies ownership and spends funds when affordable.
    - winter pond extraction starts successfully and registers an active tile job.
    - no browser console errors.
  - Screenshot captured:
    - `output/playwright/final-validation-mainmap.png`

## 2026-02-09 (Milestone Update 22)
- Synced core spec docs to current implementation for latest gameplay/runtime changes:
  - updated map/world descriptions to reflect `10x10` playable area plus `1` tile non-interactable `VOID` border ring (`12x12` runtime grid).
  - documented `VOID` as a tile type and clarified that `VOID` cannot be selected or purchased.
  - documented minimap ownership checkmark overlay behavior, world-anchored background panning, job-progress tile overlay, and strategic-window LLM throttling.
- Files updated:
  - `iceking.md`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
- Fixed a UI regression in action panel visibility:
  - root cause: `HudLayer.setActionPanel` signature cache short-circuited initial hidden-state application because `lastActionPanelSignature` started as `''`.
  - fix: initialize signature cache to `null` so first call applies the hidden class reliably.
- File updated:
  - `apps/client/src/game/ui/hud.ts`
- Tightened LLM bot call gating further for API-cost control:
  - primary (LLM) policy now requires all three conditions simultaneously:
    - strategic window,
    - primary cooldown elapsed,
    - changed allowed-action decision signature.
  - this prevents repeated LLM calls in similar low-change states and shifts more windows to deterministic heuristic handling.
- File updated:
  - `apps/client/src/game/bot/botDirector.ts`
- Validation:
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass
  - Playwright MCP live checks (`http://127.0.0.1:5173/?fast=1`) confirm:
    - match starts in `WINTER`.
    - double-click + `Buy Tile` works on unowned pond tile and deducts funds.
    - winter pond harvest start deducts funds and creates an active pond job.
    - debug net worth now reflects tile ownership changes (no static `7` after purchases).
    - panning to map corner shows `VOID` border tile at `(0,0)` and clicking it leaves `selectedTile: null`.
    - action panel is hidden on match start until valid tile interaction.
    - browser console errors: none.

## 2026-02-09 (Milestone Update 23)
- Implemented longer bot post-action cooldown behavior:
  - external bot director now enforces a `20-30s` randomized wait after each accepted bot action before the next action can be created.
  - internal heuristic bot loop (`game-core` fallback mode) now enforces the same `20-30s` post-action cooldown window.
- Added bot token telemetry for debug/cost estimation:
  - Vite `/api/bot/decide` middleware now returns token usage metadata (`inputTokens`, `outputTokens`, `totalTokens`) with each decision response.
  - `OpenAiBotPolicy` now reports decision source + usage to runtime.
  - runtime debug overlay now shows cumulative token counts:
    - `botTokensIn`
    - `botTokensOut`
    - `botTokensTotal`
    - last decision usage/source snapshot.
- Synced docs to match behavior:
  - `iceking.md`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
- Files updated:
  - `apps/client/src/game/bot/types.ts`
  - `apps/client/src/game/bot/llmPolicy.ts`
  - `apps/client/src/game/bot/botDirector.ts`
  - `apps/client/src/game/runtime.ts`
  - `apps/client/vite.config.ts`
  - `packages/game-core/src/systems/botSystem.ts`
  - `iceking.md`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
- Validation:
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass
  - Playwright MCP check (`http://localhost:5173/?fast=1`) confirms:
    - debug overlay displays token counters.
    - bot accepted action timestamp deltas include a `~27.2s` gap (within requested `20-30s` cooldown window).
    - browser console errors: none.

## 2026-02-09 (Milestone Update 24)
- Splash/title polish:
  - removed splash H1 text (`Ice King`) while keeping the generated logo and existing splash CTA content.
- Job-progress overlay readability fixes:
  - clamped progress popup panel to canvas bounds so it cannot clip off the left edge while panning near world borders.
  - increased and standardized left text padding and enforced left text alignment inside the popup.
- Minimap border behavior adjustment:
  - minimap now renders only playable (non-`VOID`) tiles, removing the grey `VOID` border representation.
  - camera rectangle is computed against playable bounds and can extend off-minimap when camera is at far map edges.
- Economy/default tuning:
  - increased starting money from `$5c` to `$10c` for both players.
  - updated debug telemetry with `botLlmResponses` line to clarify cases where the bot acts via heuristic fallback while LLM token counts remain `0`.
- Docs synced:
  - `GAME_SPEC.md` and `iceking.md` updated for `$10c` starting money and playable-only minimap behavior.
- Files updated:
  - `apps/client/src/app/bootstrap.ts`
  - `apps/client/src/game/render/pixelRenderer.ts`
  - `apps/client/src/game/render/minimap.ts`
  - `apps/client/src/game/runtime.ts`
  - `packages/config/src/index.ts`
  - `packages/game-core/test/gameCore.test.ts`
  - `GAME_SPEC.md`
  - `iceking.md`
  - `progress.md`
- Validation:
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass
  - Playwright checks (`http://localhost:5173/?fast=1`) confirm:
    - splash displays logo without `Ice King` heading text.
    - player starts with `$10c`.
    - progress popup remains fully visible with proper left/right padding at edge pans.
    - minimap no longer shows grey `VOID` border color and camera rectangle can run off-minimap near map edges.
    - browser console errors: none.

## 2026-02-10 (Milestone Update 25)
- Pond harvest UX:
  - pond job overlay now persists when the harvest becomes `CLAIMABLE` and shows a pixel-style `Collect Ice` button.
  - clicking `Collect Ice` claims the pond job immediately (no extra tile click required) and triggers the existing flying-ice animation.
- Progress popup readability:
  - increased job-overlay text left padding by ~`15px` so text starts further inside the frame.
- Refactor:
  - extracted shared overlay layout + hit-test helpers so renderer and runtime use identical geometry.
- Files updated:
  - `apps/client/src/game/render/jobOverlayLayout.ts`
  - `apps/client/src/game/render/pixelRenderer.ts`
  - `apps/client/src/game/runtime.ts`
- Validation:
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass
  - Playwright manual flow confirms:
    - claimable pond overlay draws a `Collect Ice` button.
    - clicking the button claims the job and increments `ice` (`activePondJobs` becomes empty).

## 2026-02-10 (Milestone Update 26)
- Restored sane viewport scaling (no distortion, fits in typical browser windows):
  - introduced a centered square `game-stage` wrapper that clamps to `1280px` and otherwise uses `100vmin` so the full map + HUD/minimap fit without clipping.
  - `#game-canvas` remains `width/height: 100%` of the stage, so input mapping stays correct (runtime uses `getBoundingClientRect()`).
- Files updated:
  - `apps/client/src/styles.css`
  - `apps/client/src/app/bootstrap.ts`
  - `apps/client/src/game/runtime.ts`
- Validation:
  - Playwright MCP @ `1600x900` confirms HUD + minimap visible and canvas no longer stretches non-uniformly.
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass

## 2026-02-10 (Milestone Update 27)
- Railway deployment wiring:
  - added a root `npm start` that runs `vite preview` for the client and binds to `0.0.0.0:$PORT` for hosting.
  - extended `/api/bot/decide` middleware to run in both Vite dev and Vite preview servers so hosted builds can use the LLM bot endpoint.
  - added basic bot endpoint safety guards:
    - per-IP rate limit (env: `ICEKING_BOT_RATE_LIMIT_PER_MIN`, default `30`).
    - request body size cap (env: `ICEKING_BOT_MAX_BODY_BYTES`, default `512kb`).
- Files updated:
  - `apps/client/vite.config.ts`
  - `package.json`
  - `progress.md`
- Validation:
  - `npm run test` -> pass (`14/14`)
  - `npm run build` -> pass
- `PORT=7777 npm start` -> ok; `/api/bot/decide` returns `OPENAI_API_KEY_MISSING` when not configured.

## 2026-02-22 (Milestone Update 29)
- Moved all tile action UI from the fixed lower-right action panel into the existing popup overlay anchored above the selected tile.
- Reworked pond/harvest prompt to use the same tile popup flow so no separate tile-action panel remains.
- Added a bottom-left `Toggle Debug` on-canvas control (keyboard `F3` continues to work).
- Files updated:
  - `apps/client/src/game/ui/hud.ts`
  - `apps/client/src/game/runtime.ts`
  - `apps/client/src/styles.css`
  - `GAME_SPEC.md`
  - `ARCHITECTURE.md`
  - `iceking.md`
- No tests/builds executed for this UI-only edit (requested).

## 2026-02-22 (Milestone Update 30)
- Consolidated right-side overlays into a dedicated side-rail container outside the gameplay square:
  - instructions panel
  - stats panel
  - minimap
- This keeps these elements visible while reducing map coverage at all viewport sizes.
- Implemented via:
  - `apps/client/src/game/runtime.ts` (new side rail mount + minimap wiring)
  - `apps/client/src/game/ui/hud.ts` (optional rail mount for stats/instructions panel)
  - `apps/client/src/styles.css` (centralized side-rail layout styles)
  - `iceking.md`
  - `ARCHITECTURE.md`
  - `GAME_SPEC.md`
  - `progress.md`

## 2026-02-11 (Milestone Update 28)
- Railway host-allowlist fix for Vite preview:
  - configured `allowedHosts` for both `server` and `preview` in Vite config.
  - defaults now include Railway app domains (`.up.railway.app`) plus localhost entries.
  - added optional env override `ICEKING_ALLOWED_HOSTS` (comma-separated; use `*`/`true` to allow all).
- Files updated:
  - `apps/client/vite.config.ts`
  - `progress.md`
- Validation:
  - `npm run build` -> pass
