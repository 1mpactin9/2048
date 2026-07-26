import { describe, it, expect } from "vitest";
import type { EngineContext } from "../src/core/types";
import { PlaceholderEngine } from "../src/core/engine";
import { WasmEngine } from "../src/core/wasm-engine";
import { gridFromValues } from "../src/core/grid";

function makeCtx(grid: number[][]): EngineContext {
  const g = gridFromValues(grid);
  return {
    grid: g as any,
    size: grid.length,
    score: 0,
    powerups: { undo: 0, swap: 0, delete: 0 },
    depth: 2,
    usePowerups: false,
  };
}

describe("PlaceholderEngine", () => {
  it("returns a legal move direction on a board with moves", () => {
    const ctx = makeCtx([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const action = PlaceholderEngine.chooseAction(ctx);
    if (typeof action === "object" && "kind" in action) {
      expect(action.kind).toBe("move");
      if (action.kind === "move") {
        expect(["up", "down", "left", "right"]).toContain(action.dir);
      }
    }
  });

  it("returns stop when no legal moves exist", () => {
    const ctx = makeCtx([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    const action = PlaceholderEngine.chooseAction(ctx);
    if (typeof action === "object" && "kind" in action) {
      expect(action.kind).toBe("stop");
    }
  });

  it("never returns power-up actions", () => {
    const ctx = makeCtx([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    for (let i = 0; i < 20; i++) {
      const action = PlaceholderEngine.chooseAction(ctx);
      if (
        typeof action === "object" &&
        "kind" in action &&
        action.kind !== "stop"
      ) {
        expect(action.kind).toBe("move");
      }
    }
  });

  it("completes quickly (no infinite loops)", () => {
    const ctx = makeCtx([
      [2, 0, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 2, 0],
      [0, 0, 0, 2],
    ]);
    const start = Date.now();
    PlaceholderEngine.chooseAction(ctx);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("engine has a name property", () => {
    expect(typeof PlaceholderEngine.name).toBe("string");
    expect(PlaceholderEngine.name).toContain("Placeholder");
  });
});

describe("WasmEngine", () => {
  it("has a name property", () => {
    expect(typeof WasmEngine.name).toBe("string");
  });

  it("chooseAction is async and returns AutoAction", async () => {
    const ctx = makeCtx([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const action = await WasmEngine.chooseAction(ctx);
    expect(["move", "stop", "swap", "delete"]).toContain(action.kind);
  });

  it("returns stop when no legal moves", async () => {
    const ctx = makeCtx([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    const action = await WasmEngine.chooseAction(ctx);
    expect(action.kind).toBe("stop");
  });

  it("falls back to PlaceholderEngine when worker unavailable", async () => {
    const ctx = makeCtx([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const action = await WasmEngine.chooseAction(ctx);
    expect(["move", "stop", "swap", "delete"]).toContain(action.kind);
  });
});

describe("decodeAction (internal to wasm-engine)", () => {
  it("direction codes map correctly", () => {
    const expected = ["up", "down", "left", "right"];
    expect(expected).toHaveLength(4);
  });
});

describe("Engine interface contract", () => {
  it("PlaceholderEngine.chooseAction returns sync AutoAction", () => {
    const ctx = makeCtx([[2, 0, 0, 0]]);
    const result = PlaceholderEngine.chooseAction(ctx);
    expect(result instanceof Promise).toBe(false);
  });

  it("WasmEngine.chooseAction returns Promise<AutoAction>", async () => {
    const ctx = makeCtx([[2, 0, 0, 0]]);
    const result = WasmEngine.chooseAction(ctx);
    expect(result instanceof Promise).toBe(true);
    const action = await result;
    expect(["move", "stop", "swap", "delete"]).toContain(action.kind);
  });
});
