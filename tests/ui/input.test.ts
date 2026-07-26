/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Input } from "@/ui/input";
import type { Direction } from "@/core/types";

describe("Input — keyboard mapping", () => {
  let target: HTMLElement;
  let onMove: ReturnType<typeof vi.fn>;
  let onShortcut: ReturnType<typeof vi.fn>;
  let input: Input;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    onMove = vi.fn();
    onShortcut = vi.fn();
    input = new Input(target, { onMove, onShortcut });
  });

  afterEach(() => {
    input.destroy();
    target.remove();
    vi.restoreAllMocks();
  });

  it("Arrow keys map to correct Directions", () => {
    const dirs: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    for (const [key, dir] of Object.entries(dirs)) {
      onMove.mockClear();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      expect(onMove).toHaveBeenCalledWith(dir);
    }
  });

  it("WASD maps correctly (lowercase)", () => {
    const map: Record<string, Direction> = {
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    };
    for (const [key, dir] of Object.entries(map)) {
      onMove.mockClear();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      expect(onMove).toHaveBeenCalledWith(dir);
    }
  });

  it("WASD maps correctly (uppercase)", () => {
    const map: Record<string, Direction> = {
      W: "up",
      S: "down",
      A: "left",
      D: "right",
    };
    for (const [key, dir] of Object.entries(map)) {
      onMove.mockClear();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      expect(onMove).toHaveBeenCalledWith(dir);
    }
  });

  it("non-direction keys do not trigger onMove", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", bubbles: true }),
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it("Input/Textarea focus prevents movement", () => {
    const inputEl = document.createElement("input");
    document.body.appendChild(inputEl);
    inputEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(onMove).not.toHaveBeenCalled();
    inputEl.remove();
  });

  it("shortcut U triggers undo", () => {
    onShortcut.mockClear();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "u", bubbles: true }),
    );
    expect(onShortcut).toHaveBeenCalledWith("undo");
  });

  it("shortcut E triggers delete", () => {
    onShortcut.mockClear();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "e", bubbles: true }),
    );
    expect(onShortcut).toHaveBeenCalledWith("delete");
  });

  it("destroy removes event listeners", () => {
    input.destroy();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("Input — touch swipe detection", () => {
  let target: HTMLElement;
  let onMove: ReturnType<typeof vi.fn>;
  let input: Input;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    onMove = vi.fn();
    input = new Input(target, { onMove });
  });

  afterEach(() => {
    input.destroy();
    target.remove();
    vi.restoreAllMocks();
  });

  it("horizontal swipe right triggers right direction", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("right");
  });

  it("horizontal swipe left triggers left direction", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 200, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("left");
  });

  it("vertical swipe down triggers down direction", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 100, clientY: 200 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("down");
  });

  it("vertical swipe up triggers up direction", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 200 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("up");
  });

  it("below SWIPE_THRESHOLD (24px) does not trigger", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 110, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it("dominant axis determines direction on diagonal swipe", () => {
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 120 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).toHaveBeenCalledWith("right");
  });

  it("destroy removes event listeners", () => {
    input.destroy();
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 100 } as Touch],
      } as TouchEventInit),
    );
    expect(onMove).not.toHaveBeenCalled();
  });
});
