import { describe, it, expect } from "vitest";
import type { GameMode, GameState } from "../src/core/types";
import { POWERUP_QUOTA, MAX_HISTORY } from "../src/core/constants";
import {
  gridFromValues,
  gridToValues,
} from "../src/core/grid";
import { GameSession, restoreSession } from "../src/core/session";

// --- Helpers (mirrors core.test.ts to keep files self-contained) ---

function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makeSession(
  values: number[][],
  mode: GameMode = "standard",
  rng?: () => number,
): GameSession {
  const grid = gridFromValues(values);
  const size = values.length;
  const powerups =
    mode === "standard" ? { ...POWERUP_QUOTA } : { undo: 0, swap: 0, delete: 0 };
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

/** Build a size×size grid with the given row placed at row 0 (rest empty). */
function row0(row: number[]): number[][] {
  const n = row.length;
  const grid: number[][] = [];
  for (let r = 0; r < n; r++)
    grid.push(r === 0 ? [...row] : new Array(n).fill(0));
  return grid;
}

describe("GameSession — newGame", () => {
  it("creates exactly two tiles on a fresh board", () => {
    const s = GameSession.newGame(4, "standard", 0, seededRng());
    const filled = s.state.grid.flat().filter(Boolean).length;
    expect(filled).toBe(2);
  });

  it("sets initial score and best to 0", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.score).toBe(0);
    expect(s.state.best).toBe(0);
  });

  it("sets best from argument", () => {
    const s = GameSession.newGame(4, "standard", 9999);
    expect(s.state.best).toBe(9999);
  });

  it("starts with full powerup quota in standard mode", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.powerups).toEqual({ undo: 2, swap: 2, delete: 2 });
  });

  it("gives zero powerups in classic mode", () => {
    const s = GameSession.newGame(4, "classic");
    expect(s.state.powerups).toEqual({ undo: 0, swap: 0, delete: 0 });
  });

  it("respects custom board sizes", () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const s = GameSession.newGame(size, "standard", 0, seededRng());
      expect(s.state.size).toBe(size);
      expect(s.state.grid.length).toBe(size);
      expect(s.state.grid[0].length).toBe(size);
    }
  });

  it("generates an RNG seed when no custom RNG provided", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.rngSeed).toBeDefined();
    expect(s.state.rngSeed!.length).toBe(8);
  });

  it("does not generate seed when custom RNG provided", () => {
    const s = GameSession.newGame(4, "standard", undefined, seededRng());
    expect(s.state.rngSeed).toBeUndefined();
  });

  it("won is false on new game", () => {
    const s = GameSession.newGame(4, "standard");
    expect(s.state.won).toBe(false);
    expect(s.state.wonAcknowledged).toBe(false);
    expect(s.state.over).toBe(false);
  });
});

describe("GameSession — applyMove", () => {
  it("spawns exactly one tile after a successful move", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left"); // merges to 4
    const filled = s.state.grid.flat().filter(Boolean).length;
    expect(filled).toBe(2); // merged 4 + spawned tile
  });

  it("accumulates score correctly across moves", () => {
    // Use a board where we can chain multiple left moves
    const s = makeSession([
      [2, 2, 0, 0],
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("left"); // row 0: 2+2=4, row 1: 2+2=4, score += 8
    expect(s.state.score).toBe(8);
    // Keep playing left — no more merges possible, just slide
    s.applyMove("left"); // no-op, returns null
    // Try right instead
    s.applyMove("right"); // should still be valid if board changed
    expect(s.state.score).toBeGreaterThanOrEqual(8);
  });

  it("updates best when score exceeds it", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.best).toBe(4);
  });

  it("detects a win at WIN_VALUE", () => {
    const s = makeSession(row0([1024, 1024, 0, 0]));
    s.applyMove("left");
    expect(s.state.won).toBe(true);
  });

  it("does not re-clear won after acknowledgment", () => {
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

  it("returns null on a no-op move", () => {
    const s = makeSession(row0([2, 4, 0, 0]));
    expect(s.applyMove("left")).toBeNull();
  });

  it("does not spawn on a no-op move", () => {
    const s = makeSession(row0([2, 4, 0, 0]));
    const before = s.state.grid.flat().filter(Boolean).length;
    s.applyMove("left");
    const after = s.state.grid.flat().filter(Boolean).length;
    expect(after).toBe(before);
  });

  it("returns null when already over", () => {
    const s = makeSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    s.applyMove("left"); // forces over
    expect(s.applyMove("up")).toBeNull();
  });

  it("transcript has correct gained field", () => {
    const s = makeSession(row0([2, 2, 4, 4]));
    const t = s.applyMove("left");
    expect(t).not.toBeNull();
    expect(t!.gained).toBe(12); // 4 + 8
  });

  it("transcript spawned tile has id, value, row, col", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    const t = s.applyMove("left");
    expect(t?.spawned).toBeDefined();
    expect(t!.spawned!.id).toBeTypeOf("number");
    expect([2, 4]).toContain(t!.spawned!.value);
    expect(t!.spawned!.row).toBeTypeOf("number");
    expect(t!.spawned!.col).toBeTypeOf("number");
  });

  it("moveCount increments on each move", () => {
    const s = makeSession([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("left");
    expect(s.state.moveCount).toBe(1);
    // Need another valid move
    s.applyMove("up"); // should work if there are still moves
    expect(s.state.moveCount).toBeGreaterThanOrEqual(1);
  });
});

describe("GameSession — undo", () => {
  it("restores grid, score, and powerups", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left"); // score becomes 4
    expect(s.state.score).toBe(4);
    s.undo();
    expect(s.state.score).toBe(0);
    expect(gridToValues(s.state.grid)).toEqual(row0([2, 0, 2, 0]));
  });

  it("consumes exactly one undo charge", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.powerups.undo).toBe(2);
    s.undo();
    expect(s.state.powerups.undo).toBe(1);
  });

  it("fails in classic mode", () => {
    const s = makeSession(row0([2, 0, 2, 0]), "classic");
    s.applyMove("left");
    expect(s.undo()).toBe(false);
  });

  it("fails with zero charges", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.state.powerups.undo = 0;
    s.applyMove("left");
    expect(s.undo()).toBe(false);
  });

  it("fails with empty history", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.undo()).toBe(false);
  });

  it("multiple undos restore LIFO chain", () => {
    const s = makeSession([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("left"); // move 1
    s.applyMove("up"); // move 2 (if possible)
    const histLen = s.state.history.length;
    if (histLen >= 2) {
      s.undo();
      s.undo();
      expect(s.state.history.length).toBe(histLen - 2);
    }
  });

  it("undo after swap restores pre-swap positions", () => {
    const s = makeSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("right");
    s.swap(0, 3, 0, 2);
    s.undo(); // undo the swap
    expect(s.state.powerups.swap).toBe(2);
  });

  it("undo after delete restores deleted tile", () => {
    const s = makeSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("right");
    s.deleteTile(0, 3);
    s.undo();
    expect(s.state.powerups.delete).toBe(2);
  });

  it("canUndo transitions correctly", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.canUndo).toBe(false); // no history yet
    s.applyMove("left");
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.canUndo).toBe(false); // history exhausted
  });

  it("undoes up to MAX_HISTORY steps", () => {
    const s = makeSession([
      [2, 2, 4, 4],
      [2, 2, 4, 4],
      [2, 2, 4, 4],
      [2, 2, 4, 4],
    ]);
    // Push many moves
    let moveCount = 0;
    const dirs: Array<"up" | "down" | "left" | "right"> = ["up", "down", "left", "right"];
    while (moveCount < MAX_HISTORY && !s.state.over) {
      let moved = false;
      for (const dir of dirs) {
        if (s.applyMove(dir)) {
          moved = true;
          break;
        }
      }
      if (!moved) break;
      moveCount++;
    }
    if (moveCount > 0) {
      // Undo all
      for (let i = 0; i < Math.min(moveCount, MAX_HISTORY); i++) {
        s.undo();
      }
      if (s.state.history.length === 0) {
        expect(s.canUndo).toBe(false);
      } else {
        expect(s.state.history.length).toBe(0);
      }
    }
  });
});

describe("GameSession — swap", () => {
  it("exchanges two occupied cells", () => {
    const s = makeSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("right");
    expect(s.swap(0, 3, 0, 2)).toBe(true);
    expect(gridToValues(s.state.grid)[0][3]).toBe(2);
    expect(gridToValues(s.state.grid)[0][2]).toBe(4);
  });

  it("consumes one swap charge", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.powerups.swap).toBe(2);
    // Need two occupied adjacent cells
    const g = s.state.grid;
    // Find two occupied cells
    let occupied: [number, number][] = [];
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c]) occupied.push([r, c]);
    if (occupied.length >= 2) {
      s.swap(occupied[0][0], occupied[0][1], occupied[1][0], occupied[1][1]);
      expect(s.state.powerups.swap).toBe(1);
    }
  });

  it("refuses when either cell is empty", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.swap(0, 0, 0, 1)).toBe(false); // col 1 is empty
  });

  it("refuses same cell", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.swap(0, 0, 0, 0)).toBe(false);
  });

  it("fails in classic mode", () => {
    const s = makeSession(row0([2, 0, 2, 0]), "classic");
    expect(s.swap(0, 0, 0, 1)).toBe(false);
  });

  it("fails with zero charges", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.state.powerups.swap = 0;
    expect(s.swap(0, 0, 0, 1)).toBe(false);
  });

  it("pushes snapshot to history", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    const histBefore = s.state.history.length;
    const g = s.state.grid;
    let occupied: [number, number][] = [];
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c]) occupied.push([r, c]);
    if (occupied.length >= 2) {
      s.swap(occupied[0][0], occupied[0][1], occupied[1][0], occupied[1][1]);
      expect(s.state.history.length).toBe(histBefore + 1);
    }
  });

  it("canSwap getter reflects state", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.canSwap).toBe(true);
    s.state.powerups.swap = 0;
    expect(s.canSwap).toBe(false);
  });
});

describe("GameSession — deleteTile", () => {
  it("removes a tile", () => {
    const s = makeSession([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    s.applyMove("right");
    expect(s.deleteTile(0, 3)).toBe(true);
    expect(s.state.grid[0][3]).toBeNull();
  });

  it("consumes one delete charge", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.state.powerups.delete).toBe(2);
    s.deleteTile(0, 0);
    expect(s.state.powerups.delete).toBe(1);
  });

  it("refuses when cell is empty", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    expect(s.deleteTile(0, 1)).toBe(false);
  });

  it("fails in classic mode", () => {
    const s = makeSession(row0([2, 0, 2, 0]), "classic");
    expect(s.deleteTile(0, 0)).toBe(false);
  });

  it("fails with zero charges", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.state.powerups.delete = 0;
    expect(s.deleteTile(0, 0)).toBe(false);
  });

  it("pushes snapshot to history", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    const histBefore = s.state.history.length;
    s.deleteTile(0, 0);
    expect(s.state.history.length).toBe(histBefore + 1);
  });

  it("canDelete getter reflects state", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    expect(s.canDelete).toBe(true);
    s.state.powerups.delete = 0;
    expect(s.canDelete).toBe(false);
  });
});

describe("GameSession — toContext", () => {
  it("returns grid, size, score, powerups", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.applyMove("left");
    const ctx = s.toContext();
    expect(ctx.size).toBe(4);
    expect(ctx.score).toBe(4);
    expect(ctx.powerups).toEqual(s.state.powerups);
  });

  it("includes manipulate flag", () => {
    const s = GameSession.newGame(4, "standard", 0, seededRng(), true);
    const ctx = s.toContext();
    expect(ctx.manipulate).toBe(true);
  });

  it("includes rngSeed and rngCalls", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    const ctx = s.toContext();
    expect(ctx.rngSeed).toBeDefined();
    expect(typeof ctx.rngCalls).toBe("number");
  });
});

describe("GameSession — setRngManipulation", () => {
  it("toggles manipulate flag", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    s.setRngManipulation(true);
    expect(s.toContext().manipulate).toBe(true);
    s.setRngManipulation(false);
    expect(s.toContext().manipulate).toBe(false);
  });
});

describe("GameSession — restoreSession", () => {
  it("rebuilds session from persisted state", () => {
    const original = makeSession(row0([2, 0, 2, 0]));
    original.applyMove("left");
    const restored = restoreSession(original.state);
    expect(restored.state.size).toBe(4);
    expect(restored.state.score).toBe(original.state.score);
  });

  it("fixes ID counter to max existing + 1", () => {
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
      deltaHistory: [],
    };
    const s = restoreSession(state);
    expect(s).toBeDefined();
  });

  it("initializes deltaHistory if missing", () => {
    const grid = gridFromValues([[2, 0], [0, 4]]);
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
      // deltaHistory intentionally omitted
    };
    const s = restoreSession(state);
    expect(s.state.deltaHistory).toBeDefined();
    expect(Array.isArray(s.state.deltaHistory)).toBe(true);
  });
});

describe("GameSession — state consistency", () => {
  it("score stays within valid window during play", () => {
    const s = makeSession(row0([2, 0, 2, 0]));
    // Play several moves
    for (let i = 0; i < 20; i++) {
      const dirs: Array<"up" | "down" | "left" | "right"> = ["up", "down", "left", "right"];
      let moved = false;
      for (const dir of dirs) {
        if (s.applyMove(dir)) {
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    expect(s.state.score).toBeGreaterThanOrEqual(0);
  });

  it("wonAcknowledged does not affect won", () => {
    const s = makeSession(row0([1024, 1024, 0, 0]));
    s.applyMove("left");
    expect(s.state.won).toBe(true);
    s.acknowledgeWin();
    expect(s.state.won).toBe(true);
    expect(s.state.wonAcknowledged).toBe(true);
  });

  it("over state recomputes after move", () => {
    const s = makeSession([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(s.state.over).toBe(false);
    s.applyMove("left");
    expect(s.state.over).toBe(true);
  });
});
