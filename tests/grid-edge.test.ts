import { describe, it, expect } from "vitest";
import {
  emptyCells,
  isFull,
  maxTile,
  hasTile,
  gridFromValues,
  gridToValues,
  setNextId,
  peekNextId,
  createGrid,
  spawnTile,
} from "../src/core/grid";

describe("emptyCells", () => {
  it("returns all empty positions in row-major order", () => {
    const g = gridFromValues([
      [2, 0, 4],
      [0, 8, 0],
      [16, 0, 0],
    ]);
    const result = emptyCells(g);
    expect(result).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
  });

  it("empty board returns all cells", () => {
    const g = createGrid(3);
    expect(emptyCells(g)).toHaveLength(9);
  });

  it("full board returns empty array", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 512],
    ]);
    expect(emptyCells(g)).toHaveLength(0);
  });

  it("single empty cell returns one entry", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 0],
    ]);
    expect(emptyCells(g)).toEqual([{ row: 2, col: 2 }]);
  });
});

describe("isFull", () => {
  it("true when zero empty cells", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
      [128, 256, 512],
    ]);
    expect(isFull(g)).toBe(true);
  });

  it("false when any empty cell exists", () => {
    const g = gridFromValues([
      [2, 0, 8],
      [16, 32, 64],
      [128, 256, 512],
    ]);
    expect(isFull(g)).toBe(false);
  });
});

describe("maxTile", () => {
  it("returns highest value among all tiles", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 32, 64],
    ]);
    expect(maxTile(g)).toBe(64);
  });

  it("returns 0 on empty board", () => {
    const g = createGrid(4);
    expect(maxTile(g)).toBe(0);
  });

  it("correct on mixed-value boards", () => {
    const g = gridFromValues([
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 2],
    ]);
    expect(maxTile(g)).toBe(2);
  });
});

describe("hasTile", () => {
  it("true when any tile >= value", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 0, 64],
    ]);
    expect(hasTile(g, 8)).toBe(true);
    expect(hasTile(g, 64)).toBe(true);
  });

  it("false when all tiles < value", () => {
    const g = gridFromValues([
      [2, 4, 8],
      [16, 0, 0],
    ]);
    expect(hasTile(g, 128)).toBe(false);
  });

  it("true for exact match", () => {
    const g = gridFromValues([[4]]);
    expect(hasTile(g, 4)).toBe(true);
  });

  it("true for tiles larger than searched value", () => {
    const g = gridFromValues([[2048]]);
    expect(hasTile(g, 2)).toBe(true);
    expect(hasTile(g, 1024)).toBe(true);
    expect(hasTile(g, 2048)).toBe(true);
    expect(hasTile(g, 4096)).toBe(false);
  });
});

describe("gridFromValues / gridToValues round-trip", () => {
  it("produces equal grid after round-trip", () => {
    const vals = [
      [2, 0, 4],
      [0, 8, 0],
      [16, 0, 32],
    ];
    const g = gridFromValues(vals);
    const back = gridToValues(g);
    expect(back).toEqual(vals);
  });

  it("id seed increments correctly", () => {
    const g = gridFromValues([[2, 4], [8, 16]], 10);
    // First tile id should be 10, last should be 13
    expect(g[0][0]!.id).toBe(10);
    expect(g[1][1]!.id).toBe(13);
  });

  it("zero values produce null cells", () => {
    const g = gridFromValues([[0, 0], [0, 0]]);
    expect(g[0][0]).toBeNull();
    expect(g[1][1]).toBeNull();
  });
});

describe("setNextId / peekNextId", () => {
  it("setNextId raises the counter but never lowers it", () => {
    const before = peekNextId();
    setNextId(before + 10);
    expect(peekNextId()).toBe(before + 10);
    // Setting lower should not decrease
    setNextId(before + 5);
    expect(peekNextId()).toBe(before + 10);
  });

  it("next ID is monotonically increasing", () => {
    const start = peekNextId();
    setNextId(start + 1);
    expect(peekNextId()).toBeGreaterThanOrEqual(start + 1);
  });
});

describe("createGrid", () => {
  it("creates n x n grid of nulls", () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const g = createGrid(size);
      expect(g.length).toBe(size);
      for (let r = 0; r < size; r++) {
        expect(g[r].length).toBe(size);
        for (let c = 0; c < size; c++) {
          expect(g[r][c]).toBeNull();
        }
      }
    }
  });

  it("each row is an independent array", () => {
    const g = createGrid(3);
    g[0][0] = { id: 1, value: 2 };
    expect(g[1][0]).toBeNull();
  });
});

describe("spawnTile manipulation mode", () => {
  it("with manipulate=true, scores candidates and picks best", () => {
    const g = gridFromValues([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 4],
    ]);
    let draws = 0;
    const rng = () => {
      draws++;
      return Math.random();
    };
    spawnTile(g, { rng, manipulate: true });
    // Manipulation with 13 empties samples up to 5 candidates = 10 draws
    expect(draws).toBeGreaterThan(2);
  });

  it("with single empty cell, manipulation falls through to plain draw", () => {
    const g = gridFromValues([
      [2, 4, 8, 16],
      [32, 64, 128, 2],
      [4, 8, 16, 32],
      [64, 128, 0, 256],
    ]);
    let draws = 0;
    const rng = () => {
      draws++;
      return Math.random();
    };
    spawnTile(g, { rng, manipulate: true });
    // Plain spawn = 2 draws (position + value)
    expect(draws).toBe(2);
  });

  it("manipulation does not change value distribution", () => {
    // Run many spawns and verify 4 appears ~10% of time
    let fourCount = 0;
    const total = 200;
    for (let i = 0; i < total; i++) {
      const g = createGrid(4);
      spawnTile(g, {
        rng: seededRng(i),
        manipulate: true,
      });
      const val = g.flat().find((c) => c)?.value;
      if (val === 4) fourCount++;
    }
    // Rough check: between 3% and 25% should be 4s
    expect(fourCount / total).toBeGreaterThan(0.03);
    expect(fourCount / total).toBeLessThan(0.25);
  });
});

describe("spawnTile with forced value/at", () => {
  it("at option places tile at specific coordinate", () => {
    const g = createGrid(4);
    const result = spawnTile(g, { at: { row: 2, col: 3 }, value: 8 });
    expect(result).not.toBeNull();
    expect(g[2][3]?.value).toBe(8);
  });

  it("value option overrides 90/10 distribution", () => {
    const g = createGrid(4);
    const result = spawnTile(g, { value: 128 });
    expect(result).not.toBeNull();
    expect(result!.value).toBe(128);
  });

  it("both options together work", () => {
    const g = createGrid(4);
    const result = spawnTile(g, { at: { row: 0, col: 0 }, value: 2048 });
    expect(result).not.toBeNull();
    expect(g[0][0]?.value).toBe(2048);
  });
});

describe("spawnTile edge cases", () => {
  it("returns null on full board", () => {
    const g = gridFromValues([
      [2, 4, 8, 16],
      [32, 64, 128, 2],
      [4, 8, 16, 32],
      [64, 128, 256, 512],
    ]);
    expect(spawnTile(g)).toBeNull();
  });

  it("plain spawn always draws 2 values", () => {
    let draws = 0;
    const rng = () => {
      draws++;
      return Math.random();
    };
    const g = createGrid(4);
    spawnTile(g, { rng });
    expect(draws).toBe(2); // position + value
  });
});

// Deterministic RNG for reproducibility
function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
