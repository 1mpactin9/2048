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
| `MAX_HISTORY` | `16` | Bounded undo history count |
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

**History:** Each `applyMove`, `swap`, and `deleteTile` pushes a `GameSnapshot` onto `history` before mutating state. `undo` pops it. History is capped at `MAX_HISTORY` (16) entries. Undo itself is not recorded in history (cannot be "undone").

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

Test suite lives in `tests/` and runs with Vitest in Node environment:

| Test File | Coverage |
|-----------|----------|
| `tests/core.test.ts` | Grid operations, spawn logic, move resolution, canMove, hasMoves, maxTile, hasTile, grid helpers |
| `tests/predict.test.ts` | ChaCha20 RNG predictability, spawn prediction accuracy, manipulation mode behavior |

Run with `npm test` or `npm run test:watch`.

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
// Via the __dev namespace (recommended)
__dev.undo()
__dev.delete(0, 0)

// Via direct App method names
window.__app.__undo()
window.__app.__delete(2, 3)

// Or just the bare method name on window
__undo()
__help()
```

Every method logs its result to the console with a `[dev]` prefix. Methods that fail silently log a warning. All mutations persist to localStorage automatically.

### Console API Reference

try adding dev. at the start if it doesn't work

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
__undo()               // Undo 1 step
__undo(5)              // Undo last 5 steps at once
__undo(-10)            // Let AI play 10 moves, then stop
```

#### `__delete(row, col)` — Remove a tile

Deletes the tile at the given grid position. No powerup cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `row` | number | Row index (0-based) |
| `col` | number | Column index (0-based) |

**Example:**
```javascript
__delete(2, 3)  // Remove tile at row 2, column 3
```

#### `__deleteValue(char)` — Remove a tile

Deletes the tile at the given grid number. No powerup cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `char` | number | any existing numbers |

**Example:**
```javascript
__deleteValue(2)  // Remove tile of value 2
```

#### `__swap(r1, c1, r2, c2)` — Swap two tiles

Swaps the positions of two tiles. Both must be occupied. No powerup cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `r1` | number | Row of first tile |
| `c1` | number | Column of first tile |
| `r2` | number | Row of second tile |
| `c2` | number | Column of second tile |

**Example:**
```javascript
__swap(0, 0, 3, 3)  // Swap tile at (0,0) with tile at (3,3)
```

#### `__addTiles(n?)` — Spawn free tiles

Places `n` tiles of value 2 at random empty cells. Uses Fisher-Yates partial shuffle for uniform random selection. No powerup cost.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `n` | number | 1 | Number of tiles to add |

**Example:**
```javascript
__addTiles()       // Add 1 tile
__addTiles(5)      // Add 5 tiles
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
__add(2048)             // Place 2048 at first empty cell
__add(0, 3)             // Place a 2 at row 0, col 3
__add(256, 1, 2)        // Place 256 at (1, 2); error if occupied
__add(256, 1, 2, 1)     // Place 256 at (1, 2), replacing whatever's there
```

#### `__clear()` — Empty the board

Removes every tile from the board.

**Example:**
```javascript
__clear()
```

#### `__fill(val?)` — Fill board with tiles

Places a tile of value `val` in every cell of the board. Overwrites existing tiles.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `val` | number | 2 | Tile value to place everywhere |

**Example:**
```javascript
__fill()           // Fill with 2s
__fill(64)         // Fill with 64s
```

#### `__score(n)` — Set score

Sets the current score to `n`. Also updates `best` if `n` exceeds it.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | number | Target score |

**Example:**
```javascript
__score(5000)
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
__max(0, 0)          // Place 2048 at top-left
__max(3, 3, 4096)    // Place 4096 at bottom-right
```

#### `__moves(n)` — Set move count

Sets the internal move counter to `n`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | number | Target move count |

**Example:**
```javascript
__moves(0)
```

#### `__cheat(dir)` — Move without spawning

Applies a directional move exactly as normal play would, but **does not spawn a new tile** afterward. Useful for experimenting with board states without advancing the RNG stream.

| Parameter | Type | Description |
|-----------|------|-------------|
| `dir` | `'up' \| 'down' \| 'left' \| 'right'` | Direction to slide |

**Example:**
```javascript
__cheat('right')
__cheat('up')
```

#### `__fillPowerups()` — Max out powerups

Sets all powerup charges to 99.

**Example:**
```javascript
__fillPowerups()
```

#### `__win()` — Instantly win

Places a 2048 tile at a random empty cell and sets the `won` flag. Triggers the win banner on the next render.

**Example:**
```javascript
__win()
```

#### `__noDelay()` — Start engine with zero delay

Starts the auto-play engine with absolutely no delay between moves, enabling maximum speed. Sets `autoSpeed` to `0` and enables auto-play if not already running.

**Example:**
```javascript
__noDelay()  // Engine plays as fast as possible
```

#### `__nextNumber()` — Predict next spawn value

Peeks into the ChaCha20 CSPRNG stream to predict the next tile value (2 or 4) without advancing game state. Logs the raw RNG value and probability to the console.

**Returns:** `number` — 2 or 4, or -1 if no RNG seed is available.

**Example:**
```javascript
__nextNumber()  // → 4 (rng=0.0823, p(4)=0.1)
```

#### `__nextLocation()` — Predict next spawn position

Peeks into the ChaCha20 CSPRNG stream to predict which empty cell will receive the next tile, without advancing game state.

**Returns:** `{ row: number, col: number }` — the predicted position, or `{ row: -1, col: -1 }` if the board is full or no RNG seed is available.

**Example:**
```javascript
__nextLocation()  // → { row: 2, col: 1 } (rng=0.3412, empties=6)
```

#### `__help()` — Show usage

Prints this documentation to the console using styled output (`%c` format specifiers).

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
| `window.__dev` | `{ undo, delete, swap, addTiles, clear, fill, score, max, moves, cheat, fillPowerups, win, noDelay, nextNumber, nextLocation, help }` | Namespaced developer console object |

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
