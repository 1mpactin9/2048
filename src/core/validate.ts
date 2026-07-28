import type { Grid } from "./types";

function log2int(value: number): number {
  if (value > 0 && (value & (value - 1)) === 0) return 31 - Math.clz32(value);
  return Math.log2(value);
}

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
  belowBy: number;
  aboveBy: number;
  tileCount: number;
}

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

export function clampScoreToWindow(grid: Grid, score: number): ClampResult {
  const { min, max } = scoreWindow(grid);
  return { from: score, to: Math.min(max, Math.max(min, score)), min, max };
}

export interface BypassPlan {
  feasible: boolean;
  alreadyValid: boolean;
  heuristic: boolean;
  remove: { row: number; col: number; value: number }[];
  after: { min: number; max: number };
  valueFirst: boolean;
}

interface Candidate {
  row: number;
  col: number;
  value: number;
  m: number;
  M: number;
}

export interface KeepResult {
  count: number;
  value: number;
  kept: Set<number>;
}

export function keepBetter(
  x: KeepResult,
  y: KeepResult,
  valueFirst: boolean,
): boolean {
  return valueFirst
    ? x.value > y.value || (x.value === y.value && x.count > y.count)
    : x.count > y.count || (x.count === y.count && x.value > y.value);
}

const EXACT_MAX_CANDIDATES = 20;

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
  );
  best = better(
    best,
    tryOrder((c) => c.M, "desc"),
  );
  best = better(
    best,
    tryOrder((c) => c.value, "asc"),
  );
  best = better(
    best,
    tryOrder((c) => c.value, "desc"),
  );
  if (0 <= limLow && 0 >= limHigh) {
    best = better(best, { count: 0, value: 0, kept: new Set<number>() });
  }
  return best;
}

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
  let keptMin = 0;
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
