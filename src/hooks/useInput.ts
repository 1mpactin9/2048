// keyboard + touch input — emits directions and powerup digit keys

import { useEffect } from 'preact/hooks';
import { Direction } from '../engine/types';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: Direction.Up,
  ArrowRight: Direction.Right,
  ArrowDown: Direction.Down,
  ArrowLeft: Direction.Left,
  w: Direction.Up,
  d: Direction.Right,
  s: Direction.Down,
  a: Direction.Left,
  k: Direction.Up,
  l: Direction.Right,
  j: Direction.Down,
  h: Direction.Left,
};

const SWIPE_THRESHOLD = 10;

type Handlers = {
  onMove: (dir: Direction) => void;
  onDigit?: (n: number) => void; // 1-based powerup slot
  onNewGame?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
};

export function useInput(target: HTMLElement | null, handlers: Handlers) {
  const { onMove, onDigit, onNewGame, onEscape, enabled = true } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
      if ((e.key === 'n' || e.key === 'N' || e.key === 'r' || e.key === 'R') && onNewGame) {
        onNewGame();
        return;
      }
      if (/^[1-7]$/.test(e.key) && onDigit) {
        onDigit(Number(e.key));
        return;
      }
      const dir = KEY_MAP[e.key];
      if (dir) {
        e.preventDefault();
        onMove(dir);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onMove, onDigit, onNewGame, onEscape]);

  // touch swipe on the board element
  useEffect(() => {
    if (!enabled || !target) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };
    const onMoveTouch = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      tracking = false;
      if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? Direction.Right : Direction.Left);
      else onMove(dy > 0 ? Direction.Down : Direction.Up);
    };
    const onEnd = () => {
      tracking = false;
    };

    target.addEventListener('touchstart', onStart, { passive: true });
    target.addEventListener('touchmove', onMoveTouch, { passive: true });
    target.addEventListener('touchend', onEnd);
    return () => {
      target.removeEventListener('touchstart', onStart);
      target.removeEventListener('touchmove', onMoveTouch);
      target.removeEventListener('touchend', onEnd);
    };
  }, [enabled, target, onMove]);
}
