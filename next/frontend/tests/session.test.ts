import { describe, it, expect } from "vitest";
import { GameSession } from "../src/lib/game/session";
import { gridFromValues, gridToValues } from "../src/lib/game/grid";
import { makeRng } from "../src/lib/game/rng";

function fixedSession(values: number[][], mode: "standard" | "classic" | "plus" = "standard") {
  const s = GameSession.newGame(values.length, mode, 0, makeRng("seed"));
  s.state.grid = gridFromValues(values);
  s.state.history = [];
  return s;
}

describe("undo", () => {
  it("restores previous grid and decrements charge", () => {
    const s = fixedSession([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const before = gridToValues(s.state.grid);
    s.applyMove("left");
    expect(gridToValues(s.state.grid)).not.toEqual(before);
    const ok = s.undo();
    expect(ok).toBe(true);
    expect(gridToValues(s.state.grid)).toEqual(before);
    expect(s.state.powerups.undo).toBe(1);
  });

  it("is disabled in classic mode", () => {
    const s = fixedSession(
      [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      "classic",
    );
    s.applyMove("left");
    expect(s.undo()).toBe(false);
  });
});

describe("swap", () => {
  it("swaps two tiles and decrements charge", () => {
    const s = fixedSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const ok = s.swap(0, 0, 0, 1);
    expect(ok).toBe(true);
    expect(gridToValues(s.state.grid)[0].slice(0, 2)).toEqual([4, 2]);
    expect(s.state.powerups.swap).toBe(1);
  });

  it("rejects swapping an empty cell", () => {
    const s = fixedSession([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(false);
  });
});

describe("delete", () => {
  it("removes a tile and decrements charge", () => {
    const s = fixedSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const ok = s.deleteTile(0, 0);
    expect(ok).toBe(true);
    expect(s.state.grid[0][0]).toBeNull();
    expect(s.state.powerups.delete).toBe(1);
  });
});

describe("win / over", () => {
  it("marks win when 2048 is reached", () => {
    const s = fixedSession([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("left");
    expect(s.state.won).toBe(true);
  });

  it("marks over when no moves remain", () => {
    const s = fixedSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    s.applyMove("left");
    expect(s.state.over).toBe(true);
  });
});
