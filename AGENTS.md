# Ice King Agent Guide

Last updated: 2026-02-09

This file is the stable operating guide for any new Codex thread in this repo.
If user instructions conflict with this file, follow the user.

## Read First
- `GAME_SPEC.md`
- `ARCHITECTURE.md`
- `TODO.md`
- `artstyle.md`
- `progress.md`

## Project Scope (Current)
- Client-first playable game loop is implemented.
- Primary mode is `Play vs Computer`.
- Bot supports external LLM decisions with internal heuristic fallback.
- Real two-player authoritative networking is not built yet.

## Tech + Workspace
- Language: TypeScript.
- Package manager: npm workspaces.
- App: Vite client (`apps/client`).
- Game logic: modular deterministic systems (`packages/game-core`).
- Shared contracts: `packages/shared`.
- Tunable config: `packages/config`.
- Theme tokens: `packages/theme-default`.

## Run / Dev / Test
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Tests: `npm run test`
- Fast gameplay timing: open `http://localhost:5173/?fast=1`

Env for live LLM bot:
- Copy `.env.example` to `.env` or `apps/client/.env`.
- Set `OPENAI_API_KEY`.
- Default model is `gpt-5-nano` unless overridden by `ICEKING_BOT_MODEL`.

## Coding Rules
- Keep `packages/game-core` pure gameplay logic (no DOM, no fetch, no renderer coupling).
- Keep actions schema-driven via `GameActionSchema` in `packages/shared`.
- Route bot and player actions through the same validation path in engine.
- Prefer small modules and explicit helper functions over large mixed files.
- Avoid hidden side effects; update state through named system functions.

## Naming Conventions
- Types/interfaces/classes: `PascalCase`.
- Functions/variables: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` only for true constants.
- Booleans: prefix with `is`, `has`, or `can`.
- Action ids: dot names (example: `tile.buy`, `pond.harvest.claim`).
- File names:
  - Runtime/game helpers: `camelCase.ts`
  - Docs/specs: `UPPERCASE.md` or existing legacy file names.

## UI + Mobile Guardrails
- Do not break mobile layout.
- Keep game usable at narrow widths (phone portrait baseline).
- Preserve existing responsive behavior in `apps/client/src/styles.css`.
- Prefer additive CSS changes; avoid hardcoded viewport assumptions.

## Art Pipeline Rules
- Source of truth: `artstyle.md`.
- Pixel rules:
  - Base tile size: `16x16`.
  - Integer scaling only.
  - No anti-alias smoothing.
- New gameplay art must include:
  - Summer and winter readability.
  - Clear ownership and interactable contrast.
- Keep theme values centralized in `packages/theme-default`.

## Testing + Validation Requirements
- For gameplay or UI behavior changes:
  - Run `npm run test`.
  - Run `npm run build`.
  - Run Playwright-based play test (menu -> lobby -> match -> gameplay actions).
- Check browser console errors after play tests.
- Keep `window.render_game_to_text` and `window.advanceTime(ms)` working.

## Documentation Hygiene
- Update `progress.md` after meaningful work chunks.
- Keep `TODO.md` prioritized and current.
- Keep `GAME_SPEC.md` and `ARCHITECTURE.md` in sync with code changes.
