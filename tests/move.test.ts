import { describe, it, expect } from "vitest";
import type { Grid } from "../src/core/types";
import { move, canMove } from "../src/core/move";
import { cloneGrid, gridFromValues, gridToValues } from "../src/core/grid";

function makeGrid(rows: number[][]): Grid {
  return gridFromValues(rows);
}

function row0(row: number[]): number[][] {
  const n = row.length;
  const grid: number[][] = [];
  for (let r = 0; r < n; r++)
    grid.push(r === 0 ? [...row] : new Array(n).fill(0));
  return grid;
}

describe("move — slide and merge", () => {
  it("slides left and merges equal pairs", () => {
    const g = makeGrid(row0([2, 0, 2, 0]));
    const { grid: out, transcript } = move(g, "left");
    expect(gridToValues(out)).toEqual(row0([4, 0, 0, 0]));
    expect(transcript.moved).toBe(true);
    expect(transcript.gained).toBe(4);
  });

  it("merges at most once per tile per move", () => {
    const g = makeGrid(row0([2, 2, 2, 0]));
    expect(gridToValues(move(g, "left").grid)).toEqual(row0([4, 2, 0, 0]));
  });

  it("cascades merges correctly on a packed line", () => {
    const g = makeGrid(row0([2, 2, 4, 4]));
    const { grid: out, transcript } = move(g, "left");
    expect(gridToValues(out)).toEqual(row0([4, 8, 0, 0]));
    expect(transcript.gained).toBe(12);
  });

  it("slides right, up, and down", () => {
    const g = makeGrid(row0([2, 0, 2, 0]));
    expect(gridToValues(move(g, "right").grid)).toEqual(row0([0, 0, 0, 4]));

    const col = makeGrid([
      [2, 0],
      [2, 0],
    ]);
    expect(gridToValues(move(col, "up").grid)).toEqual([
      [4, 0],
      [0, 0],
    ]);
    expect(gridToValues(move(col, "down").grid)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it("reports moved=false when nothing changes", () => {
    const g = makeGrid(row0([2, 4, 0, 0]));
    expect(move(g, "left").transcript.moved).toBe(false);
  });

  it("does not mutate the input grid", () => {
    const g = makeGrid(row0([2, 0, 2, 0]));
    const before = gridToValues(g);
    move(g, "left");
    expect(gridToValues(g)).toEqual(before);
  });

  it("transcript marks mergedInto for absorbed tiles", () => {
    const g = makeGrid(row0([2, 0, 2, 0]));
    const { transcript } = move(g, "left");
    const survivors = transcript.moves.filter((m) => m.newValue !== undefined);
    const absorbed = transcript.moves.filter((m) => m.mergedInto !== undefined);
    expect(survivors).toHaveLength(1);
    expect(absorbed).toHaveLength(1);
    expect(absorbed[0].mergedInto).toBe(survivors[0].id);
    expect(survivors[0].newValue).toBe(4);
  });
});

describe("canMove", () => {
  it("is false when no direction changes the board", () => {
    const g = makeGrid([
      [2, 4],
      [4, 2],
    ]);
    expect(canMove(g, "left")).toBe(false);
    expect(canMove(g, "right")).toBe(false);
    expect(canMove(g, "up")).toBe(false);
    expect(canMove(g, "down")).toBe(false);
  });

  it("is true when tiles can slide into empty space or merge", () => {
    const g = makeGrid([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(canMove(g, "left")).toBe(true);
  });
});

describe("cloneGrid", () => {
  it("produces an independent copy", () => {
    const g = makeGrid([
      [2, 4],
      [8, 16],
    ]);
    const cloned = cloneGrid(g);
    cloned[0][0]!.value = 1024;
    expect(g[0][0]?.value).toBe(2);
  });
});
