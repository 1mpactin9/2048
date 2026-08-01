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

describe("tileScoreRange", () => {
  const cases: [number, [number, number]][] = [
    [2, [0, 0]],
    [4, [0, 4]],
    [8, [8, 16]],
    [16, [32, 48]],
    [1024, [8192, 9216]],
    [2048, [18432, 20480]],
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
    expect(
      scoreWindow(
        gridFromValues([
          [0, 0],
          [0, 0],
        ]),
      ),
    ).toEqual({ min: 0, max: 0, tiles: [] });
  });
});

describe("validatePosition", () => {
  it("valid when score is inside the window (incl. endpoints)", () => {
    const g = gridFromValues([[8, 16]]);
    expect(validatePosition(g, 40).valid).toBe(true);
    expect(validatePosition(g, 50).valid).toBe(true);
    expect(validatePosition(g, 64).valid).toBe(true);
  });

  it("invalid below the minimum or above the maximum", () => {
    const g = gridFromValues([[8, 16]]);
    expect(validatePosition(g, 10).valid).toBe(false);
    expect(validatePosition(g, 100).valid).toBe(false);
  });
});

describe("clampScoreToWindow", () => {
  it("clamps scores into the valid window", () => {
    const g = gridFromValues([[8, 16]]);
    expect(clampScoreToWindow(g, 10)).toMatchObject({ from: 10, to: 40 });
    expect(clampScoreToWindow(g, 100)).toMatchObject({ from: 100, to: 64 });
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

  it("removes an impossible big tile (score 0)", () => {
    const g = gridFromValues([
      [32768, 0],
      [0, 0],
    ]);
    const plan = planBypass(g, 0);
    expect(plan.feasible).toBe(true);
    expect(plan.remove[0].value).toBe(32768);
  });

  it("reports infeasible when no removal can validate the board", () => {
    const g = gridFromValues([
      [32768, 0],
      [0, 0],
    ]);
    const plan = planBypass(g, 100000);
    expect(plan.feasible).toBe(false);
  });

  it("end-to-end: fix -> validate is valid", () => {
    const g = gridFromValues([
      [32768, 2],
      [0, 4],
    ]);
    expect(validatePosition(g, 0).valid).toBe(false);
    const plan = planBypass(g, 0);
    const fixed = cloneGrid(g);
    for (const t of plan.remove) fixed[t.row][t.col] = null;
    expect(validatePosition(fixed, 0).valid).toBe(true);
  });
});

describe("keepBetter", () => {
  it("prefers more count under count-first", () => {
    const few: KeepResult = { count: 1, value: 100, kept: new Set() };
    const many: KeepResult = { count: 5, value: 10, kept: new Set() };
    expect(keepBetter(many, few, false)).toBe(true);
    expect(keepBetter(few, many, false)).toBe(false);
  });

  it("prefers more value under value-first", () => {
    const a: KeepResult = { count: 1, value: 100, kept: new Set() };
    const b: KeepResult = { count: 5, value: 10, kept: new Set() };
    expect(keepBetter(a, b, true)).toBe(true);
    expect(keepBetter(b, a, true)).toBe(false);
  });
});
