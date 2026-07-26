import type { Direction } from "../core/types";

export interface InputCallbacks {
  onMove: (dir: Direction) => void;
  /** Optional: keyboard shortcuts for powerups (U=undo, S=swap, D=delete). */
  onShortcut?: (key: "undo" | "swap" | "delete") => void;
}

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

const SWIPE_THRESHOLD = 24; // px

/**
 * Wires keyboard arrows/WASD and touch swipes (on a target element) to a move
 * callback. The target is typically the board so swipes only count there.
 */
export class Input {
  private cb: InputCallbacks;
  private target: HTMLElement;
  private touchStart: { x: number; y: number } | null = null;

  constructor(target: HTMLElement, cb: InputCallbacks) {
    this.cb = cb;
    this.target = target;
    window.addEventListener("keydown", this.onKey);
    target.addEventListener("touchstart", this.onTouchStart, {
      passive: false,
    });
    target.addEventListener("touchmove", this.onTouchMove, { passive: false });
    target.addEventListener("touchend", this.onTouchEnd, { passive: false });
  }

  private onKey = (e: KeyboardEvent): void => {
    // Let users type in any future text fields.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const dir = KEY_MAP[e.key];
    if (dir) {
      e.preventDefault();
      this.cb.onMove(dir);
      return;
    }
    if (e.key === "u" || e.key === "U") this.cb.onShortcut?.("undo");
    else if (e.key === "e" || e.key === "E") this.cb.onShortcut?.("delete");
    // 's'/'d' already map to directions, so swap has no keyboard shortcut.
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.touchStart = { x: t.clientX, y: t.clientY };
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.touchStart) e.preventDefault();
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    this.touchStart = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD)
      return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.cb.onMove(dx > 0 ? "right" : "left");
    } else {
      this.cb.onMove(dy > 0 ? "down" : "up");
    }
  };

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.target.removeEventListener("touchstart", this.onTouchStart);
    this.target.removeEventListener("touchmove", this.onTouchMove);
    this.target.removeEventListener("touchend", this.onTouchEnd);
  }
}
