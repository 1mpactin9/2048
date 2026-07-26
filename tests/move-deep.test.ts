import { describe, it, expect } from "vitest";
import type { Grid } from "../src/core/types";
import { move, canMove } from "../src/core/move";
import {
  cloneGrid,
  gridsEqual,
  createGrid,
  gridFromValues,
  gridToValues,
} from "../src/core/grid";

/** Helper: build a square grid from row values. */
function makeGrid(rows: number[][]): Grid {
  return gridFromValues(rows);
}

describe("Transcript correctness — merged tiles", () => {
  it("merged tile has mergedInto pointing to survivor id", () => {
    const g = makeGrid([
      [2, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { transcript } = move(g, "left");
    const absorbed = transcript.moves.find((m) => m.mergedInto !== undefined);
    const survivor = transcript.moves.find((m) => m.newValue !== undefined);
    expect(absorbed).toBeDefined();
    expect(survivor).toBeDefined();
    expect(absorbed!.mergedInto).toBe(survivor!.id);
  });

  it("survivor tile has newValue set", () => {
    const g = makeGrid([
      [2, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { transcript } = move(g, "left");
    const survivor = transcript.moves.find((m) => m.newValue !== undefined);
    expect(survivor).toBeDefined();
    expect(survivor!.newValue).toBe(4);
  });

  it("non-merged survivors have neither mergedInto nor newValue", () => {
    const g = makeGrid([
      [2, 0, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { transcript } = move(g, "left");
    const nonMerged = transcript.moves.filter(
      (m) => m.mergedInto === undefined && m.newValue === undefined,
    );
    // Both tiles slide left without merging
    expect(nonMerged.length).toBe(2);
  });

  it("gained equals sum of merged tile values", () => {
    const g = makeGrid([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { transcript } = move(g, "left");
    // Merge 2+2=4 and 4+4=8, gained = 4 + 8 = 12
    expect(transcript.gained).toBe(12);
  });

  it("moves array has entries for original tiles plus survivors", () => {
    const g = makeGrid([
      [2, 2, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { transcript } = move(g, "left");
    // Two 2s merge into one, 4 slides: 3 move entries
    expect(transcript.moves.length).toBe(3);
  });
});

describe("All four directions on complex boards", () => {
  it("up merges by column", () => {
    const g = makeGrid([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "up");
    expect(out[0][0]?.value).toBe(4);
    expect(out[1][0]).toBeNull();
    expect(out[2][0]).toBeNull();
    expect(out[3][0]).toBeNull();
  });

  it("down merges by column to bottom", () => {
    const g = makeGrid([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "down");
    expect(out[3][0]?.value).toBe(4);
    expect(out[0][0]).toBeNull();
    expect(out[1][0]).toBeNull();
    expect(out[2][0]).toBeNull();
  });

  it("right fills from right edge", () => {
    const g = makeGrid([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "right");
    expect(out[0][3]?.value).toBe(4);
    expect(out[0][0]).toBeNull();
    expect(out[0][2]).toBeNull();
  });

  it("empty rows pass through unchanged in column moves", () => {
    const g = makeGrid([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "up");
    // Column 0: [2,0,2,0] → up → [4,0,0,0]
    expect(out[0][0]?.value).toBe(4);
  });

  it("mixed populated/empty lines", () => {
    const g = makeGrid([
      [2, 0, 4, 0],
      [0, 0, 0, 0],
      [0, 8, 0, 16],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "left");
    // Row 0: [2,0,4,0] → [2,4,0,0]
    expect(out[0][0]?.value).toBe(2);
    expect(out[0][1]?.value).toBe(4);
    // Row 2: [0,8,0,16] → [8,16,0,0]
    expect(out[2][0]?.value).toBe(8);
    expect(out[2][1]?.value).toBe(16);
  });
});

describe("Edge cases — cascading and special patterns", () => {
  it("three identical tiles: first pair merges, third slides", () => {
    const g = makeGrid([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "left");
    expect(gridToValues(out)[0]).toEqual([4, 2, 0, 0]);
  });

  it("four identical tiles: two pairs merge independently", () => {
    const g = makeGrid([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: out } = move(g, "left");
    expect(gridToValues(out)[0]).toEqual([4, 4, 0, 0]);
  });

  it("no merge possible on diagonal with no adjacent equals", () => {
    const g = makeGrid([
      [2, 0, 0, 0],
      [0, 4, 0, 0],
      [0, 0, 8, 0],
      [0, 0, 0, 16],
    ]);
    // Tiles can still slide into empty cells — up changes positions
    // But no merges happen. canMove returns true because positions change.
    const { grid: out } = move(g, "up");
    // The move DID change something (tiles slid), but no merge occurred
    expect(out[0][0]?.value).toBe(2); // 2 at (0,0) stays at (0,0) since it's already at top
  });

  it("large board 8x8 sparse: move completes without error", () => {
    const g = createGrid(8);
    g[0][0] = { id: 1, value: 2 };
    g[7][7] = { id: 2, value: 4 };
    const { transcript } = move(g, "left");
    expect(transcript.moved).toBe(true);
  });

  it("packed board with all merges", () => {
    // Build an 8-wide grid properly
    const g = createGrid(8);
    const vals = [2, 2, 4, 4, 8, 8, 16, 16];
    for (let c = 0; c < 8; c++) g[0][c] = { id: c + 1, value: vals[c] };
    const { grid: out, transcript } = move(g, "left");
    expect(gridToValues(out)[0]).toEqual([4, 8, 16, 32, 0, 0, 0, 0]);
    expect(transcript.gained).toBe(4 + 8 + 16 + 32);
  });
});

describe("canMove thoroughness", () => {
  it("false when board is completely locked", () => {
    const g = makeGrid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(canMove(g, "up")).toBe(false);
    expect(canMove(g, "down")).toBe(false);
    expect(canMove(g, "left")).toBe(false);
    expect(canMove(g, "right")).toBe(false);
  });

  it("false on single-tile board", () => {
    const g = createGrid(4);
    g[0][0] = { id: 1, value: 2 };
    expect(canMove(g, "up")).toBe(false);
  });

  it("false when all tiles isolated (no adjacent equals)", () => {
    const g = makeGrid([
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 4096],
      [8192, 2, 4, 8],
    ]);
    expect(canMove(g, "left")).toBe(false);
    expect(canMove(g, "right")).toBe(false);
  });

  it("true when any direction changes board", () => {
    const g = makeGrid([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(canMove(g, "left")).toBe(true);
  });

  it("true when tiles can slide into empty space", () => {
    const g = makeGrid([
      [0, 0, 2, 4],
      [8, 16, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    // Tiles at row 0 can slide right; tiles at row 1 can slide left
    expect(canMove(g, "right")).toBe(true);
    expect(canMove(g, "left")).toBe(true);
  });
});

describe("cloneGrid independence", () => {
  it("mutation of clone does not affect original", () => {
    const g = makeGrid([
      [2, 4],
      [8, 16],
    ]);
    const cloned = cloneGrid(g);
    cloned[0][0] = null;
    expect(g[0][0]?.value).toBe(2);
  });

  it("deep copy: nested cell mutation doesn't affect original", () => {
    const g = makeGrid([
      [2, 4],
      [8, 16],
    ]);
    const cloned = cloneGrid(g);
    cloned[0][0]!.value = 1024;
    expect(g[0][0]?.value).toBe(2);
  });
});

describe("gridsEqual", () => {
  it("true for identical grids", () => {
    const g1 = makeGrid([
      [2, 4],
      [8, 16],
    ]);
    const g2 = makeGrid([
      [2, 4],
      [8, 16],
    ]);
    expect(gridsEqual(g1, g2)).toBe(true);
  });

  it("false when ids differ (even if values match)", () => {
    const g = createGrid(2);
    g[0][0] = { id: 1, value: 2 };
    g[1][1] = { id: 2, value: 4 };
    const g2 = createGrid(2);
    g2[0][0] = { id: 99, value: 2 };
    g2[1][1] = { id: 100, value: 4 };
    expect(gridsEqual(g, g2)).toBe(false);
  });

  it("handles null cells correctly", () => {
    const g1 = createGrid(2);
    const g2 = createGrid(2);
    expect(gridsEqual(g1, g2)).toBe(true);
    g1[0][0] = { id: 1, value: 2 };
    expect(gridsEqual(g1, g2)).toBe(false);
  });
});
