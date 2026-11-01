# Ice King — Roblox (2D)

A from-scratch 2D Roblox rewrite of the Ice King web game, built entirely out of
UI components. The whole match runs on the **server** (authoritative); the client
just sends moves and renders the board. You can play **vs the AI bot** or **vs
another player** in the same server.

> This is a separate project from the TypeScript web game in the repo root. It
> shares the game *design* (and the original is the behavioral reference), but the
> code is a clean Luau rewrite.

## What's here now

- ✅ Full game rules re-implemented in Luau (`src/shared/core`) — economy, seasons,
  ponds/harvest, factories, houses, train, the heuristic bot, win conditions.
- ✅ Headless test suite (40 checks) that proves the Luau core matches the original.
- ✅ Server match runner + replication, and a full client UI (menu, board, HUD,
  tile action menu, end screen).
- ✅ Two-player matches: **Play vs Player** pairs the first two people waiting in a
  server into one shared match.
- 🎨 The original game's tile art with animated season transitions (plus an
  alternative pixel-art set generated in code) — see [`art/README.md`](art/README.md).

## One-time setup

1. **Install Roblox Studio** (free): https://create.roblox.com/
2. **Get the command-line tools.** On macOS the simplest way is Homebrew:
   ```bash
   brew install rojo lune stylua selene
   ```
   (Cross-platform alternative: install Rokit — https://github.com/rojo-rbx/rokit —
   then run `rokit install` in this folder to fetch the pinned versions from
   `rokit.toml`. You only need one of these two; don't run `rokit` if you used brew.)
3. **Install the Rojo Studio plugin** so Studio can connect:
   ```bash
   rojo plugin install
   ```
   (or in Studio: Plugins → Manage Plugins → search "Rojo".)

## Run the game in Studio

```bash
rojo serve
```

Then in Studio:
1. Open a new baseplate place (File → New).
2. Open the **Rojo** plugin panel and click **Connect** (default port 34872).
3. Press **Play**. The Ice King menu appears — click **Play vs Computer**.

Tip: turn on **Fast mode** in the menu for 8-minute matches (handy for testing).

### Two players

**Play vs Player** puts you in a queue on the server. When a second player in the
same server does the same, both are dropped into one match: the first player waiting
is Blue (P1), the second is Red (P2), and the match uses the first player's Fast mode
setting. Each player sees their own land in blue and their opponent's in red.

- Both players must press **Skip Summer** before summer is skipped.
- If a player leaves (or forfeits) mid-match, the other player wins.
- **Find New Opponent** on the end screen joins the queue again.

To test it alone in Studio: **Test** tab → **Clients and Servers** → set players
to **2** → **Start**. Two client windows open; click **Play vs Player** in each.

Prefer a static file? Build one and open it directly in Studio:
```bash
rojo build --output iceking.rbxl
```

## Publishing

### First time (once, in Studio)

1. `rojo build --output iceking.rbxl`, then open `iceking.rbxl` in Studio.
2. **File → Publish to Roblox As… → Create new experience.** Publish from the account
   that uploaded the art (`ROBLOX_USER_ID` in `.env`) so the images load.
3. **File → Game Settings → Places → Server Size**: more than 1 (e.g. 8–20). Players
   are only paired with others in the same server.
4. To open it to everyone: on [create.roblox.com](https://create.roblox.com), fill in the
   experience's **Maturity & Compliance** questionnaire, then make it **Public**.

### Every update after that

```bash
lune run scripts/publish.luau            # test, build, publish; new servers get it
lune run scripts/publish.luau --restart  # ...and move players in running servers onto it now
lune run scripts/publish.luau --dry-run  # test and build only
```

`--save-only` uploads a saved version without publishing it. The script stops if the
tests fail.

It needs three values in `roblox/.env` (or exported in the shell):

```
ROBLOX_UNIVERSE_ID=...  # Creator Dashboard → the experience → ⋯ → Copy Universe ID
ROBLOX_PLACE_ID=...     # the number in the experience's roblox.com/games/<id>/ URL
ROBLOX_API_KEY=...      # the same key as for art uploads, with permissions added:
```

On [create.roblox.com → Open Cloud → API Keys](https://create.roblox.com/dashboard/credentials),
edit the key and add the **universe-places** API (Write) for this experience. For
`--restart`, also add the **universe** API (Write).

Friends who want to play each other should join the same server (the **Join** button on
a friend's profile), then both click **Play vs Player**.

## Run the tests (no Studio needed)

The pure game logic has no Roblox dependencies, so it runs headless under Lune:

```bash
lune run tests
```

This runs the foundation, map-generation, engine, and full behavioral-parity
suites (the same cases as the original web game's test suite).

## Formatting & linting

```bash
stylua src tests        # format
selene src              # lint (first run: `selene generate-roblox-std`)
```

## How it fits together

```
src/
  shared/   -> ReplicatedStorage/IceKing      (shared by server + client)
    core/        the engine + systems (pure Luau; also runs under Lune)
    Theme.luau   one source of truth for colors
    Remotes.luau RemoteEvents
  server/   -> ServerScriptService/IceKingServer
    Main.server.luau   bootstrap + tick loop
    MatchService.luau  solo + two-player matches, the PvP queue, replicates snapshots
  client/   -> StarterPlayer/StarterPlayerScripts/IceKingClient
    Main.client.luau   wires the UI to the remotes
    ui/          Board, Hud, TileMenu, EndScreen, Menu
tests/      Lune test suites (not shipped into the game)
art/        sprite specs + where uploaded asset ids go
```

**Data flow:** client taps a tile → `SubmitAction` → server validates through the
one `Engine:applyAction` path → server replicates the new state via `StateUpdate`
→ client re-renders. The server ticks every match on `Heartbeat`; the bot runs
server-side inside the engine tick.

## What's next

- **Art:** swap or edit the sheets in `art/tiles/`, then run
  `lune run scripts/upload-art.luau` to upload and fill `src/client/ui/Assets.luau`.
  See [`art/README.md`](art/README.md).
- **Multiplayer polish:** private invites/rematch with a friend, and pausing for a
  reconnect instead of forfeiting when someone drops.
- **Progression:** Ice Coins / stats via DataStore.
