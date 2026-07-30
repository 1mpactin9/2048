import type { Direction } from "../types/game";

export interface InputHandlers {
  move: (dir: Direction) => void;
  newGame: () => void;
  undo: () => void;
  swap: () => void;
  delete: () => void;
}

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  i: "up",
  k: "down",
  j: "left",
  l: "right",
};

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function attachKeyboard(handlers: InputHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    const dir = KEY_TO_DIR[key];
    if (dir) {
      e.preventDefault();
      handlers.move(dir);
      return;
    }

    switch (key) {
      case "n":
      case "r":
        handlers.newGame();
        break;
      case "1":
        handlers.undo();
        break;
      case "2":
        handlers.swap();
        break;
      case "3":
        handlers.delete();
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

const SWIPE_THRESHOLD = 24;

export function attachTouch(
  el: HTMLElement,
  onSwipe: (dir: Direction) => void,
): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  };

  const onEnd = (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < SWIPE_THRESHOLD) return;
    if (absX > absY) onSwipe(dx > 0 ? "right" : "left");
    else onSwipe(dy > 0 ? "down" : "up");
  };

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchend", onEnd, { passive: true });
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchend", onEnd);
  };
}