import { describe, it, expect } from "vitest";
import * as v from "valibot";

// The storage module owns the persisted-state schema. These tests exercise the
// same valibot patterns to guard against schema drift.
const TileSchema = v.object({ id: v.number(), value: v.number() });
const GridSchema = v.array(v.array(v.nullable(TileSchema)));

describe("grid schema validation", () => {
  it("accepts a well-formed grid", () => {
    const grid = [
      [{ id: 1, value: 2 }, null],
      [null, { id: 2, value: 4 }],
    ];
    const result = v.safeParse(GridSchema, grid);
    expect(result.success).toBe(true);
  });

  it("rejects a grid with a malformed tile", () => {
    const grid = [[{ id: "x", value: 2 }]];
    const result = v.safeParse(GridSchema, grid);
    expect(result.success).toBe(false);
  });

  it("rejects a non-array grid", () => {
    const result = v.safeParse(GridSchema, { rows: [] });
    expect(result.success).toBe(false);
  });
});

describe("mode picklist", () => {
  const ModeSchema = v.picklist(["standard", "classic", "plus"]);

  it("accepts known modes", () => {
    for (const m of ["standard", "classic", "plus"]) {
      expect(v.safeParse(ModeSchema, m).success).toBe(true);
    }
  });

  it("rejects an unknown mode", () => {
    expect(v.safeParse(ModeSchema, "hardcore").success).toBe(false);
  });
});
