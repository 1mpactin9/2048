import type { Grid, SpawnedTile } from './types';
import { SPAWN_PROB_4 } from './constants';

// Monotonic tile id counter. Persisted via storage so reloaded tiles never
// collide with freshly spawned ones.
let nextId = 1;

export function peekNextId(): number {
  return nextId;
}

export function setNextId(n: number): void {
  nextId = Math.max(nextId, n);
}

function freshId(): number {
  return nextId++;
}

export function createGrid(size: number): Grid {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((c) => (c ? { ...c } : null)));
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  const n = a.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = a[r][c];
      const y = b[r][c];
      if (x == null || y == null) {
        if (x !== y) return false;
      } else if (x.id !== y.id) {
        return false;
      }
    }
  }
  return true;
}

export function emptyCells(grid: Grid): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!grid[r][c]) out.push({ row: r, col: c });
    }
  }
  return out;
}

export function isFull(grid: Grid): boolean {
  return emptyCells(grid).length === 0;
}

export interface SpawnOptions {
  /** Force a specific value (used by tests). */
  value?: number;
  /** Force a specific empty cell (used by tests). */
  at?: { row: number; col: number };
  /** Injectable RNG for deterministic tests. */
  rng?: () => number;
}

export function spawnTile(grid: Grid, opts: SpawnOptions = {}): SpawnedTile | null {
  const empties = emptyCells(grid);
  if (empties.length === 0) return null;
  const rng = opts.rng ?? Math.random;
  const spot = opts.at ?? empties[Math.floor(rng() * empties.length)];
  const value = opts.value ?? (rng() < SPAWN_PROB_4 ? 4 : 2);
  const id = freshId();
  grid[spot.row][spot.col] = { id, value };
  return { id, value, row: spot.row, col: spot.col };
}

/**
 * A move is possible when there is an empty cell or two equal tiles are
 * adjacent. Board full + no adjacent equal pair => game over.
 */
export function hasMoves(grid: Grid): boolean {
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = grid[r][c];
      if (!cell) return true;
      if (c + 1 < n && grid[r][c + 1] && grid[r][c + 1]!.value === cell.value) return true;
      if (r + 1 < n && grid[r + 1][c] && grid[r + 1][c]!.value === cell.value) return true;
    }
  }
  return false;
}

export function maxTile(grid: Grid): number {
  let max = 0;
  for (const row of grid) {
    for (const c of row) {
      if (c && c.value > max) max = c.value;
    }
  }
  return max;
}

export function hasTile(grid: Grid, value: number): boolean {
  for (const row of grid) {
    for (const c of row) {
      if (c && c.value >= value) return true;
    }
  }
  return false;
}

/** Internal helper for tests: build a grid from a number matrix (0 = empty). */
export function gridFromValues(values: number[][], idSeed = 1): Grid {
  let id = idSeed;
  const grid: Grid = values.map((row) =>
    row.map((v) => (v > 0 ? { id: id++, value: v } : null)),
  );
  setNextId(id);
  return grid;
}

/** Internal helper for tests: read a grid back as a number matrix. */
export function gridToValues(grid: Grid): number[][] {
  return grid.map((row) => row.map((c) => (c ? c.value : 0)));
}
