import type {
  Direction,
  GameMode,
  GameState,
  GameSnapshot,
  Grid,
  MoveTranscript,
  Powerups,
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

  constructor(state: GameState, rng: () => number = Math.random) {
    this.state = state;
    this.rng = rng;
  }

  static newGame(
    size: number,
    mode: GameMode = DEFAULT_MODE,
    best = 0,
    rng: () => number = Math.random,
  ): GameSession {
    const grid = createGrid(size);
    // Fresh game starts from a clean id space.
    setNextId(1);
    spawnTile(grid, { rng });
    spawnTile(grid, { rng });
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
    };
    return new GameSession(state, rng);
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
    transcript.spawned = spawnTile(next, { rng: this.rng }) ?? undefined;
    this.state.moveCount++;
    if (!this.state.won && hasTile(next, WIN_VALUE)) this.state.won = true;
    this.recomputeOver();
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
    this.state.grid[r1][c1] = b;
    this.state.grid[r2][c2] = a;
    this.state.powerups = { ...this.state.powerups, swap: this.state.powerups.swap - 1 };
    this.recomputeOver();
    return true;
  }

  /** Remove a single tile from the board. */
  deleteTile(row: number, col: number): boolean {
    if (this.state.mode !== 'standard') return false;
    if (this.state.powerups.delete <= 0) return false;
    if (!this.state.grid[row]?.[col]) return false;

    this.pushHistory();
    this.state.grid[row][col] = null;
    this.state.powerups = { ...this.state.powerups, delete: this.state.powerups.delete - 1 };
    this.recomputeOver();
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
    return { grid: this.state.grid, size: this.state.size, score: this.state.score };
  }
}

/** Restore a session from a persisted GameState (e.g. localStorage). */
export function restoreSession(state: GameState, rng: () => number = Math.random): GameSession {
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
