import { describe, it, expect } from "vitest";
import type { GameMode, GameState } from "../src/core/types";
import { POWERUP_QUOTA } from "../src/core/constants";
import { gridFromValues, gridToValues } from "../src/core/grid";
import { GameSession, restoreSession } from "../src/core/session";

function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function row0(row: number[]): number[][] {
  const n = row.length;
  const grid: number[][] = [];
  for (let r = 0; r < n; r++)
    grid.push(r === 0 ? [...row] : new Array(n).fill(0));
  return grid;
}

function makeSession(
  values: number[][],
  mode: GameMode = "standard",
  rng?: () => number,
): GameSession {
  const grid = gridFromValues(values);
  const size = values.length;
  const powerups =
    mode === "standard"
      ? { ...POWERUP_QUOTA }
      : { undo: 0, swap: 0, delete: 0 };
  const state: GameState = {
    size,
    mode,
    grid,
    score: 0,
    best: 0,
    powerups,
    won: false,
    wonAcknowledged: false,
    over: false,
    history: [],
    moveCount: 0,
    deltaHistory: [],
  };
  return new GameSession(state, rng);
}

describe("GameSession.newGame", () => {
  it("spawns exactly two tiles on a fresh board", () => {
    const s = GameSession.newGame(4, "standard", 0, seededRng());
    expect(s.state.grid.flat().filter(Boolean).length).toBe(2);
  });

  it("starts with full powerup quota in standard, zero in classic", () => {
    expect(GameSession.newGame(4, "standard").state.powerups).toEqual({
      undo: 2,
      swap: 2,
      delete: 2,
    });
    expect(GameSession.newGame(4, "classic").state.powerups).toEqual({
      undo: 0,
      swap: 0,
      delete: 0,
    });
  });

  it("respects custom board sizes and best score", () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const s = GameSession.newGame(size, "standard", 0, seededRng());
      expect(s.state.size).toBe(size);
      expect(s.state.grid.length).toBe(size);
    }
    expect(GameSession.newGame(4, "standard", 9999).state.best).toBe(9999);
  });

  it("generates an 8-element RNG seed when no custom rng provided", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.rngSeed).toBeDefined();
    expect(s.state.rngSeed!.length).toBe(8);
  });
});

describe("GameSession.applyMove", () => {
  it("spawns exactly one tile after a successful move", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.grid.flat().filter(Boolean).length).toBe(2);
  });

  it("accumulates score and updates best", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.score).toBe(4);
    expect(s.state.best).toBe(4);
  });

  it("detects a win at 2048 and persists after acknowledgement", () => {
    const s = makeSession(row0([1024, 1024, 0, 0]));
    s.applyMove("left");
    expect(s.state.won).toBe(true);
    s.acknowledgeWin();
    expect(s.state.won).toBe(true);
    expect(s.state.wonAcknowledged).toBe(true);
  });

  it("flags game over on a stuck full board", () => {
    const s = makeSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    s.applyMove("left");
    expect(s.state.over).toBe(true);
  });

  it("returns null on a no-op move and does not spawn", () => {
    const s = makeSession(row0([2, 4, 0, 0]));
    const before = s.state.grid.flat().filter(Boolean).length;
    expect(s.applyMove("left")).toBeNull();
    expect(s.state.grid.flat().filter(Boolean).length).toBe(before);
  });

  it("increments moveCount on each move", () => {
    const s = makeSession(row0([2, 2, 0, 0]));
    s.applyMove("left");
    expect(s.state.moveCount).toBe(1);
  });
});

describe("GameSession — powerups", () => {
  it("undo reverts the last move and consumes a charge", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.undo()).toBe(true);
    expect(s.state.powerups.undo).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual(row0([2, 0, 2, 0]));
    expect(s.state.score).toBe(0);
  });

  it("undo fails with no charge, no history, or in classic mode", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.undo()).toBe(false);
    s.state.powerups.undo = 0;
    s.applyMove("left");
    expect(s.undo()).toBe(false);
    const classic = makeSession(row0([2, 0, 2, 0]), "classic");
    classic.applyMove("left");
    expect(classic.undo()).toBe(false);
  });

  it("swap exchanges two occupied cells and consumes a charge", () => {
    const s = makeSession([
      [2, 4],
      [0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(true);
    expect(s.state.powerups.swap).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [4, 2],
      [0, 0],
    ]);
  });

  it("swap refuses empty cells, same cell, or classic mode", () => {
    const s = makeSession([
      [2, 0],
      [0, 0],
    ]);
    expect(s.swap(0, 0, 0, 1)).toBe(false);
    expect(s.swap(0, 0, 0, 0)).toBe(false);
    const classic = makeSession(row0([2, 0, 2, 0]), "classic");
    expect(classic.swap(0, 0, 0, 2)).toBe(false);
  });

  it("delete removes a tile and consumes a charge", () => {
    const s = makeSession([
      [2, 4],
      [0, 0],
    ]);
    expect(s.deleteTile(0, 1)).toBe(true);
    expect(s.state.powerups.delete).toBe(1);
    expect(gridToValues(s.state.grid)).toEqual([
      [2, 0],
      [0, 0],
    ]);
  });

  it("delete refuses empty cells, classic mode, or zero charges", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.deleteTile(0, 1)).toBe(false);
    s.state.powerups.delete = 0;
    expect(s.deleteTile(0, 0)).toBe(false);
  });
});

describe("GameSession — toContext and setRngManipulation", () => {
  it("toContext exposes grid, size, score, powerups, and rng state", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    const ctx = s.toContext();
    expect(ctx.size).toBe(4);
    expect(ctx.score).toBe(4);
    expect(ctx.rngSeed).toBeDefined();
    expect(typeof ctx.rngCalls).toBe("number");
  });

  it("setRngManipulation toggles the manipulate flag", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.setRngManipulation(true);
    expect(s.toContext().manipulate).toBe(true);
    s.setRngManipulation(false);
    expect(s.toContext().manipulate).toBe(false);
  });
});

describe("restoreSession", () => {
  it("rebuilds a session from persisted state", () => {
    const original = makeSession(row0([2, 0, 2, 0]));
    original.applyMove("left");
    const restored = restoreSession(original.state);
    expect(restored.state.size).toBe(4);
    expect(restored.state.score).toBe(original.state.score);
  });

  it("initializes deltaHistory if missing", () => {
    const grid = gridFromValues([
      [2, 0],
      [0, 4],
    ]);
    const state: GameState = {
      size: 2,
      mode: "standard",
      grid,
      score: 0,
      best: 0,
      powerups: { ...POWERUP_QUOTA },
      won: false,
      wonAcknowledged: false,
      over: false,
      history: [],
      moveCount: 0,
    };
    const s = restoreSession(state);
    expect(s.state.deltaHistory).toBeDefined();
    expect(Array.isArray(s.state.deltaHistory)).toBe(true);
  });
});
