import type {
  Direction,
  GameMode,
  GameState,
  GameSnapshot,
  Grid,
  MoveTranscript,
  Powerups,
  CellDelta,
} from './types';
import { DEFAULT_MODE, MAX_HISTORY, POWERUP_QUOTA, WIN_VALUE } from './constants';
import {
  cloneGrid,
  createGrid,
  hasMoves,
  hasTile,
  setNextId,
  spawnTile,
} from './grid';
import { move } from './move';
import { SecureRng, createRngSeed } from './rng';

function emptyPowerups(): Powerups {
  return { undo: 0, swap: 0, delete: 0 };
}

/**
 * Owns one game's mutable state. All state transitions (moves, powerups, undo)
 * go through here so the UI stays a thin view. Pure-ish: takes an optional RNG
 * so tests can drive spawns deterministically.
 */
export class GameSession {
  state: GameState;
  private rng: () => number;
  /**
   * RNG Manipulation toggle (see `spawnTile` in grid.ts). Off by default and
   * only ever applied when explicitly turned on via `setRngManipulation` -
   * it never affects spawns while the setting is off, in manual play or
   * during auto-play alike.
   */
  private manipulate = false;

  constructor(state: GameState, rng?: () => number) {
    this.state = state;
    // Ensure deltaHistory always exists (backward compat with test constructions)
    if (!this.state.deltaHistory) this.state.deltaHistory = [];
    if (rng) {
      // Explicit RNG (used by tests for deterministic spawns). Not persisted;
      // tests don't round-trip state, so no CSPRNG state is needed.
      this.rng = rng;
    } else {
      // Default: ChaCha20 CSPRNG keyed by the per-game seed. Tolerate saves
      // made before the CSPRNG existed by deriving a seed on demand.
      if (!state.rngSeed || state.rngSeed.length !== 8) state.rngSeed = createRngSeed();
      if (typeof state.rngCalls !== 'number') state.rngCalls = 0;
      const gen = new SecureRng(state.rngSeed, state.rngCalls);
      // Mirror the stream position back into state on every draw so a save at
      // any point captures the exact position and the stream resumes cleanly.
      this.rng = () => {
        const v = gen.next();
        this.state.rngCalls = gen.calls;
        return v;
      };
    }
  }

  /** Turn RNG Manipulation on/off for all subsequent spawns in this session. */
  setRngManipulation(on: boolean): void {
    this.manipulate = on;
  }

  static newGame(
    size: number,
    mode: GameMode = DEFAULT_MODE,
    best = 0,
    rng?: () => number,
    manipulate = false,
  ): GameSession {
    const grid = createGrid(size);
    // Fresh game starts from a clean id space.
    setNextId(1);
    const powerups: Powerups = mode === 'standard' ? { ...POWERUP_QUOTA } : emptyPowerups();
    const state: GameState = {
      size,
      mode,
      grid,
      score: 0,
      best,
      powerups,
      won: false,
      wonAcknowledged: false,
      over: false,
      history: [],
      moveCount: 0,
      deltaHistory: [],
      // Seed the CSPRNG for production games. The injected-RNG (test) path
      // leaves these unset; it never persists and ignores them.
      rngSeed: rng ? undefined : createRngSeed(),
      rngCalls: 0,
    };
    const session = new GameSession(state, rng);
    // Bug fix: this used to read `session.manipulate` here, which is always
    // false at construction time - callers only apply the real setting via
    // `setRngManipulation()` *after* `newGame()` returns, which was already
    // too late for these two spawns. Every new game's opening tiles silently
    // ignored the RNG Manipulation toggle. Accepting `manipulate` as a param
    // and applying it before these spawns fixes that: the very first tiles
    // now respect the setting exactly like every spawn after them.
    session.manipulate = manipulate;
    // Spawn the two starting tiles through the session's rng so the CSPRNG
    // stream position advances in lockstep with the board.
    spawnTile(grid, { rng: session.rng, manipulate: session.manipulate });
    spawnTile(grid, { rng: session.rng, manipulate: session.manipulate });
    return session;
  }

  private snapshot(): GameSnapshot {
    return {
      grid: cloneGrid(this.state.grid),
      score: this.state.score,
      powerups: { ...this.state.powerups },
      won: this.state.won,
      wonAcknowledged: this.state.wonAcknowledged,
      over: this.state.over,
      moveCount: this.state.moveCount,
    };
  }

  private pushHistory(): void {
    this.state.history.push(this.snapshot());
    if (this.state.history.length > MAX_HISTORY) this.state.history.shift();
  }

  private recomputeOver(): void {
    this.state.over = !hasMoves(this.state.grid);
  }

  /** Record a delta-encoded history step for unlimited backtrack support. */
  private recordDeltas(prevGrid: Grid): void {
    const currGrid = this.state.grid;
    const size = this.state.size;
    const deltas: CellDelta[] = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const prev = prevGrid[r]?.[c];
        const curr = currGrid[r]?.[c];
        if ((prev === null) !== (curr === null) ||
            (prev && curr && (prev.id !== curr.id || prev.value !== curr.value))) {
          deltas.push({ row: r, col: c, cell: curr ? { id: curr.id, value: curr.value } : null });
        }
      }
    }

    if (deltas.length > 0) {
      const anchor = this.snapshot();
      const dh = this.state.deltaHistory!;
      dh.push({ anchor, deltas });
      // Cap at 2000 entries to prevent localStorage bloat
      const MAX_DELTA_HISTORY = 2000;
      while (dh.length > MAX_DELTA_HISTORY) {
        dh.shift();
      }
    }
  }

  /** Apply a directional move. Returns a transcript to animate, or null if the move was a no-op. */
  applyMove(dir: Direction): MoveTranscript | null {
    if (this.state.over) return null;
    const { grid: next, transcript } = move(this.state.grid, dir);
    if (!transcript.moved) {
      // This direction didn't change anything, but the board may still be
      // stuck - flag game over so the UI can react to a dead board.
      this.recomputeOver();
      return null;
    }

    this.pushHistory();
    this.state.grid = next;
    this.state.score += transcript.gained;
    this.state.best = Math.max(this.state.best, this.state.score);
    // Record delta for unlimited backtrack
    const prevGridForDelta = cloneGrid(next); // snapshot after move but before spawn
    transcript.spawned =
      spawnTile(next, { rng: this.rng, manipulate: this.manipulate }) ?? undefined;
    this.state.moveCount++;
    if (!this.state.won && hasTile(next, WIN_VALUE)) this.state.won = true;
    this.recomputeOver();
    // Record deltas covering both the move and the spawn
    this.recordDeltas(prevGridForDelta);
    return transcript;
  }

  /**
   * Undo the last action (move or powerup), consuming one Undo charge.
   * Undo itself is not recorded in history, so it cannot be "undone".
   */
  undo(): boolean {
    if (this.state.mode !== 'standard') return false;
    if (this.state.powerups.undo <= 0) return false;
    if (this.state.history.length === 0) return false;

    const snap = this.state.history.pop()!;
    this.state.grid = snap.grid;
    this.state.score = snap.score;
    this.state.won = snap.won;
    this.state.wonAcknowledged = snap.wonAcknowledged;
    this.state.moveCount = snap.moveCount;
    // Restore pre-action powerups, then pay one undo charge.
    this.state.powerups = { ...snap.powerups, undo: snap.powerups.undo - 1 };
    this.recomputeOver();
    return true;
  }

  /** Swap two occupied tiles. Coordinates must differ and both be non-empty. */
  swap(r1: number, c1: number, r2: number, c2: number): boolean {
    if (this.state.mode !== 'standard') return false;
    if (this.state.powerups.swap <= 0) return false;
    if (r1 === r2 && c1 === c2) return false;
    const a = this.state.grid[r1]?.[c1];
    const b = this.state.grid[r2]?.[c2];
    if (!a || !b) return false;

    this.pushHistory();
    const prevGridForDelta = cloneGrid(this.state.grid);
    this.state.grid[r1][c1] = b;
    this.state.grid[r2][c2] = a;
    this.state.powerups = { ...this.state.powerups, swap: this.state.powerups.swap - 1 };
    this.recomputeOver();
    this.recordDeltas(prevGridForDelta);
    return true;
  }

  /** Remove a single tile from the board. */
  deleteTile(row: number, col: number): boolean {
    if (this.state.mode !== 'standard') return false;
    if (this.state.powerups.delete <= 0) return false;
    if (!this.state.grid[row]?.[col]) return false;

    this.pushHistory();
    const prevGridForDelta = cloneGrid(this.state.grid);
    this.state.grid[row][col] = null;
    this.state.powerups = { ...this.state.powerups, delete: this.state.powerups.delete - 1 };
    this.recomputeOver();
    this.recordDeltas(prevGridForDelta);
    return true;
  }

  acknowledgeWin(): void {
    this.state.wonAcknowledged = true;
  }

  get canUndo(): boolean {
    return this.state.mode === 'standard' && this.state.powerups.undo > 0 && this.state.history.length > 0;
  }

  get canSwap(): boolean {
    return this.state.mode === 'standard' && this.state.powerups.swap > 0;
  }

  get canDelete(): boolean {
    return this.state.mode === 'standard' && this.state.powerups.delete > 0;
  }

  /** A read-only view for engines. */
  toContext() {
    return {
      grid: this.state.grid,
      size: this.state.size,
      score: this.state.score,
      powerups: this.state.powerups,
      // Hand the AI the deterministic spawn stream (seed + position) and the
      // manipulation flag so it can run the predictive "cheat" search when
      // manipulation is on. The real game spawns from this same stream, so the
      // AI's predicted spawns match reality.
      manipulate: this.manipulate,
      rngSeed: this.state.rngSeed,
      rngCalls: this.state.rngCalls,
    };
  }
}

/** Restore a session from a persisted GameState (e.g. localStorage). */
export function restoreSession(state: GameState, rng?: () => number): GameSession {
  // Ensure deltaHistory exists (backward compat with saves from before this feature)
  if (!state.deltaHistory) state.deltaHistory = [];
  // Ensure the id counter is above any persisted tile id to avoid collisions.
  let maxId = 0;
  for (const row of state.grid) {
    for (const c of row) if (c && c.id > maxId) maxId = c.id;
  }
  for (const snap of state.history) {
    for (const row of snap.grid) {
      for (const c of row) if (c && c.id > maxId) maxId = c.id;
    }
  }
  setNextId(maxId + 1);
  return new GameSession(state, rng);
}

export type { Grid };
