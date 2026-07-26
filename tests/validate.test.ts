import { describe, it, expect } from "vitest";
import { cloneGrid, gridFromValues } from "../src/core/grid";
import {
  tileScoreRange,
  scoreWindow,
  validatePosition,
  clampScoreToWindow,
  planBypass,
  keepBetter,
  type KeepResult,
} from "../src/core/validate";
import { GameSession } from "../src/core/session";
import { DIRECTIONS } from "../src/core/types";

function seededRng(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function applyPlan(
  grid: ReturnType<typeof gridFromValues>,
  plan: ReturnType<typeof planBypass>,
) {
  const g = cloneGrid(grid);
  for (const t of plan.remove) g[t.row][t.col] = null;
  return g;
}

describe("tileScoreRange", () => {
  const cases: [number, [number, number]][] = [
    [2, [0, 0]],
    [4, [0, 4]],
    [8, [8, 16]],
    [16, [32, 48]],
    [1024, [8192, 9216]],
    [2048, [18432, 20480]],
    [16384, [196608, 212992]],
    [33554432, [771751936, 805306368]],
  ];
  for (const [v, [min, max]] of cases) {
    it(`value ${v} -> min=${min}, max=${max}`, () => {
      expect(tileScoreRange(v)).toEqual({ min, max });
    });
  }
});

describe("scoreWindow", () => {
  it("sums per-tile windows across the board", () => {
    const g = gridFromValues([
      [2, 4],
      [8, 16],
    ]);
    expect(scoreWindow(g)).toMatchObject({ min: 40, max: 68 });
    expect(scoreWindow(g).tiles).toHaveLength(4);
  });

  it("empty board has a zero window", () => {
    const g = gridFromValues([
      [0, 0],
      [0, 0],
    ]);
    expect(scoreWindow(g)).toEqual({ min: 0, max: 0, tiles: [] });
  });
});

describe("validatePosition", () => {
  it("valid when score is inside the window (incl. endpoints)", () => {
    const g = gridFromValues([[8, 16]]);
    expect(validatePosition(g, 40).valid).toBe(true);
    expect(validatePosition(g, 50).valid).toBe(true);
    expect(validatePosition(g, 64).valid).toBe(true);
  });

  it("invalid below the minimum", () => {
    const g = gridFromValues([[8, 16]]);
    const r = validatePosition(g, 10);
    expect(r.valid).toBe(false);
    expect(r.belowBy).toBe(-30);
  });

  it("invalid above the maximum", () => {
    const g = gridFromValues([[8, 16]]);
    const r = validatePosition(g, 100);
    expect(r.valid).toBe(false);
    expect(r.aboveBy).toBe(-36);
  });
});

describe("clampScoreToWindow", () => {
  it("clamps a too-low score up to the minimum", () => {
    const g = gridFromValues([[8, 16]]);
    expect(clampScoreToWindow(g, 10)).toMatchObject({ from: 10, to: 40 });
  });

  it("clamps a too-high score down to the maximum", () => {
    const g = gridFromValues([[8, 16]]);
    expect(clampScoreToWindow(g, 100)).toMatchObject({ from: 100, to: 64 });
  });

  it("leaves an in-window score untouched", () => {
    const g = gridFromValues([[8, 16]]);
    expect(clampScoreToWindow(g, 50)).toMatchObject({ from: 50, to: 50 });
  });
});

describe("planBypass", () => {
  it("removes nothing when the position is already valid", () => {
    const g = gridFromValues([[8, 16]]);
    const plan = planBypass(g, 50);
    expect(plan.alreadyValid).toBe(true);
    expect(plan.remove).toHaveLength(0);
  });

  it("removes a single impossible big tile (score 0)", () => {
    const g = gridFromValues([
      [32768, 0],
      [0, 0],
    ]);
    const plan = planBypass(g, 0);
    expect(plan.feasible).toBe(true);
    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].value).toBe(32768);
    expect(plan.after).toEqual({ min: 0, max: 0 });
  });

  it("keeps 2/4 tiles and removes only the impossible ones (score 0)", () => {
    const g = gridFromValues([
      [32768, 2],
      [0, 0],
    ]);
    const plan = planBypass(g, 0);
    expect(plan.feasible).toBe(true);
    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].value).toBe(32768);
    expect(plan.after).toEqual({ min: 0, max: 0 });
  });

  it("removes the minimum number of tiles (two 32768s, score 0)", () => {
    const g = gridFromValues([
      [32768, 32768],
      [0, 0],
    ]);
    const plan = planBypass(g, 0);
    expect(plan.feasible).toBe(true);
    expect(plan.remove).toHaveLength(2);
  });

  it("reports infeasible when no removal can validate the board", () => {
    const g = gridFromValues([
      [32768, 0],
      [0, 0],
    ]);
    const plan = planBypass(g, 100000);
    expect(plan.feasible).toBe(false);
    expect(plan.remove).toHaveLength(0);
  });

  it("falls back to a heuristic on large candidate sets and still yields a valid plan", () => {
    const row = () => new Array(6).fill(8);
    const g = gridFromValues([row(), row(), row(), row(), row(), row()]);
    const plan = planBypass(g, 0);
    expect(plan.heuristic).toBe(true);
    expect(plan.feasible).toBe(true);
    expect(plan.remove).toHaveLength(36);
    expect(plan.after).toEqual({ min: 0, max: 0 });
  });

  it("keeps as many tiles as the score allows (heuristic, mixed board)", () => {
    const vals = [
      [2, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8],
    ];
    const g = gridFromValues(vals);
    const plan = planBypass(g, 16);
    expect(plan.heuristic).toBe(true);
    expect(plan.feasible).toBe(true);
    expect(plan.after.min).toBeLessThanOrEqual(16);
    expect(plan.after.max).toBeGreaterThanOrEqual(16);
    expect(plan.remove).toHaveLength(33);
  });
});

describe("end-to-end: validate -> fix -> validate", () => {
  it("bypassValidation makes a below-min position valid (hacked 32768, score 0)", () => {
    const g = gridFromValues([
      [32768, 2],
      [0, 4],
    ]);
    expect(validatePosition(g, 0).valid).toBe(false);
    const plan = planBypass(g, 0);
    expect(plan.feasible).toBe(true);
    const fixed = applyPlan(g, plan);
    expect(validatePosition(fixed, 0).valid).toBe(true);
    expect(fixed.flat().filter(Boolean)).toHaveLength(2);
  });

  it("updatePosition makes a below-min position valid by raising the score", () => {
    const g = gridFromValues([
      [32768, 0],
      [0, 0],
    ]);
    expect(validatePosition(g, 0).valid).toBe(false);
    const clamped = clampScoreToWindow(g, 0);
    expect(clamped.to).toBe(425984);
    expect(validatePosition(g, clamped.to).valid).toBe(true);
  });

  it("updatePosition makes an above-max position valid by lowering the score", () => {
    const g = gridFromValues([[8, 16]]);
    expect(validatePosition(g, 1000).valid).toBe(false);
    const clamped = clampScoreToWindow(g, 1000);
    expect(clamped.to).toBe(64);
    expect(validatePosition(g, clamped.to).valid).toBe(true);
  });

  it("bypassValidation is infeasible for an above-max position, but updatePosition fixes it", () => {
    const g = gridFromValues([[8, 16]]);
    expect(planBypass(g, 1000).feasible).toBe(false);
    const clamped = clampScoreToWindow(g, 1000);
    expect(validatePosition(g, clamped.to).valid).toBe(true);
  });
});

describe("keepBetter (priority toggle)", () => {
  it("prefers more count under count-first (valueFirst=false)", () => {
    const few: KeepResult = { count: 1, value: 100, kept: new Set() };
    const many: KeepResult = { count: 5, value: 10, kept: new Set() };
    expect(keepBetter(many, few, false)).toBe(true);
    expect(keepBetter(few, many, false)).toBe(false);
  });

  it("prefers more value under value-first (valueFirst=true)", () => {
    const a: KeepResult = { count: 1, value: 100, kept: new Set() };
    const b: KeepResult = { count: 5, value: 10, kept: new Set() };
    expect(keepBetter(a, b, true)).toBe(true);
    expect(keepBetter(b, a, true)).toBe(false);
  });

  it("falls back to the secondary criterion on ties", () => {
    const a: KeepResult = { count: 2, value: 30, kept: new Set() };
    const b: KeepResult = { count: 3, value: 30, kept: new Set() };
    expect(keepBetter(b, a, false)).toBe(true);
    expect(keepBetter(b, a, true)).toBe(true);

    const c: KeepResult = { count: 2, value: 40, kept: new Set() };
    const d: KeepResult = { count: 2, value: 50, kept: new Set() };
    expect(keepBetter(d, c, false)).toBe(true);
    expect(keepBetter(d, c, true)).toBe(true);
  });
});

describe("planBypass valueFirst toggle", () => {
  it("both modes produce a valid plan on a hacked board (hacked 32768, score 0)", () => {
    const g = gridFromValues([
      [32768, 2],
      [0, 0],
    ]);
    for (const vf of [false, true]) {
      const plan = planBypass(g, 0, vf);
      expect(plan.valueFirst).toBe(vf);
      expect(plan.feasible).toBe(true);
      const fixed = applyPlan(g, plan);
      expect(validatePosition(fixed, 0).valid).toBe(true);
    }
  });

  it("both modes return the same removal set for power-of-two tiles (coincidence)", () => {
    const g = gridFromValues([
      [32768, 8],
      [8, 0],
    ]);
    const planC = planBypass(g, 16, false);
    const planV = planBypass(g, 16, true);
    expect(planC.feasible).toBe(true);
    expect(planV.feasible).toBe(true);
    expect(planC.remove).toHaveLength(planV.remove.length);
    expect(planC.remove.map((t) => t.value)).toEqual([32768]);
    expect(planV.remove.map((t) => t.value)).toEqual([32768]);
  });
});

describe("real-game invariant", () => {
  it("score always stays within the tile window during legitimate play", () => {
    const s = GameSession.newGame(4, "standard", 0, seededRng(42));
    for (let i = 0; i < 500; i++) {
      let moved = false;
      for (let d = 0; d < 4; d++) {
        const dir = DIRECTIONS[(i + d) % 4];
        if (s.applyMove(dir)) {
          moved = true;
          break;
        }
      }
      if (!moved) break;
      const v = validatePosition(s.state.grid, s.state.score);
      expect(v.valid).toBe(true);
    }
    expect(s.state.moveCount).toBeGreaterThan(0);
  });
});
