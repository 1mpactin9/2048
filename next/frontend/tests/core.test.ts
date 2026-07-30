import { describe, it, expect } from "vitest";
import { GameSession } from "../src/lib/game/session";
import { move, canMove } from "../src/lib/game/move";
import { gridFromValues, gridToValues, hasMoves, maxTile } from "../src/lib/game/grid";
import { makeRng } from "../src/lib/game/rng";

describe("grid mechanics", () => {
  it("slides tiles left", () => {
    const grid = gridFromValues([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: next, transcript } = move(grid, "left");
    expect(gridToValues(next)[0]).toEqual([4, 0, 0, 0]);
    expect(transcript.gained).toBe(4);
    expect(transcript.moved).toBe(true);
  });

  it("does not merge twice in one move", () => {
    const grid = gridFromValues([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { grid: next, transcript } = move(grid, "left");
    expect(gridToValues(next)[0]).toEqual([4, 4, 0, 0]);
    expect(transcript.gained).toBe(8);
  });

  it("reports no move when nothing changes", () => {
    const grid = gridFromValues([
      [2, 4, 8, 16],
      [4, 8, 16, 32],
      [8, 16, 32, 64],
      [16, 32, 64, 128],
    ]);
    expect(canMove(grid, "left")).toBe(false);
  });

  it("detects available moves and max tile", () => {
    const grid = gridFromValues([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 8],
    ]);
    expect(hasMoves(grid)).toBe(false);
    expect(maxTile(grid)).toBe(8);
  });
});

describe("game session", () => {
  it("starts with two tiles", () => {
    const s = GameSession.newGame(4, "standard", 0, makeRng("seed-a"));
    const count = s.state.grid.flat().filter(Boolean).length;
    expect(count).toBe(2);
  });

  it("is deterministic for a fixed seed", () => {
    const a = GameSession.newGame(4, "standard", 0, makeRng("seed-x"));
    const b = GameSession.newGame(4, "standard", 0, makeRng("seed-x"));
    expect(gridToValues(a.state.grid)).toEqual(gridToValues(b.state.grid));
  });

  it("gives standard mode powerups", () => {
    const s = GameSession.newGame(4, "standard", 0, makeRng("seed-b"));
    expect(s.state.powerups).toEqual({ undo: 2, swap: 2, delete: 2 });
  });

  it("gives classic mode no powerups", () => {
    const s = GameSession.newGame(4, "classic", 0, makeRng("seed-b"));
    expect(s.state.powerups).toEqual({ undo: 0, swap: 0, delete: 0 });
    expect(s.canUndo).toBe(false);
    expect(s.canSwap).toBe(false);
    expect(s.canDelete).toBe(false);
  });

  it("gives plus mode extra powerups", () => {
    const s = GameSession.newGame(4, "plus", 0, makeRng("seed-b"));
    expect(s.state.powerups).toEqual({ undo: 3, swap: 3, delete: 3 });
  });

  it("tracks best score", () => {
    const s = GameSession.newGame(4, "standard", 0, makeRng("seed-c"));
    for (const d of ["up", "down", "left", "right"] as const) s.applyMove(d);
    expect(s.state.best).toBeGreaterThanOrEqual(s.state.score);
  });
});
