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
  /**
   * RNG Manipulation. When true, instead of taking the very next draw from
   * the ChaCha20 stream verbatim, we draw several *genuine* candidate spawns
   * in a row from that same stream and keep whichever one leaves the board in
   * the strongest position. Nothing about the source of randomness changes -
   * every candidate is a real, unpredictable draw from the CSPRNG - this only
   * changes which of those draws gets used, biasing outcomes in the player's
   * favor without ever inventing a spawn the stream didn't produce.
   */
  manipulate?: boolean;
}

/** How many genuine candidate draws to sample per spawn when manipulating. */
const MANIPULATION_CANDIDATES = 5;

/**
 * Lightweight positional score for a candidate post-spawn board: rewards
 * empty space and smooth neighbours (small differences between adjacent
 * tiles), penalizes a spawn that wedges a tile awkwardly next to a much
 * larger one. Intentionally a cheap approximation of the Rust AI's
 * heuristic - this runs synchronously on every spawn, so it stays a simple
 * local score rather than a full search.
 */
function scoreSpawnCandidate(grid: Grid): number {
  const n = grid.length;
  let empty = 0;
  let smoothness = 0;
  const log2 = (v: number) => (v > 0 ? Math.log2(v) : 0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = grid[r][c];
      if (!cell) {
        empty++;
        continue;
      }
      const v = log2(cell.value);
      const right = grid[r][c + 1];
      if (right) smoothness -= Math.abs(v - log2(right.value));
      const down = grid[r + 1]?.[c];
      if (down) smoothness -= Math.abs(v - log2(down.value));
    }
  }
  return empty * 4 + smoothness;
}

export function spawnTile(grid: Grid, opts: SpawnOptions = {}): SpawnedTile | null {
  const empties = emptyCells(grid);
  if (empties.length === 0) return null;
  const rng = opts.rng ?? Math.random;

  let spot: { row: number; col: number };
  let value: number;

  if (opts.at) {
    spot = opts.at;
    value = opts.value ?? (rng() < SPAWN_PROB_4 ? 4 : 2);
  } else if (opts.manipulate && empties.length > 1) {
    const rounds = Math.min(MANIPULATION_CANDIDATES, empties.length);
    let bestSpot = empties[0];
    let bestValue: number = opts.value ?? 2;
    let bestScore = -Infinity;
    for (let i = 0; i < rounds; i++) {
      const candSpot = empties[Math.floor(rng() * empties.length)];
      const candValue = opts.value ?? (rng() < SPAWN_PROB_4 ? 4 : 2);
      // Probe: temporarily place the candidate, score the board, undo.
      grid[candSpot.row][candSpot.col] = { id: -1, value: candValue };
      const score = scoreSpawnCandidate(grid);
      grid[candSpot.row][candSpot.col] = null;
      if (score > bestScore) {
        bestScore = score;
        bestSpot = candSpot;
        bestValue = candValue;
      }
    }
    spot = bestSpot;
    value = bestValue;
  } else {
    spot = empties[Math.floor(rng() * empties.length)];
    value = opts.value ?? (rng() < SPAWN_PROB_4 ? 4 : 2);
  }

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
