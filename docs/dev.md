<div align="center">
    <h1>Developer Documentation</h1>
    <p>
        <a href="#project-structure">Architecture</a> •
        <a href="#core-modules">Modules</a> •
        <a href="#ui-modules">Interface</a>
    </p>
</div>

## Table of Contents

- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Core Modules](#core-modules)
  - [Types (`src/core/types.ts`)](#types-srccoretypests)
  - [Constants (`src/core/constants.ts`)](#constants-srccoreconstantsts)
  - [Grid (`src/core/grid.ts`)](#grid-srccoregridts)
  - [Move Engine (`src/core/move.ts`)](#move-engine-srccoremovets)
  - [Game Session (`src/core/session.ts`)](#game-session-srccoresessionts)
  - [Storage (`src/core/storage.ts`)](#storage-srccorestoragets)
  - [RNG (`src/core/rng.ts`)](#rng-srccorerngts)
  - [Placeholder Engine (`src/core/engine.ts`)](#placeholder-engine-srccoreenginet)
  - [WASM Engine (`src/core/wasm-engine.ts`)](#wasm-engine-srccorewasm-engint)
  - [Worker (`src/core/engine.worker.ts`)](#worker-srccoreengineworkerts)
- [UI Modules](#ui-modules)
  - [App (`src/ui/app.ts`)](#app-srcuiappts)
  - [Board Renderer (`src/ui/board.ts`)](#board-renderer-srcuiboardts)
  - [Input (`src/ui/input.ts`)](#input-srcuiinputts)
  - [Controls / Popover (`src/ui/controls.ts`)](#controls-popover-srcuicontrolsts)
  - [Notifications (`src/ui/notify.ts`)](#notifications-srcuifyts)
  - [Theme (`src/ui/theme.ts`)](#theme-srcuithemet)
  - [Icons (`src/ui/icons.ts`)](#icons-srcuiiconsts)
- [Entry Point (`src/main.ts`)](#entry-point-srcmaint)
- [Styling](#styling)
- [Tests](#tests)
- [Build Pipeline](#build-pipeline)
- [Developer Console](#developer-console)
  - [Access](#access)
  - [Console API Reference](#console-api-reference)
  - [Internal Methods (App class)](#internal-methods-app-class)
  - [Global Window API](#global-window-api)
- [Auto-Play Engine](#auto-play-engine)
- [RNG & Spawn System](#rng--spawn-system)
- [Persistence Model](#persistence-model)
- [Backtrack (Unlimited Undo)](#backtrack-unlimited-undo)
- [CSS Custom Properties](#css-custom-properties)

## Project Structure

```
2048/
├── engine/                  # Rust WASM game engine (expectimax AI)
│   ├── src/lib.rs
│   └── pkg/                 # Generated WASM bindings (built by wasm-pack)
├── src/
│   ├── core/                # Game logic — zero DOM dependencies
│   │   ├── types.ts         # Shared type definitions
│   │   ├── constants.ts     # Game constants, tile colors
│   │   ├── grid.ts          # Grid creation, spawning, utilities
│   │   ├── move.ts          # Pure move function (slide + merge)
│   │   ├── session.ts       # GameSession — mutable game state
│   │   ├── storage.ts       # localStorage persistence
│   │   ├── rng.ts           # ChaCha20 CSPRNG for spawns
│   │   ├── engine.ts        # PlaceholderEngine (random legal moves)
│   │   ├── wasm-engine.ts   # WasmEngine (Rust expectimax via worker)
│   │   └── engine.worker.ts # Web Worker host for WASM engine
│   ├── ui/                  # DOM layer
│   │   ├── app.ts           # App class — main controller
│   │   ├── board.ts         # BoardRenderer — tile rendering & animations
│   │   ├── input.ts         # Input — keyboard + touch swipe handling
│   │   ├── controls.ts      # SettingsPopover — gear menu UI
│   │   ├── notify.ts        # NotificationCenter — toast popups
│   │   ├── theme.ts         # Theme management (light/dark/system)
│   │   └── icons.ts         # SVG icon strings
│   ├── styles/              # CSS files
│   │   ├── main.css         # Entry point (imports others)
│   │   ├── base.css         # Reset, theme tokens, typography
│   │   ├── layout.css       # Component layouts, buttons, overlays
│   │   ├── board.css        # Board grid, cells, tiles
│   │   └── ...
│   ├── main.ts              # Bootstraps App, exposes globals
│   └── vite-env.d.ts        # Vite type declarations
├── tests/                   # Vitest test suite
├── docs/dev.md              # This file
├── package.json
└── tsconfig.json
```

## Architecture Overview

The codebase is split into two layers with a hard dependency boundary:

1. **`src/core/`** — Pure game logic. No DOM, no side effects. Safe to import from tests, the UI, or external runtimes (e.g., a future CLI tool). Contains:
   - Grid representation and manipulation
   - Move resolution (slide + merge)
   - Tile spawning with ChaCha20 CSPRNG
   - Game session state management with undo history
   - Persistence (localStorage)
   - Two engine implementations: `PlaceholderEngine` (random legal moves) and `WasmEngine` (Rust expectimax AI)

2. **`src/ui/`** — Thin view layer. Each module handles exactly one concern:
   - `App` owns the game loop, state transitions, and settings
   - `BoardRenderer` handles DOM updates and animations
   - `Input` wires keyboard/touch to moves
   - `SettingsPopover` renders the gear menu
   - `NotificationCenter` shows toast popups
   - `Theme` manages light/dark mode

The entry point (`main.ts`) creates an `App` instance, calls `start()`, and attaches it to `window.__app` for console access.

## Core Modules

### Types (`src/core/types.ts`)

Central type definitions. No implementation, only interfaces and type aliases:

| Type | Description |
|------|-------------|
| `Direction` | `'up' \| 'down' \| 'left' \| 'right'` |
| `DIRECTIONS` | Readonly array of all four directions |
| `Cell` | `{ id: number, value: number }` — a single tile |
| `Grid` | `(Cell \| null)[][]` — row-major 2D array |
| `GameMode` | `'standard' \| 'classic'` |
| `PowerupType` | `'undo' \| 'swap' \| 'delete'` |
| `Powerups` | `{ undo: number, swap: number, delete: number }` |
| `TileMove` | Transcript entry for one tile's journey during a move |
| `SpawnedTile` | A newly spawned tile with position info |
| `MoveTranscript` | Result of a move: moved flag, tile moves, spawn, score gained |
| `GameSnapshot` | Immutable snapshot for undo (grid, score, powerups, won, over, moveCount) |
| `GameState` | Full mutable game state including RNG seed/calls |
| `EngineContext` | Read-only view handed to auto-play engines |
| `AutoAction` | Union type: move, swap, delete, or stop |
| `Engine` | Interface: `{ name, chooseAction(ctx): AutoAction \| Promise<AutoAction> }` |

### Constants (`src/core/constants.ts`)

| Constant | Value | Description |
|----------|-------|-------------|
| `SIZES` | `[3, 4, 5, 6, 8]` | Supported board sizes |
| `DEFAULT_SIZE` | `4` | Default board size |
| `DEFAULT_MODE` | `'standard'` | Default game mode |
| `WIN_VALUE` | `2048` | Tile value that triggers win banner |
| `SPAWN_PROB_4` | `0.1` | 10% chance a new tile is 4 (else 2) |
| `POWERUP_QUOTA` | `{ undo: 2, swap: 2, delete: 2 }` | Starting charges per Standard game |
| `MAX_HISTORY` | `16` | Bounded undo history count (powerup undo). Backtrack via delta history extends this to ~2000 steps when enabled in settings. |
| `TILE_COLORS` | `Record<number, {bg, fg}>` | Per-value CSS variable references |
| `SUPER_TILE` | `{ bg: var(--tile-super-bg), fg: var(--tile-super-fg) }` | Fallback for values above 2048 |
| `tileColor(value)` | Returns `{bg, fg}` | Lookup helper; falls back to SUPER_TILE |
| `gameKey(size, mode)` | `"${size}:${mode}"` | Storage key builder |

### Grid (`src/core/grid.ts`)

Pure grid utilities. No game state mutation:

| Export | Signature | Description |
|--------|-----------|-------------|
| `createGrid(size)` | `Grid` | Creates an empty `size x size` grid of nulls |
| `cloneGrid(grid)` | `Grid` | Deep-copies a grid |
| `gridsEqual(a, b)` | `boolean` | Compares two grids (uses tile `id` for identity) |
| `emptyCells(grid)` | `{row, col}[]` | Lists all empty positions |
| `isFull(grid)` | `boolean` | True when no empty cells remain |
| `spawnTile(grid, opts?)` | `SpawnedTile \| null` | Places a 2 or 4 at a random empty cell. Supports `value`, `at`, `rng`, `manipulate` options |
| `hasMoves(grid)` | `boolean` | True if any directional move or merge is possible |
| `maxTile(grid)` | `number` | Highest tile value on the board |
| `hasTile(grid, value)` | `boolean` | True if any tile >= value exists |
| `gridFromValues(values, idSeed?)` | `Grid` | Test helper: build grid from `number[][]` (0 = empty) |
| `gridToValues(grid)` | `number[][]` | Test helper: read grid as number matrix |
| `peekNextId()` | `number` | Current monotonic tile ID counter |
| `setNextId(n)` | `void` | Advance the tile ID counter |

**Spawn algorithm:** `spawnTile` uses the provided `rng` callback. If `opts.value` is set, it always places that value. Otherwise `rng() < SPAWN_PROB_4` (10%) → 4, else → 2. The tile gets a unique `id` from the monotonic counter.

When `opts.manipulate` is true, the spawn picks the best of 5 candidate draws from the same RNG stream (position + value), biasing toward boards with more empty space and smoother adjacent values. This is used by the "RNG Manipulation" setting.

### Move Engine (`src/core/move.ts`)

Pure functions for resolving moves:

| Export | Signature | Description |
|--------|-----------|-------------|
| `move(grid, dir)` | `{ grid, transcript: MoveTranscript }` | Returns the resulting grid and a full transcript. Does NOT mutate input grid. Does NOT spawn a tile. `transcript.moved` is false when the direction had no effect. |
| `canMove(grid, dir)` | `boolean` | True if `move(grid, dir).transcript.moved` |

**How moves work:** The grid is split into lines (rows for left/right, columns for up/down). Each line is processed through `slideLine`, which compacts non-null cells toward the destination edge and merges adjacent equal values (each tile can merge at most once per move). The result is a compacted line placed back into the grid.

The transcript contains:
- `moved`: whether the grid changed
- `moves`: per-tile `TileMove` entries with `fromRow/Col`, `toRow/Col`, optional `mergedInto` and `newValue`
- `gained`: total score from merges
- `spawned`: set by the caller after `spawnTile`

### Game Session (`src/core/session.ts`)

`GameSession` is the single source of truth for mutable game state:

| Method | Description |
|--------|-------------|
| `GameSession.newGame(size, mode?, best?, rng?, manipulate?)` | Static factory. Creates a fresh session, advances the RNG for 2 starting tiles, returns the session. |
| `restoreSession(state, rng?)` | Rehydrate a persisted `GameState` into a live `GameSession`. Fixes the tile ID counter. |
| `session.applyMove(dir)` | Applies a directional move: slides/merges, spawns a tile, checks win/game-over. Returns `MoveTranscript` or null if no-move. |
| `session.undo()` | Pops the last snapshot from history, restores grid/score/powerups, pays one undo charge. Returns true on success. Only works in Standard mode with available charges. |
| `session.swap(r1, c1, r2, c2)` | Swaps two occupied tiles. Pays one swap charge. Records history. |
| `session.deleteTile(row, col)` | Removes a tile. Pays one delete charge. Records history. |
| `session.acknowledgeWin()` | Dismisses the win banner; player keeps playing. |
| `session.setRngManipulation(on)` | Toggles RNG Manipulation for subsequent spawns. |
| `session.toContext()` | Returns a read-only `EngineContext` for the AI. |

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `state` | `GameState` | Full mutable game state |
| `canUndo` | `boolean` | Has charges + history + Standard mode |
| `canSwap` | `boolean` | Has charges + Standard mode |
| `canDelete` | `boolean` | Has charges + Standard mode |

**History:** Each `applyMove`, `swap`, and `deleteTile` pushes a `GameSnapshot` onto `history` before mutating state. `undo` pops it. History is capped at `MAX_HISTORY` (16) entries for powerup undo. For unlimited backtrack, `deltaHistory` stores compressed delta-encoded steps (capped at 2000), enabled via the Backtrack toggle in settings. Undo itself is not recorded in history (cannot be "undone").

### Storage (`src/core/storage.ts`)

localStorage persistence layer:

| Export | Description |
|--------|-------------|
| `load()` | Reads from localStorage (`"2048:v1"` key). Returns `StoredData` with settings, games map, and nextId. Handles version mismatches and parse errors by returning fresh data. |
| `save(data)` | Serializes `StoredData` to JSON and writes to localStorage. Silently fails on quota exceeded. |
| `getGame(data, size, mode)` | Reads a saved `GameState` by key. |
| `putGame(data, state)` | Writes a `GameState` into the games map. |
| `clearGames(data)` | Erases all saved games and resets the tile ID counter. |

**StoredData shape:**
```typescript
interface StoredData {
  version: number;        // Always 1
  settings: Settings;     // Theme, auto-play prefs, last size/mode
  games: Record<string, GameState>;  // Keyed by "${size}:${mode}"
  nextId: number;         // Monotonic tile ID across all games
}

interface Settings {
  theme: 'light' | 'dark' | 'system';
  lastSize: number;
  lastMode: 'standard' | 'classic';
  autoOn: boolean;
  autoSpeed: number;      // ms between auto moves
  autoDepth: number;      // AI search depth override (0 = adaptive)
  autoPowerups: boolean;  // Whether AI may spend power-ups
  rngManip: boolean;      // Biases spawns toward player
}
```

### RNG (`src/core/rng.ts`)

ChaCha20-based CSPRNG for deterministic, unpredictable tile spawns:

**Algorithm:**
1. A per-game 256-bit seed is generated at game start (via `crypto.getRandomValues` or `Math.random` fallback).
2. The seed is XOR-ed with a hardcoded 32-byte `KEY_MATERIAL` constant to produce the ChaCha20 key.
3. `SecureRng` runs ChaCha20 in counter mode, generating 16 uint32 values per block.
4. Each call to `next()` returns `blockValue / 2^32` as a float in `[0, 1)`.
5. The `calls` property tracks how many values have been consumed — this is persisted so a reloaded game resumes the exact stream position.

**Key properties:**
- Without the source code (specifically `KEY_MATERIAL`), reproducing the stream is computationally infeasible.
- With the source code + persisted seed + stream position, every future spawn is fully predictable.
- `createRngSeed()` generates a fresh 8-uint32 seed.
- `deriveKey(seed)` produces the 256-bit ChaCha20 key from a seed.

### Placeholder Engine (`src/core/engine.ts`)

A simple `Engine` implementation that picks a random legal direction:

```typescript
const PlaceholderEngine: Engine = {
  name: 'Placeholder (random legal)',
  chooseAction(ctx): AutoAction {
    // Fisher-Yates shuffle DIRECTIONS, pick first legal move, or 'stop'
  },
};
```

Used as fallback when the WASM engine is unavailable (worker failure, timeout). Also used in tests. Never spends power-ups.

### WASM Engine (`src/core/wasm-engine.ts`)

The production AI engine. Wraps the Rust expectimax search compiled to WebAssembly:

**Interface:**
```typescript
interface WasmEngine implements Engine {
  name: 'Expectimax AI (Rust -> WASM, worker)';
  chooseAction(ctx: EngineContext): Promise<AutoAction>;
}
```

**Decision flow:**
1. Snapshots the board into a flat `Uint32Array`.
2. Posts a request to the Web Worker with board state, depth, power-up counts, and (if `manipulate` is on) the RNG seed + stream position.
3. Waits for the reply (with a 2-second hard timeout).
4. On timeout/failure: falls back to `PlaceholderEngine.chooseAction()`.
5. Decodes the WASM response:
   - Without power-ups: direction code (0-3) → `{ kind: 'move', dir }`, or out-of-range → `{ kind: 'stop' }`
   - With power-ups: flat action array decoded by `decodeAction()` → move/delete/swap/stop

**Action encoding** (flat `u32` array from WASM):
- `[0, dir]` → move in direction
- `[1, row, col]` → delete tile
- `[2, r1, c1, r2, c2]` → swap tiles
- `[3]` or anything else → stop

**Deterministic mode (`manipulate`):** When enabled, the worker calls `suggest_move_det` / `suggest_action_det` which use the predictive `suggest_*_det` entry points. These peek the exact next spawn from the ChaCha20 stream instead of averaging over random spawns — faster and sharper search.

### Worker (`src/core/engine.worker.ts`)

Dedicated Web Worker that hosts the WASM module:

**Protocol:**
- **Inbound:** `{ id, flat, size, depth, usePowerups, swaps, deletes, manipulate, seed, calls }`
- **Outbound (success):** `{ id, ok: true, code }` or `{ id, ok: true, action }`
- **Outbound (error):** `{ id, ok: false, error }`

**Lifecycle:**
- Lazily initializes the WASM module on first request.
- Reuses one long-lived worker across all requests.
- On fatal worker error: fails all pending requests, drops the worker, creates a fresh one on next request.
- Hard timeout kills stuck workers to prevent core hogging.

## UI Modules

### App (`src/ui/app.ts`)

The central controller. Orchestrates all game state, UI updates, and user interactions:

**Lifecycle:**
1. `constructor()` — Loads persisted data, determines initial size/mode from settings.
2. `start()` — Initializes theme, builds DOM, loads/restores the current game, optionally starts auto-play.
3. `destroy()` — Teardown: stops auto-play, closes overlays, removes listeners (for HMR).

**Key methods:**

| Method | Description |
|--------|-------------|
| `buildDOM()` | Constructs the entire app DOM tree: topbar, board, powerups, game-over bar, overlays. |
| `loadGame(size, mode)` | Restores from localStorage or creates a new game. Full re-render. |
| `switchTo(size, mode)` | Saves current game, switches to different size/mode combo. |
| `doMove(dir)` | Applies a directional move. Animates via board, bumps score, persists. |
| `confirmNewGame()` | Shows overlay if there's an in-progress game; otherwise creates one directly. |
| `newGame()` | Creates a fresh session, keeps best score, sets `pendingNew` safety flag. |
| `resumeGame()` | Restores the previous in-progress game when "Resume" is clicked. |
| `powerupUndo()` | Spends an undo charge to revert the last move. |
| `powerupSwap()` | Enters select mode for swapping two tiles. |
| `powerupDelete()` | Enters select mode for deleting one tile. |
| `cancelPowerup()` | Exits select mode, disarms powerup selection. |
| `updateUI()` | Syncs all UI elements: scores (with odometer animation), mode badge, powerup buttons, armed state, frozen indicator. |
| `handleWinOver()` | Shows win overlay (2048 reached) or game-over overlay (no moves left). Skips modal during auto-play. |
| `runAutoLoop(targetScore)` | Starts the AI engine looping until score reaches target. Exposed on `window.__runAutoLoop`. |
| `autoTick()` | The auto-play heartbeat: schedules next AI decision via `setTimeout`, applies result, loops. |
| `applyAutoAction(action)` | Dispatches AI decisions: move, delete, swap, or stop (with auto-loop restart logic). |
| `showOverlay(opts)` | Creates a modal dialog with title, message, score, and action buttons. |
| `closeOverlay()` | Removes the current overlay from the DOM. |
| `notify(message, icon?)` | Shows a toast notification (top-right, auto-hides after 3s). |
| `destroy()` | Cleanup: stops auto, closes overlay, destroys input/board listeners. |

**State management:**
- `this.data` — Loaded `StoredData` from localStorage
- `this.session` — Live `GameSession` instance
- `this.board` — `BoardRenderer` instance
- `this.armed` — `'none' \| 'swap' \| 'delete'` — which powerup is currently selecting tiles
- `this.pendingNew` — True when a new game was started but the old one hasn't been committed yet (enables Resume)
- `this.autoOn` — Whether the AI engine is actively playing
- `this.autoLoopTarget` — Score target for `__runAutoLoop`; null = infinite play

**Score animation:** Uses an odometer-style reel that rolls up or down depending on whether the score increased or decreased. On mode/size switches, force-rolling respects the navigation direction.

**Board signature:** A compact string fingerprint of the live board used to detect if the board changed while waiting for an async AI decision. If the signature doesn't match when the decision arrives, the stale result is discarded.

### Board Renderer (`src/ui/board.ts`)

Handles all board-related DOM operations and animations:

| Method | Description |
|--------|-------------|
| `setSize(n)` | Configures the board grid dimensions. Creates cell divs, resets tile layer. |
| `layout()` | Computes cell size and gap from container width (ResizeObserver-driven). Positions all tiles. |
| `fullRender(grid, spawn?)` | Complete rebuild: clears all tiles, creates DOM elements for each cell, positions them. |
| `animateMove(transcript)` | Slide animation: updates tile positions via CSS transforms, marks merged tiles for removal, adds spawn tile with pop-in animation. |
| `animateSwap(idA, idB)` | Cross-fade animation: swaps positions of two tiles simultaneously. |
| `enterSelectMode(max, onSelected)` | Enters tile-selection mode for powerups. Highlights clickable tiles. |
| `exitSelectMode()` | Exits selection mode, clears highlights. |

**Animation timing:**
- Slide duration: 120ms (`SLIDE_MS`)
- Merge pop: 220ms flash on the survivor tile
- Spawn pop-in: 320ms fade

**Selection mode:** Used by swap and delete powerups. Clicking tiles adds/removes them from the selection list. When `max` tiles are selected, `onSelected` is called with the results. Tiles can be deselected by clicking again.

### Input (`src/ui/input.ts`)

Wires keyboard and touch input to move callbacks:

| Feature | Details |
|---------|---------|
| Keyboard | Arrow keys + WASD map to directions. `U` triggers undo shortcut, `E` triggers delete shortcut. |
| Touch swipes | Detected on the board element. Threshold: 24px delta. Axis comparison determines direction. |
| Prevent scroll | `touchmove` is prevented on the board to avoid page scrolling during gameplay. |

**Key mapping:**
```
ArrowUp/w/W → 'up'
ArrowDown/s/S → 'down'
ArrowLeft/a/A → 'left'
ArrowRight/d/D → 'right'
```

**Note:** 's' and 'd' are claimed by directional movement, so swap powerup has no single-letter keyboard shortcut (exposed via UI button only).

### Controls / Popover (`src/ui/controls.ts`)

Settings popover (gear menu) with segmented toggles:

| Section | Controls |
|---------|----------|
| Game | Mode toggle (Standard / Classic), Board Size (3x3 to 8x8) |
| Theme | Light / Dark / System |
| Engine | Auto-play toggle, RNG Manipulation toggle, Depth (Auto/Low/Medium/High), Delay (Fast/Normal/Slow), Power-ups toggle |
| Danger | Clear all progress button |

**Segmented control:** A sliding thumb indicator that animates between options. Built by `createSegmented()`.

### Notifications (`src/ui/notify.ts`)

Toast notifications positioned in the top-right corner. Auto-hide after 3 seconds. Supports icon display.

### Theme (`src/ui/theme.ts`)

Manages light/dark/system theme:

| Function | Description |
|----------|-------------|
| `initTheme(pref)` | Applies the theme preference to the document root. For 'system', listens to `prefers-color-scheme` changes. |
| `toggleTheme()` | Cycles between light and dark. Returns the new preference. |
| `setThemePref(pref)` | Sets the theme preference directly. |
| `currentResolved()` | Returns the currently active theme ('light' or 'dark'). |

### Icons (`src/ui/icons.ts`)

SVG icon strings used throughout the UI. Each icon is a small inline SVG path/string.

## Entry Point (`src/main.ts`)

Bootstraps the application:

1. Calls `boot()` which creates an `App` instance, clears any stale DOM (HMR safety), calls `app.start()`, and assigns it to `window.__app`.
2. Exposes `window.__runAutoLoop(score)` for dev-console engine looping.
3. Exposes `window.__dev` with all developer console methods.
4. Sets up HMR disposal to clean up the old instance on hot reload.

## Styling

All CSS lives under `src/styles/`:

| File | Responsibility |
|------|---------------|
| `main.css` | Entry point — imports all other stylesheets |
| `base.css` | Reset, typography, **theme token variables** (light/dark), tile colors |
| `layout.css` | Component layouts: buttons, topbar, board wrapper, overlays, popover, game-over bar, footer |
| `board.css` | Board grid, cell backgrounds, tile positioning, tile faces, animations |

### Theme Tokens

All colors use CSS custom properties defined in `:root` (light) and `:root[data-theme='dark']`:

**Core surfaces:** `--bg`, `--bg-elev`, `--panel`, `--text`, `--text-strong`, `--muted`, `--border`

**Buttons:** `--accent`, `--accent-strong`, `--btn-bg`, `--btn-bg-hover`, `--btn-text`, `--btn-gobg`, `--btn-gobg-hover`

**Board:** `--board-outer`, `--board-inner`, `--board-inner-shadow`, `--cell-bg`

**Scores:** `--score-bg`, `--score-text`, `--best-ring`, `--best-text`

**Dropdown/Popover:** `--dropdown-bg`, `--dropdown-selected`, `--dropdown-selected-text`, `--dropdown-text`, `--divider`

**Modal:** `--modal-bg`, `--modal-text`, `--modal-btn-bg`, `--modal-btn-text`

**Tiles:** `--tile-{2..1048576}-bg/fg` plus `--tile-super-bg/fg`

**Shadows:** `--shadow`, `--shadow-tile`, `--shadow-board`

## Tests

Test suite lives in `tests/` and runs with Vitest in Node environment (jsdom for UI tests):

| Test File | Coverage |
|-----------|----------|
| `tests/core.test.ts` | Move resolution, grid helpers, GameSession powerups, storage round-trip |
| `tests/session.test.ts` | Full GameSession lifecycle: newGame, applyMove, undo chain, swap/delete, restoreSession, delta history, canUndo/Swap/Delete getters |
| `tests/grid-edge.test.ts` | emptyCells, isFull, maxTile, hasTile, gridFromValues/ToValues, setNextId/peekNextId, spawnTile manipulation scoring |
| `tests/rng.test.ts` | SecureRng determinism, block boundary crossing, float range, key derivation, stream resumption |
| `tests/engine.test.ts` | PlaceholderEngine legal moves, WasmEngine fallback, decodeAction, engine interface contract |
| `tests/storage.test.ts` | load with corrupted JSON, version mismatch, partial settings, multi-game round-trip, clearGames |
| `tests/move-deep.test.ts` | Transcript correctness (mergedInto/newValue), all 4 directions, cascading merges, cloneGrid independence, gridsEqual, canMove edge cases |
| `tests/ui/board.test.ts` | BoardRenderer constructor, setSize, fullRender, animateMove, animateSwap, select mode, destroy |
| `tests/ui/input.test.ts` | Keyboard mapping (arrows/WASD), touch swipe detection, shortcut keys, destroy cleanup |
| `tests/ui/theme.test.ts` | initTheme, setThemePref, toggleTheme, currentResolved, currentThemePref |
| `tests/ui/notify.test.ts` | NotificationCenter card creation, icon/close button/progress bar, dismiss behavior |
| `tests/predict.test.ts` | Rust predict_spawn vs JS spawnTile cross-language parity |
| `tests/validate.test.ts` | tileScoreRange, scoreWindow, validatePosition, clampScoreToWindow, planBypass, keepBetter priority |

Run with `npm test` or `npm run test:watch`. 281+ tests covering core logic, UI components, RNG, storage, and Rust-WASM parity.

## Build Pipeline

Three-step build sequence (`npm run build`):

1. **`npm run build:wasm`** — Compiles `engine/` (Rust) to WebAssembly via `wasm-pack`, targeting the web browser. Output lands in `engine/pkg/`.
2. **`tsc --noEmit`** — TypeScript type-checking with zero emit. Catches errors before bundling.
3. **`vite build`** — Bundles everything (HTML, CSS, JS, WASM, worker) into `dist/` for production.

Output artifacts:
- `dist/index.html` — Entry page
- `dist/assets/index-*.js` — Main bundle (~54 KB gzipped ~16 KB)
- `dist/assets/index-*.css` — Stylesheet (~20 KB gzipped ~5 KB)
- `dist/assets/engine2048_bg-*.wasm` — WASM engine binary (~60 KB)
- `dist/assets/engine.worker-*.js` — Web Worker script (~3 KB)

Development: `npm run dev` starts Vite dev server with HMR at `http://localhost:5173`.

## Developer Console

### Access

All developer console methods are exposed on `window.__dev` and also callable directly via `window.__app` method names. Open your browser DevTools console (F12) and type:

```javascript
// Via the __dev namespace (recommended — all built-in methods support this form)
__dev.undo()
__dev.delete(0, 0)
__dev.win()
__dev.getStats()

// Via direct App method names
window.__app.__undo()
window.__app.__delete(2, 3)
window.__app.__setBoard([[2,2],[2,2]])

// Or just the bare method name on window (only for methods that are proxied on __dev)
__undo()
__win()
__help()
```

**Calling conventions:** Every method supports three forms:

| Form | Example | Notes |
|------|---------|-------|
| `__dev.methodName(...)` | `__dev.win()` | Recommended. Works for all built-in methods listed below, including new ones (`getStats`, `setBoard`, etc.) |
| `window.__app.__methodName(...)` | `window.__app.__undo(5)` | Direct access to the `App` class methods. Works for everything, including methods not proxied on `__dev` |
| `__methodName(...)` | `__undo()` | Bare global — only works for methods explicitly proxied on `window.__dev` |

Additionally, `__dev.callNative(name, ...args)` enables programmatic invocation of any `App` method by string name:

```javascript
__dev.callNative('__undo', 3)       // Undo 3 steps
__dev.callNative('__fillPowerups')  // Max out powerups
__dev.callNative('__add', 2048)     // Place 2048 at first empty cell
```

Every method logs its result to the console with a `[dev]` prefix. Methods that fail silently log a warning. All mutations persist to localStorage automatically.

### Console API Reference

All built-in dev methods support the `__dev.methodName()` form. Examples below show the bare form for brevity, but `__dev.undo()`, `__dev.win()`, etc. are equivalent and recommended. For methods not proxied on `__dev` (e.g. `__setBoard`), use `__dev.setBoard(...)` or `window.__app.__setBoard(...)`.

```javascript
__dev.undo()
```

#### `__undo(steps?)` — Undo moves without powerup cost

Reverts game state without consuming a powerup charge.

| Argument | Behavior |
|----------|----------|
| `__undo()` or `__undo(1)` | Revert the last move (same as built-in undo, no charge deducted) |
| `__undo(n)` where n > 1 | Revert the last `n` moves in one call |
| `__undo(-n)` where n < 0 | Enable the auto-play engine for exactly `n` moves using current engine settings (depth, speed, power-ups). The engine runs automatically and stops after `n` moves or game over |

**Examples:**
```javascript
__dev.undo()               // Undo 1 step
__dev.undo(5)              // Undo last 5 steps at once
__dev.undo(-10)            // Let AI play 10 moves, then stop
```

#### `__delete(row, col)` — Remove a tile

Deletes the tile at the given grid position. No powerup cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `row` | number | Row index (0-based) |
| `col` | number | Column index (0-based) |

**Example:**
```javascript
__dev.delete(2, 3)  // Remove tile at row 2, column 3
```

#### `__deleteValue(char)` — Remove a tile

Deletes the tile at the given grid number. No powerup cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `char` | number | any existing numbers |

**Example:**
```javascript
__dev.deleteValue(2)  // Remove tile of value 2
```

#### `__swap(r1, c1, r2, c2)` — Swap two tiles or move to empty cell

Swaps two tiles, or moves a tile to an empty cell. At least one cell must be occupied. Does NOT consume a powerup charge and works in any mode.

| Parameter | Type | Description |
|-----------|------|-------------|
| `r1` | number | Row of first cell |
| `c1` | number | Column of first cell |
| `r2` | number | Row of second cell |
| `c2` | number | Column of second cell |

**Examples:**
```javascript
__dev.swap(0, 0, 3, 3)   // Swap two tiles
__dev.swap(0, 0, 1, 2)   // Move tile from (0,0) to empty cell (1,2)
```

#### `__addTiles(n?)` — Spawn free tiles

Places `n` tiles of value 2 at random empty cells. Uses Fisher-Yates partial shuffle for uniform random selection. No powerup cost.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `n` | number | 1 | Number of tiles to add |

**Example:**
```javascript
__dev.addTiles()       // Add 1 tile
__dev.addTiles(5)      // Add 5 tiles
```

#### `__add` — Place a tile on the board

Four overloaded signatures:

| Signature | Meaning |
|-----------|---------|
| `__add(val)` | Place `val` at the first empty cell (smallest row, then column). |
| `__add(x, y)` | Place a **2** at grid position `(x, y)`. |
| `__add(val, x, y)` | Place `val` at `(x, y)`. Fails with a warning if the cell is already occupied. |
| `__add(val, x, y, 1)` | Same as above, but the `1` enables **replace mode** — overwrites any existing tile. Replace mode only applies to this 4-argument form. |

**Examples:**
```javascript
__dev.add(2048)             // Place 2048 at first empty cell
__dev.add(0, 3)             // Place a 2 at row 0, col 3
__dev.add(256, 1, 2)        // Place 256 at (1, 2); error if occupied
__dev.add(256, 1, 2, 1)     // Place 256 at (1, 2), replacing whatever's there
```

#### `__clear()` — Empty the board

Removes every tile from the board.

**Example:**
```javascript
__dev.clear()
```

#### `__fill(val?)` — Fill board with tiles

Places a tile of value `val` in every cell of the board. Overwrites existing tiles.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `val` | number | 2 | Tile value to place everywhere |

**Example:**
```javascript
__dev.fill()           // Fill with 2s
__dev.fill(64)         // Fill with 64s
```

#### `__score(n)` — Set score

Sets the current score to `n`. Also updates `best` if `n` exceeds it.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | number | Target score |

**Example:**
```javascript
__dev.score(5000)
```

#### `__max(row, col, val?)` — Place a tile

Places a single tile of value `val` at the specified position. Overwrites any existing tile.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `row` | number | — | Row index |
| `col` | number | — | Column index |
| `val` | number | 2048 | Tile value |

**Example:**
```javascript
__dev.max(0, 0)          // Place 2048 at top-left
__dev.max(3, 3, 4096)    // Place 4096 at bottom-right
```

#### `__moves(n)` — Set move count

Sets the internal move counter to `n`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | number | Target move count |

**Example:**
```javascript
__dev.moves(0)
```

#### `__cheat(dir)` — Move without spawning

Applies a directional move exactly as normal play would, but **does not spawn a new tile** afterward. Useful for experimenting with board states without advancing the RNG stream.

| Parameter | Type | Description |
|-----------|------|-------------|
| `dir` | `'up' \| 'down' \| 'left' \| 'right'` | Direction to slide |

**Example:**
```javascript
__dev.cheat('right')
__dev.cheat('up')
```

#### `__fillPowerups()` — Max out powerups

Sets all powerup charges to 99.

**Example:**
```javascript
__dev.fillPowerups()
```

#### `__win()` — Instantly win

Places a 2048 tile at a random empty cell and sets the `won` flag. Triggers the win banner on the next render.

**Example:**
```javascript
__dev.win()  // Instantly win: places a 2048 tile and sets won flag
```

#### `__noDelay()` — Start engine with zero delay

Starts the auto-play engine with absolutely no delay between moves, enabling maximum speed. Sets `autoSpeed` to `0` and enables auto-play if not already running.

**Example:**
```javascript
__dev.noDelay()  // Engine plays as fast as possible
```

#### `__nextNumber()` — Predict next spawn value

Peeks into the ChaCha20 CSPRNG stream to predict the next tile value (2 or 4) without advancing game state. Logs the raw RNG value and probability to the console.

**Returns:** `number` — 2 or 4, or -1 if no RNG seed is available.

**Example:**
```javascript
__dev.nextNumber()  // → 4 (rng=0.0823, p(4)=0.1)
```

#### `__nextLocation()` — Predict next spawn position

Peeks into the ChaCha20 CSPRNG stream to predict which empty cell will receive the next tile, without advancing game state.

**Returns:** `{ row: number, col: number }` — the predicted position, or `{ row: -1, col: -1 }` if the board is full or no RNG seed is available.

**Example:**
```javascript
__dev.nextLocation()  // → { row: 2, col: 1 } (rng=0.3412, empties=6)
```

#### `__validate()` — Check position validity

Checks whether the displayed score is consistent with the tiles on the board, using the per-tile score window:

- A tile of value `V` (with `n = log2 V`) cost between `(n-2)*V` (all 4-spawns, fewest merges) and `(n-1)*V` (all 2-spawns, most merges) points to build. Values of 2 and 4 clamp to a 0 minimum.
- The board's total window is the sum of every tile's `[min, max]`. The score is valid iff `totalMin <= score <= totalMax`.

Logs the window and a `VALID` / `BELOW MIN by X` / `ABOVE MAX by X` verdict. Outside the window, the board has been altered.

**Returns:** `{ valid, score, min, max, belowBy, aboveBy, tileCount } | undefined`.

**Example:**
```javascript
__dev.validate()  // -> { valid: false, score: 0, min: 425984, max: 458752, ... }  (hacked 32768 on a 0-score board)
```

#### `__updatePosition()` — Clamp score into the valid window

Adjusts the score so it matches a hacked board: a score below the minimum is raised to it, a score above the maximum is lowered to it, and an in-window score is left untouched. This is the smallest change that makes the position valid. Mutates and persists state.

**Returns:** `{ from, to, min, max, changed } | undefined`.

**Example:**
```javascript
__dev.updatePosition()  // -> { from: 0, to: 425984, min: 425984, max: 458752, changed: true }
```

#### `__bypassValidation()` — Remove minimal tiles to make the position valid

Removes the fewest tiles (then the least total value) so the remaining board is valid for the current score. Fixes hacked-in tiles the score cannot account for — e.g. a 32768 dropped onto a near-zero board has that single "impossible" tile removed while 2s and 4s are always kept. A score above the maximum cannot be fixed by removal (removing tiles only lowers the window) and is reported infeasible. Mutates and persists state.

The optional `valueFirst` boolean flips the priority from (count, then value) to (value, then count). For 2048's power-of-two tiles the two orderings always pick the same tiles, so this is a no-op in practice; it is provided for flexibility.

For boards with up to 20 score-bearing tiles (value >= 8) the solver is exact; larger boards use a greedy heuristic, flagged in the log.

**Returns:** `{ feasible, removed, totalValue, heuristic, valid } | undefined`.

**Example:**
```javascript
__dev.bypassValidation()      // count-first (default): fewest tiles removed
__dev.bypassValidation(true)  // value-first: least total value removed
```

#### `__getStats()` — Full board/session/UI diagnostics

Returns a comprehensive object with every relevant piece of information about the current game state, position analysis, RNG stream, engine config, and UI.

**Returns:** `{ board, scores, position, rng, engine, powerups, history, ui, validation, timestamp }`

| Field | Description |
|-------|-------------|
| `board.type` | Board description (e.g. `"4x4 standard"`) |
| `board.size` | Grid dimension |
| `board.mode` | `'standard'` or `'classic'` |
| `board.fullness` | Occupancy ratio (0–1) |
| `board.emptyCells` | Number of empty cells |
| `board.tileCount` | Total occupied cells |
| `board.maxTile` / `minTile` / `avgTile` | Tile value statistics |
| `board.uniqueValues` | Sorted list of distinct tile values |
| `board.valueDistribution` | Count per value |
| `board.bitboard` | 2D array of bit flags (1 << index if occupied) |
| `board.tileIds` | 2D array of tile ID values |
| `board.log2Grid` | 2D array of log2(tile values) |
| `board.smoothness` | Sum of log2 differences between adjacent tiles (lower = better) |
| `board.monotonicity` | Count of decreasing adjacent pairs (higher = better) |
| `board.openLines` | Edge-adjacent empty cells |
| `board.mergeablePairs` | Adjacent equal-value pairs |
| `scores.current` / `best` / `delta` | Score tracking |
| `scores.windowMin` / `windowMax` / `valid` | Validation window |
| `position.over` / `won` / `wonAcknowledged` | Game state flags |
| `position.moveCount` | Total moves played |
| `position.hasLegalMoves` | Whether any move is possible |
| `rng.seed` | ChaCha20 seed (8 uint32) or null |
| `rng.calls` | Stream position |
| `rng.nextPredictedValue` | Next spawn value (2 or 4), or -1 |
| `rng.nextPredictedLocation` | Predicted spawn position |
| `engine.name` / `autoOn` / `autoSpeed` / `autoDepth` | Engine config |
| `engine.autoPowerups` / `manipulate` | Power-up & RNG manipulation toggles |
| `powerups` | Current charge counts `{ undo, swap, delete }` |
| `history.length` / `maxHistory` / `canUndo` | Undo stack info |
| `ui.armed` | Current powerup selection mode |
| `ui.pendingNew` | Whether a new game is pending |
| `ui.hasOverlay` / `isSelecting` | Modal/selection state |
| `ui.theme` | Resolved theme (`'light'` or `'dark'`) |
| `validation` | Full `ValidationResult` from `validatePosition()` |
| `timestamp` | `Date.now()` at call time |

**Example:**
```javascript
const stats = __dev.getStats();
console.log(stats.board.tileCount, 'tiles on', stats.board.size + 'x' + stats.board.size);
```

#### `__setBoard(values?)` — Set the board to an arbitrary position

Overwrites the current board with tiles from a values matrix or flat array. Works with any size and any tile values. The board will spawn in the exact position provided.

| Signature | Meaning |
|-----------|---------|
| `__setBoard(values)` | Set grid from `number[][]`. Uses existing size/mode. Fails if dimensions don't match. |
| `__setBoard(size, values)` | Set grid with explicit size. Resizes the board to `size x size`. |
| `__setBoard(flatArray)` | Set from flat `number[]`, inferring size from `Math.sqrt(length)`. |
| `__setBoard(flatArray, size)` | Set from flat array with explicit size. |

**Examples:**
```javascript
__dev.setBoard([[2, 0, 0, 2], [0, 4, 4, 0], [0, 8, 0, 8], [16, 16, 0, 0]])  // 4x4 from matrix
__dev.setBoard(5, [[4, 0, 0, 0, 0], [0, 4, 0, 0, 0], [0, 0, 8, 0, 0], [0, 0, 0, 8, 0], [0, 0, 0, 0, 16]])  // 5x5
__dev.setBoard([2, 2, 4, 4, 8, 0, 0, 0, 0])  // flat 3x3
__dev.setBoard([2, 2, 4, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)  // flat 4x4
```

#### `__evalPosition()` — Heuristic position evaluation

Analyzes the current board position and outputs a comprehensive evaluation including heuristic scores, tile statistics, and predictions.

**Returns:** `{ calcTimeMs, currentScore, bestScore, board, heuristics }`

| Field | Description |
|-------|-------------|
| `calcTimeMs` | Evaluation time in milliseconds |
| `currentScore` / `bestScore` | Current and best scores |
| `board.size` / `mode` / `tileCount` / `emptyCells` | Board overview |
| `board.maxTile` / `sumTiles` | Tile value stats |
| `board.uniqueValues` / `valueDistribution` | Value breakdown |
| `heuristics.emptyBonus` | Empty cell score (reward for space) |
| `heuristics.smoothness` | Adjacency smoothness (lower = better) |
| `heuristics.monotonicity` | Ordered layout score (higher = better) |
| `heuristics.maxCorner` | Whether max tile is in a corner |
| `heuristics.singleCorner` | Whether any corner holds the max tile |
| `heuristics.mergeablePairs` | Count of adjacent equal-value pairs |
| `heuristics.openLines` | Edge-adjacent empty cells |
| `heuristics.compositeScore` | Weighted combination of all heuristics |

The console logs additional details including estimated highest achievable tile and score window.

**Example:**
```javascript
__dev.evalPosition()
// → { calcTimeMs: 0.042, currentScore: 15360, bestScore: 15360, ... }
```

#### `__afkHighScore()` — Run AFK until best score exceeds 3x

Starts the AI engine at maximum speed (zero delay) using current settings (depth, RNG manipulation toggle). Plays games automatically, restarting when stuck, until the best score has been matched or exceeded 3 consecutive times.

This is fire-and-forget — it runs asynchronously and reports progress via console logs and toast notifications.

**Behavior:**
1. Sets `autoSpeed` to `0` (no delay between moves)
2. Uses current `autoDepth` and `rngManip` settings
3. Starts a new game if needed
4. Loops: play → check best → restart → repeat
5. Stops when the best score has been maintained/exceeded for 3 consecutive games
6. Restores original auto-speed setting

**Example:**
```javascript
__dev.afkHighScore()  // → "[dev] __afkHighScore → starting AFK run"
                      //    "[dev] __afkHighScore → new best: 245760 (game #1)"
                      //    "[dev] __afkHighScore → DONE  Games played: 12  Final best: 245760"
```

#### `__refreshScore()` — Ensure score matches current position

Validates the displayed score against the tile composition window and clamps it into the valid range if necessary. Updates UI and persists state. Also fixes NaN best scores if present.

**Returns:** `{ from, to, min, max, changed, tileCount, scoreFromMerges }`

| Field | Description |
|-------|-------------|
| `from` | Original score before adjustment |
| `to` | Adjusted score (same as `from` if already valid) |
| `min` / `max` | Valid score window |
| `changed` | Whether the score was adjusted |
| `tileCount` | Number of tiles on the board |

**Example:**
```javascript
__dev.refreshScore()  // → { from: 0, to: 425984, min: 425984, max: 458752, changed: true, ... }
```

#### `__dev.log(fn, intervalMs?)` — Periodic logger

Executes a function or expression repeatedly at a set time interval and logs the returned values directly to the console. Returns a numeric ID that can be used to stop this specific logger.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `fn` | `Function` | — | **(Required)** The function or expression to execute on every tick. Receives no arguments. |
| `intervalMs` | `number` | `1000` | Time between executions in milliseconds |

**Returns:** `number` — A unique logger ID for later cancellation.

**Examples:**
```javascript
// Log current timestamp every second
__dev.log(() => performance.now())

// Track score changes every 500ms
__dev.log(() => window.__app?.session.state.score, 500)

// Track board fullness
__dev.log(() => {
  const stats = __dev.getStats();
  return `${stats.board.tileCount}/${stats.board.size * stats.board.size} tiles`;
}, 2000)

// Stop a specific logger by ID
const id = __dev.log(() => performance.now(), 1000);
// ... later ...
__dev.stopLog(id)
```

Errors inside the logged function are caught and printed to the console without crashing the loop.

#### `__dev.stopLog(id?)` — Stop periodic logger(s)

Clears the active interval timer(s) to halt the logging process. Pass a specific logger ID to kill one loop, or call it with no arguments to clear all active loggers.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `id` | `number` | `undefined` | The specific log instance ID to stop. If omitted, stops **all** active loggers. |

**Examples:**
```javascript
// Stop a specific background logger
__dev.stopLog(loggerId)

// Terminate all active logging streams
__dev.stopLog()
```

#### `__dev.callNative(methodName, ...args)` — Call any built-in dev method by name

Invokes any built-in dev method programmatically using its string name, with arbitrary arguments. Enables fully dynamic access to all cheats — replicate built-in functionality, build custom tooling, or chain operations from bookmarklets and scripts.

| Parameter | Type | Description |
|---|---|---|
| `methodName` | `string` | **(Required)** The name of the dev method to call (e.g. `'__undo'`, `'__fillPowerups'`, `'__win'`) |
| `...args` | `unknown[]` | Arguments to pass to the method |

**Returns:** The method's return value, or `undefined` if the method doesn't exist or throws.

**Supported methods:** All methods listed in this document (`__undo`, `__delete`, `__swap`, `__addTiles`, `__add`, `__clear`, `__fill`, `__score`, `__max`, `__moves`, `__cheat`, `__fillPowerups`, `__win`, `__noDelay`, `__nextNumber`, `__nextLocation`, `__validate`, `__updatePosition`, `__bypassValidation`, `__getStats`, `__setBoard`, `__evalPosition`, `__afkHighScore`, `__updateScore`).

**Examples:**
```javascript
// Replicate built-in cheat features
__dev.callNative('__win')                          // Same as __win()
__dev.callNative('__fillPowerups')                 // Same as __fillPowerups()
__dev.callNative('__add', 2048)                    // Same as __add(2048)
__dev.callNative('__cheat', 'right')               // Same as __cheat('right')
__dev.callNative('__undo', 5)                      // Undo 5 steps
__dev.callNative('__deleteValue', 4)               // Remove all 4-tiles

// Chain multiple operations
__dev.callNative('__clear'); __dev.callNative('__fill', 128); __dev.callNative('__score', 9999)

// Use with __dev.log for automated monitoring
__dev.log(() => __dev.callNative('__getStats').board.maxTile, 3000)

// Access methods not on __dev proxy (e.g. __setBoard via App class)
window.__app.__setBoard([[2,2],[2,2]])             // Direct App access
```

#### `__fixBest()` — Recover from NaN best score

If the best score has been corrupted to NaN (e.g., from passing a non-numeric value to `__score`), this method recovers it by setting best to the current score.

**Example:**
```javascript
__dev.fixBest()  // → "[dev] __fixBest → recovered best from NaN to 15360"
```

#### `__refreshPlayAgainStatus()` — Toggle Play Again bar visibility

Explicitly refreshes the Play Again bar below the board. Shows the bar only when the board is dead (no legal moves remain).

**Example:**
```javascript
__dev.refreshPlayAgainStatus()  // → "[dev] __refreshPlayAgainStatus → visible (board is dead)"
```

### Internal Methods (App class)

The following methods are public members of the `App` class but are primarily intended for internal use. They are also accessible via `window.__app.methodName(...)`:

| Method | Description |
|--------|-------------|
| `start()` | Initialize the app: theme, DOM, load game, start auto if configured |
| `destroy()` | Tear down all listeners and timers (used by HMR) |
| `runAutoLoop(targetScore)` | Start AI engine looping until score reaches target. Exposed on `window.__runAutoLoop` |

### Global Window API

| Global | Type | Description |
|--------|------|-------------|
| `window.__app` | `App \| undefined` | The live `App` instance. Access any public method: `__app.__undo()`, `__app.__delete(0,0)`, etc. |
| `window.__runAutoLoop(score)` | `(score: number) => void` | Run the AI engine until the score reaches `score` |
| `window.__dev` | `{ undo, delete, deleteValue, swap, addTiles, add, clear, fill, score, max, moves, cheat, fillPowerups, win, noDelay, nextNumber, nextLocation, validate, updatePosition, bypassValidation, getStats, setBoard, evalPosition, afkHighScore, refreshScore, fixBest, refreshPlayAgainStatus, log, stopLog, callNative, help }` | Namespaced developer console object |

## Auto-Play Engine

The auto-play feature runs a Rust expectimax AI (compiled to WASM) on a dedicated Web Worker to avoid blocking the main thread.

**Flow:**
1. User enables auto-play via settings popover toggle
2. `App.startAuto()` sets `autoOn = true`, persists setting, calls `autoTick()`
3. `autoTick()` schedules a `setTimeout` at `autoSpeed` ms interval
4. On each tick:
   - Checks if user is interacting (selecting tiles, showing overlays) — pauses if so
   - Takes a `boardSignature()` snapshot of the current board state
   - Calls `WasmEngine.chooseAction(ctx)` asynchronously (runs in worker)
   - On return: compares signature to detect board changes. If changed, discards the stale result and reschedules
   - Applies the action via `applyAutoAction()`:
     - `move`: delegates to `doMove()` (normal move with animation + spawn)
     - `delete`: spends a delete charge, removes tile, full re-render
     - `swap`: spends a swap charge, animates tile exchange
     - `stop`: forces game-over state
   - If `autoLoopTarget` is set and score hasn't reached it, restarts a new game and continues
5. When auto-play is toggled off, `stopAuto()` clears the timer and resets state

**AI decision context (`EngineContext`):**
```typescript
{
  grid: Grid;
  size: number;
  score: number;
  powerups: Powerups;
  depth: number;           // 0 = adaptive default
  usePowerups: boolean;    // AI may spend swap/delete charges
  manipulate?: boolean;    // Predictive search using spawn stream
  rngSeed?: number[];      // 8-uint32 ChaCha20 seed
  rngCalls?: number;       // Stream position
}
```

**Stale decision protection:** The `boardSignature()` computes a compact string fingerprint of board state + score + powerup charges. If the board changed while the AI was thinking (e.g., user made a move), the decision is computed for a stale board and is discarded.

## RNG & Spawn System

### Tile Spawning

After every valid move, exactly one tile is spawned at a random empty cell:

1. `emptyCells(grid)` collects all null positions
2. If the board is full, `spawnTile` returns null (contributes to game-over detection)
3. A position is selected: `empties[Math.floor(rng() * empties.length)]`
4. A value is determined: `rng() < SPAWN_PROB_4` (10%) → 4, else → 2
5. A unique `id` is assigned from the monotonic counter (`freshId()`)
6. The cell is populated: `grid[row][col] = { id, value }`

### RNG Manipulation

When the "RNG Manipulation" setting is enabled:

1. Instead of taking the next draw from the ChaCha20 stream verbatim, the system draws `MANIPULATION_CANDIDATES` (5) genuine candidate spawns from that same stream
2. Each candidate is scored using `scoreSpawnCandidate()`: `emptyCells * 4 + smoothness`
   - `smoothness` penalizes large value differences between adjacent tiles
3. The candidate with the highest score is kept
4. Nothing about the randomness source changes — every candidate is a real, unpredictable draw from the CSPRNG

This biases outcomes in the player's favor without inventing spawns the stream didn't produce.

### Deterministic Prediction

Because the ChaCha20 stream is fully determined by `(seed, calls)`, the next spawn can be predicted by:

1. Creating a `SecureRng` clone with the current game's `rngSeed` and `rngCalls`
2. Advancing past all past spawns: `totalSpawns = 2 (initial) + moveCount`
3. Reading the next `rng()` value for the position selection
4. Reading the next `rng()` value for the value selection (2 vs 4)

This is what `__nextNumber()` and `__nextLocation()` do internally.

## Persistence Model

### Storage Key

All data is stored in localStorage under the key `"2048:v1"` (version 1).

### Data Shape

```json
{
  "version": 1,
  "settings": {
    "theme": "system",
    "lastSize": 4,
    "lastMode": "standard",
    "autoOn": false,
    "autoSpeed": 180,
    "autoDepth": 0,
    "autoPowerups": true,
    "rngManip": false
  },
  "games": {
    "4:standard": { /* GameState */ },
    "4:classic": { /* GameState */ },
    "5:standard": { /* GameState */ }
  },
  "nextId": 42
}
```

Each game is keyed by `"${size}:${mode}"`. The `nextId` field ensures tile IDs never collide across games.

### Save Triggers

Persistence is triggered after:
- Every move (`applyMove` → `saveCurrent`)
- Every powerup use (`undo`, `swap`, `deleteTile`)
- New game creation
- Acknowledging a win
- Settings changes (theme, auto-play, size, mode)
- Developer console operations (all dev methods call `saveCurrent`)

### Load Triggers

Data is loaded on:
- Initial page load (`load()`)
- Switching between size/mode combinations (other games are restored from storage)
- Resuming a previous game

### Version Migration

If the stored version doesn't match `VERSION` (1), or parsing fails, `load()` returns fresh data — effectively a soft reset.

## Backtrack (Unlimited Undo)

The **Backtrack** toggle in the settings popover enables delta-encoded unlimited undo history. When enabled, every move is recorded as a compressed delta (only changed cells) alongside an anchor snapshot, allowing `__undo(n)` to step back far beyond the 16-snapshot powerup undo limit — up to 10000 steps per size/mode combo.

**How it works:**
- Each move stores: one full `GameSnapshot` (anchor) + a list of cell changes (deltas)
- Delta encoding means each step uses ~10% of the space of a full-grid clone
- The backtrack cache is stored in `GameState.deltaHistory` and persisted with the game
- When you start a new game, the old game's data stays in storage under its `size:mode` key
- Resume becomes unavailable after the first move on a new game — at that point the previous game's backtrack cache is no longer accessible unless you switch back to that size/mode

**Disabling backtrack:** When you toggle backtrack off, you're prompted to either keep the stored data or clear it. "Keep & Disable" preserves the delta history in storage; "Clear & Disable" removes it. If you later want to use backtrack again, re-enable the toggle and a fresh delta history starts building.

**Persistence:** The `backtrackEnabled` setting is saved in localStorage and restored across page reloads and game switches.

## CSS Custom Properties

### Button Styles

| Class | Background | Hover | Description |
|-------|-----------|-------|-------------|
| `.btn--primary` | `var(--btn-bg)` | `var(--btn-bg-hover)` | Primary action buttons (New Game) |
| `.btn--ghost` | `transparent` | `var(--panel)` | Secondary/tertiary actions |
| `.game-over-bar__action` | `linear-gradient(var(--btn-gobg), darken(var(--btn-gobg)))` | `linear-gradient(var(--btn-gobg-hover), darken(...))` | Play Again button below board |
| `.icon-btn` | Transparent | Subtle background | Topbar icon buttons |

### Game-Over Bar

The game-over indicator appears below the board when no moves remain. It slides in with a `freeze-in` animation (fade + slight upward motion). The "Play Again" button within uses the same gradient styling as the topbar primary button but with theme-adapted colors.

### Tile Colors

Each tile value has a dedicated `--tile-{value}-bg` and `--tile-{value}-fg` CSS variable. Values above 1048576 fall back to `--tile-super-bg` / `--tile-super-fg`. Light and dark themes define distinct palettes — light uses warm beige/brown tones while dark shifts to deeper, more saturated colors for higher values.
