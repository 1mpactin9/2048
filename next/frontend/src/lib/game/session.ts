import type {
  Direction,
  GameMode,
  GameSnapshot,
  GameState,
  Grid,
  MoveTranscript,
  Powerups,
} from "../types/game";
import { DEFAULT_MODE, MAX_HISTORY, POWERUP_QUOTA, WIN_VALUE } from "./constants";
import { cloneGrid, createGrid, hasMoves, maxTile, setNextId, spawnTile } from "./grid";
import { move } from "./move";

function emptyPowerups(): Powerups {
  return { undo: 0, swap: 0, delete: 0 };
}

function startingPowerups(mode: GameMode): Powerups {
  if (mode === "classic") return emptyPowerups();
  if (mode === "plus") return { undo: 3, swap: 3, delete: 3 };
  return { ...POWERUP_QUOTA };
}

export class GameSession {
  state: GameState;
  private rng: () => number;

  constructor(state: GameState, rng: () => number) {
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
    setNextId(1);
    const state: GameState = {
      size,
      mode,
      grid,
      score: 0,
      best,
      powerups: startingPowerups(mode),
      won: false,
      wonAcknowledged: false,
      over: false,
      history: [],
      moveCount: 0,
    };
    const session = new GameSession(state, rng);
    spawnTile(grid, { rng });
    spawnTile(grid, { rng });
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

  private get powerupsEnabled(): boolean {
    return this.state.mode !== "classic";
  }

  applyMove(dir: Direction): MoveTranscript | null {
    if (this.state.over) return null;
    const { grid: next, transcript } = move(this.state.grid, dir);
    if (!transcript.moved) {
      this.recomputeOver();
      return null;
    }

    this.pushHistory();
    this.state.grid = next;
    this.state.score += transcript.gained;
    this.state.best = Math.max(this.state.best, this.state.score);
    transcript.spawned = spawnTile(next, { rng: this.rng }) ?? undefined;
    this.state.moveCount++;
    if (!this.state.won && maxTile(next) >= WIN_VALUE) this.state.won = true;
    this.recomputeOver();
    return transcript;
  }

  undo(): boolean {
    if (!this.powerupsEnabled) return false;
    if (this.state.powerups.undo <= 0) return false;
    if (this.state.history.length === 0) return false;

    const snap = this.state.history.pop()!;
    this.state.grid = snap.grid;
    this.state.score = snap.score;
    this.state.won = snap.won;
    this.state.wonAcknowledged = snap.wonAcknowledged;
    this.state.moveCount = snap.moveCount;
    this.state.powerups = { ...snap.powerups, undo: snap.powerups.undo - 1 };
    this.recomputeOver();
    return true;
  }

  swap(r1: number, c1: number, r2: number, c2: number): boolean {
    if (!this.powerupsEnabled) return false;
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

  deleteTile(row: number, col: number): boolean {
    if (!this.powerupsEnabled) return false;
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
    return this.powerupsEnabled && this.state.powerups.undo > 0 && this.state.history.length > 0;
  }

  get canSwap(): boolean {
    return this.powerupsEnabled && this.state.powerups.swap > 0;
  }

  get canDelete(): boolean {
    return this.powerupsEnabled && this.state.powerups.delete > 0;
  }
}

export function restoreSession(state: GameState, rng: () => number): GameSession {
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