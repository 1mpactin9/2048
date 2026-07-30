import { describe, it, expect, vi, afterEach } from "vitest";
import { attachKeyboard } from "../src/lib/context/input";
import type { Direction } from "../src/lib/types/game";

function makeHandlers() {
  return {
    moves: [] as Direction[],
    newGame: vi.fn(),
    undo: vi.fn(),
    swap: vi.fn(),
    delete: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function press(key: string, target?: EventTarget) {
  const ev = new KeyboardEvent("keydown", { key, cancelable: true });
  if (target) Object.defineProperty(ev, "target", { value: target });
  window.dispatchEvent(ev);
}

describe("keyboard input", () => {
  it("maps arrows, WASD, and IJKL to directions", () => {
    const h = makeHandlers();
    const detach = attachKeyboard({
      move: (d) => h.moves.push(d),
      newGame: h.newGame,
      undo: h.undo,
      swap: h.swap,
      delete: h.delete,
    });

    press("ArrowUp");
    press("a");
    press("s");
    press("l");
    press("ArrowRight");

    expect(h.moves).toEqual(["up", "left", "down", "right", "right"]);
    detach();
  });

  it("maps action keys", () => {
    const h = makeHandlers();
    const detach = attachKeyboard({
      move: (d) => h.moves.push(d),
      newGame: h.newGame,
      undo: h.undo,
      swap: h.swap,
      delete: h.delete,
    });

    press("n");
    press("1");
    press("2");
    press("3");

    expect(h.newGame).toHaveBeenCalledOnce();
    expect(h.undo).toHaveBeenCalledOnce();
    expect(h.swap).toHaveBeenCalledOnce();
    expect(h.delete).toHaveBeenCalledOnce();
    detach();
  });

  it("ignores input from editable elements", () => {
    const h = makeHandlers();
    const detach = attachKeyboard({
      move: (d) => h.moves.push(d),
      newGame: h.newGame,
      undo: h.undo,
      swap: h.swap,
      delete: h.delete,
    });

    const input = document.createElement("input");
    press("ArrowUp", input);
    expect(h.moves).toEqual([]);
    detach();
  });

  it("stops listening after detach", () => {
    const h = makeHandlers();
    const detach = attachKeyboard({
      move: (d) => h.moves.push(d),
      newGame: h.newGame,
      undo: h.undo,
      swap: h.swap,
      delete: h.delete,
    });
    detach();
    press("ArrowUp");
    expect(h.moves).toEqual([]);
  });
});
