// Position validation for hacked boards.
// Points are only awarded on merges, so every visible tile of value V (with
// n = log2 V) was built by a chain of merges whose total award sits in a fixed
// window:
//   - all-2 spawns  -> the most merges -> max contribution = (n - 1) * V
//   - all-4 spawns  -> the fewest merges -> min contribution = (n - 2) * V
// A 2-tile (n = 1) would give a negative minimum, so the floor is clamped to 0.
// Summed across the board this yields a [min, max] window the displayed score
// must lie within; outside it, the board has been altered.

import type { Grid } from "./types";

/** Exact integer log2 for powers of two; falls back to Math.log2 otherwise. */
function log2int(value: number): number {
  // Math.log2 can wobble by an ULP for large powers of two; the bit trick is
  // exact for 2^k (k <= 31), which covers every value the game can produce.
  if (value > 0 && (value & (value - 1)) === 0) return 31 - Math.clz32(value);
  return Math.log2(value);
}

// The [min, max] score contribution a single tile of `value` could have cost.
export function tileScoreRange(value: number): { min: number; max: number } {
  const n = log2int(value);
  return {
    min: Math.max(0, (n - 2) * value),
    max: Math.max(0, (n - 1) * value),
  };
}

export interface TileContribution {
  row: number;
  col: number;
  value: number;
  min: number;
  max: number;
}

export interface ScoreWindow {
  min: number;
  max: number;
  tiles: TileContribution[];
}

// Sum the per-tile min/max windows across every occupied cell.
export function scoreWindow(grid: Grid): ScoreWindow {
  const tiles: TileContribution[] = [];
  let min = 0;
  let max = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const { min: tMin, max: tMax } = tileScoreRange(cell.value);
      min += tMin;
      max += tMax;
      tiles.push({ row: r, col: c, value: cell.value, min: tMin, max: tMax });
    }
  }
  return { min, max, tiles };
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  min: number;
  max: number;
  /** score - min: negative when the score is below the minimum. */
  belowBy: number;
  /** max - score: negative when the score is above the maximum. */
  aboveBy: number;
  /** Number of occupied cells on the board. */
  tileCount: number;
}

// Is `score` consistent with the tiles currently on `grid`?
export function validatePosition(grid: Grid, score: number): ValidationResult {
  const w = scoreWindow(grid);
  return {
    valid: score >= w.min && score <= w.max,
    score,
    min: w.min,
    max: w.max,
    belowBy: score - w.min,
    aboveBy: w.max - score,
    tileCount: w.tiles.length,
  };
}

export interface ClampResult {
  from: number;
  to: number;
  min: number;
  max: number;
}

// Clamp `score` into the board's valid window. A hacked board whose score falls
// outside the window becomes valid with the smallest possible adjustment.
export function clampScoreToWindow(grid: Grid, score: number): ClampResult {
  const { min, max } = scoreWindow(grid);
  return { from: score, to: Math.min(max, Math.max(min, score)), min, max };
}

// bypassValidation: remove the fewest tiles (then least total value) so the
// remaining board is valid for the current score.
// Removing tiles can only lower the window, so this fixes "score too low for
// the tiles present" (e.g. a hacked 32768 with score 0). It cannot fix a score
// above max — that is reported infeasible.
// Reframed as a keep-set problem: keep the largest subset whose window contains
// the score. Priority is lexicographic: (count, then value) by default, or
// (value, then count) with `valueFirst`. For power-of-two tiles both orderings
// pick the same set, so the toggle is a no-op in practice. Tiles with 0 min
// contribution (values 2 and 4) are always kept.

export interface BypassPlan {
  /** A valid keep-set exists; `remove` applied to the board makes it valid. */
  feasible: boolean;
  /** The board was already valid; nothing needs removing. */
  alreadyValid: boolean;
  /** True when the candidate set was too large to solve exactly. */
  heuristic: boolean;
  /** Tiles to delete to reach a valid position. */
  remove: { row: number; col: number; value: number }[];
  /** Score window of the board after the removals. */
  after: { min: number; max: number };
  /** Whether value was prioritised over count when choosing tiles to remove. */
  valueFirst: boolean;
}

interface Candidate {
  row: number;
  col: number;
  value: number;
  m: number; // min contribution
  M: number; // max contribution
}

export interface KeepResult {
  count: number;
  value: number;
  kept: Set<number>;
}

/**
 * Is keep-set `x` strictly better than `y` under the chosen priority? With
 * `valueFirst` false the order is (count, value); with true it is (value,
 * count). Exported so the priority logic can be unit-tested directly.
 */
export function keepBetter(
  x: KeepResult,
  y: KeepResult,
  valueFirst: boolean,
): boolean {
  return valueFirst
    ? x.value > y.value || (x.value === y.value && x.count > y.count)
    : x.count > y.count || (x.count === y.count && x.value > y.value);
}

// Brute-force the keep-set exactly up to this many score-bearing tiles.
const EXACT_MAX_CANDIDATES = 20;

/**
 * Choose which score-bearing tiles to keep so the kept window contains `score`,
 * maximising kept (count, value) - or (value, count) when `valueFirst` - and
 * returning null if no keep-set is valid (the position cannot be fixed by
 * removal alone).
 */
function chooseKeep(
  cands: Candidate[],
  limLow: number,
  limHigh: number,
  valueFirst: boolean,
): { result: KeepResult | null; heuristic: boolean } {
  if (cands.length <= EXACT_MAX_CANDIDATES) {
    return {
      result: exactKeep(cands, limLow, limHigh, valueFirst),
      heuristic: false,
    };
  }
  return {
    result: greedyKeep(cands, limLow, limHigh, valueFirst),
    heuristic: true,
  };
}

function exactKeep(
  cands: Candidate[],
  limLow: number,
  limHigh: number,
  valueFirst: boolean,
): KeepResult | null {
  const k = cands.length;
  const total = 1 << k;
  let bestMask = -1;
  let bestCount = -1;
  let bestVal = -1;
  for (let mask = 0; mask < total; mask++) {
    let sumMin = 0;
    let sumMax = 0;
    let sumVal = 0;
    let count = 0;
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) {
        const c = cands[i];
        sumMin += c.m;
        sumMax += c.M;
        sumVal += c.value;
        count++;
      }
    }
    if (sumMin > limLow || sumMax < limHigh) continue;
    const better = valueFirst
      ? sumVal > bestVal || (sumVal === bestVal && count > bestCount)
      : count > bestCount || (count === bestCount && sumVal > bestVal);
    if (bestMask < 0 || better) {
      bestCount = count;
      bestVal = sumVal;
      bestMask = mask;
    }
  }
  if (bestMask < 0) return null;
  const kept = new Set<number>();
  for (let i = 0; i < k; i++) if (bestMask & (1 << i)) kept.add(i);
  return { count: bestCount, value: bestVal, kept };
}

/**
 * Greedy fallback for boards too large to brute-force. Tries several orderings
 * and keeps the best valid result per the priority; not guaranteed optimal.
 */
function greedyKeep(
  cands: Candidate[],
  limLow: number,
  limHigh: number,
  valueFirst: boolean,
): KeepResult | null {
  const better = (
    a: KeepResult | null,
    b: KeepResult | null,
  ): KeepResult | null => {
    if (!b) return a;
    if (!a) return b;
    return keepBetter(b, a, valueFirst) ? b : a;
  };

  const tryOrder = (
    key: (c: Candidate) => number,
    dir: "asc" | "desc",
  ): KeepResult | null => {
    const order = cands
      .map((_, i) => i)
      .sort((a, b) =>
        dir === "asc"
          ? key(cands[a]) - key(cands[b])
          : key(cands[b]) - key(cands[a]),
      );
    const kept = new Set<number>();
    let sumMin = 0;
    let sumMax = 0;
    let sumVal = 0;
    for (const i of order) {
      const c = cands[i];
      if (sumMin + c.m <= limLow) {
        kept.add(i);
        sumMin += c.m;
        sumMax += c.M;
        sumVal += c.value;
      }
    }
    if (sumMin <= limLow && sumMax >= limHigh)
      return { count: kept.size, value: sumVal, kept };
    return null;
  };

  let best: KeepResult | null = null;
  best = better(
    best,
    tryOrder((c) => c.m, "asc"),
  ); // maximise count under the lower limit
  best = better(
    best,
    tryOrder((c) => c.M, "desc"),
  ); // satisfy the upper requirement first
  best = better(
    best,
    tryOrder((c) => c.value, "asc"),
  ); // keep cheap tiles
  best = better(
    best,
    tryOrder((c) => c.value, "desc"),
  ); // keep valuable tiles (value-first)
  // Keeping no candidate (base tiles only) is valid iff the base maximum covers the score.
  if (0 <= limLow && 0 >= limHigh) {
    best = better(best, { count: 0, value: 0, kept: new Set<number>() });
  }
  return best;
}

/**
 * Plan the minimal tile removals that make `grid` valid for `score`. Does not
 * mutate the grid. `valueFirst` flips the priority from (count, value) to
 * (value, count); for power-of-two tiles they select the same set.
 */
export function planBypass(
  grid: Grid,
  score: number,
  valueFirst = false,
): BypassPlan {
  const win = scoreWindow(grid);
  if (score >= win.min && score <= win.max) {
    return {
      feasible: true,
      alreadyValid: true,
      heuristic: false,
      remove: [],
      after: { min: win.min, max: win.max },
      valueFirst,
    };
  }

  // Split into always-keep tiles (min contribution 0) and score-bearing candidates.
  const cands: Candidate[] = [];
  let baseMax = 0;
  for (const t of win.tiles) {
    if (t.min === 0) baseMax += t.max;
    else
      cands.push({
        row: t.row,
        col: t.col,
        value: t.value,
        m: t.min,
        M: t.max,
      });
  }

  // A kept subset K of the candidates must satisfy:
  //   sum_K m <= score            (kept minimum <= score)
  //   sum_K M >= score - baseMax  (kept maximum >= score)
  const limLow = score;
  const limHigh = score - baseMax;

  const { result: best, heuristic } = chooseKeep(
    cands,
    limLow,
    limHigh,
    valueFirst,
  );
  if (!best) {
    return {
      feasible: false,
      alreadyValid: false,
      heuristic,
      remove: [],
      after: { min: win.min, max: win.max },
      valueFirst,
    };
  }

  const remove: { row: number; col: number; value: number }[] = [];
  let keptMin = 0; // base minimum is 0 by construction
  let keptMax = baseMax;
  for (let i = 0; i < cands.length; i++) {
    if (best.kept.has(i)) {
      keptMin += cands[i].m;
      keptMax += cands[i].M;
    } else {
      remove.push({
        row: cands[i].row,
        col: cands[i].col,
        value: cands[i].value,
      });
    }
  }
  return {
    feasible: true,
    alreadyValid: false,
    heuristic,
    remove,
    after: { min: keptMin, max: keptMax },
    valueFirst,
  };
}
