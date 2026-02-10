# TODO

Last updated: 2026-02-09

This list is prioritized top-down. Keep it current.

## P0 (Current Focus)
- [ ] Improve bot mid-game economy transitions so it shifts from tile expansion into pond/factory loops earlier.
- [ ] Add bot diagnostics panel in debug view (last action source, selected index, fallback reason).
- [ ] Add longer simulation checks for bot behavior over full seasonal cycles (house sales, crafting, train usage).
- [ ] Tune balance values for play-vs-computer after diagnostics are visible.

## P1 (Next Major Milestone)
- [ ] Build real two-player authoritative multiplayer service (`apps/server`).
- [ ] Replace menu/lobby placeholder flows with real create/join room lifecycle.
- [ ] Implement reconnect timeout and forfeit rules in true networked flow.
- [ ] Add shared snapshot/delta sync contract for client/server.

## P2 (UX + Content)
- [ ] Replace alert-based placeholders (`How to Play`, `Settings`, `Join Game`) with in-app panels.
- [ ] Improve mobile layout ergonomics (action panel/hud overlap handling on narrow screens).
- [ ] Add explicit touch-target sizing pass for in-game controls.
- [ ] Expand seasonal visual polish with additional art variants while preserving readability.

## P3 (Quality + Tooling)
- [ ] Add integration-style automated scenario tests around match progression.
- [ ] Add lint/format scripts and enforce consistent style checks.
- [ ] Add CI workflow for test + build + basic Playwright smoke run.

## Done Recently
- [x] Client-first playable game loop with map, actions, HUD, minimap, and season system.
- [x] External LLM bot pipeline with legal-action gating and fallback heuristic.
- [x] Prompt and parser tuning for aggressive index-based LLM decisions.
- [x] Env scaffolding (`.env.example`) and OpenAI middleware fallback handling.
- [x] Core tests and build passing locally.
- [x] First-visit epic splash screen with custom generated art and responsive entry flow.
