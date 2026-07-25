import type { Direction } from './core/types';
import type { ValidationResult } from './core/validate';
import { App } from './ui/app';
import './styles/main.css';

declare global {
  interface Window {
    __app?: App;
    __runAutoLoop: (score: number) => void;
    /** Developer console — call from browser DevTools. */
    __dev: {
      undo(steps?: number): void;
      delete(row: number, col: number): void;
      deleteValue(n: number): void;
      swap(r1: number, c1: number, r2: number, c2: number): void;
      addTiles(n?: number): void;
      add(a: number, b?: number, c?: number, d?: number): void;
      clear(): void;
      fill(val?: number): void;
      score(n: number): void;
      max(row: number, col: number, val?: number): void;
      moves(n: number): void;
      cheat(dir: Direction): void;
      fillPowerups(): void;
      win(): void;
      noDelay(): void;
      nextNumber(): number;
      nextLocation(): { row: number; col: number };
      validate(): ValidationResult | undefined;
      updatePosition(): { from: number; to: number; min: number; max: number; changed: boolean } | undefined;
      bypassValidation(valueFirst?: boolean): { feasible: boolean; removed: number; totalValue: number; heuristic: boolean; valid: boolean } | undefined;
      help(): void;
      /** Recover from NaN best score. */
      fixBest(): void;
      /** Ensure score matches current position (also fixes NaN best). */
      refreshScore(): { from: number; to: number; min: number; max: number; changed: boolean; tileCount: number; scoreFromMerges: number } | undefined;
      /** Explicitly toggle Play Again bar visibility based on board dead state. */
      refreshPlayAgainStatus(): void;
      /** Periodic logger — executes a function/expression at an interval and logs results. Returns an ID for later cancellation. */
      log(fn: (...args: unknown[]) => unknown, intervalMs?: number): number;
      /** Stop a specific or all periodic loggers. Pass an ID to stop one, omit to stop all. */
      stopLog(id?: number): void;
      /** Execute a dev method by name with arbitrary arguments. Enables programmatic access to all built-in cheats. */
      callNative(methodName: string, ...args: unknown[]): unknown;
      /** Internal: timer registry for log/stopLog (not part of public API). */
      _timers: Map<number, ReturnType<typeof setInterval>>;
      /** Internal: monotonic counter for log IDs (not part of public API). */
      _nextId: number;
    };
  }
}

function boot(): App {
  // Clear any DOM from a previous instance (HMR) before rebuilding.
  document.getElementById('app')!.innerHTML = '';
  const app = new App();
  app.start();
  window.__app = app;
  return app;
}

let app = boot();

window.__runAutoLoop = (score: number) => {
  if (!window.__app) { console.warn('[2048] App not ready yet'); return; }
  window.__app.runAutoLoop(score);
};

/** Developer console — call from browser DevTools or bookmarklet. */
window.__dev = {
  undo: (steps?: number) => window.__app?.__undo(steps),
  delete: (r: number, c: number) => window.__app?.__delete(r, c),
  deleteValue: (n: number) => window.__app?.__deleteValue(n),
  swap: (r1: number, c1: number, r2: number, c2: number) => window.__app?.__swap(r1, c1, r2, c2),
  addTiles: (n = 1) => window.__app?.__addTiles(n),
  add: (a: number, b?: number, c?: number, d?: number) => window.__app?.__add(a, b, c, d),
  clear: () => window.__app?.__clear(),
  fill: (v = 2) => window.__app?.__fill(v),
  score: (n: number) => window.__app?.__score(n),
  max: (r: number, c: number, v = 2048) => window.__app?.__max(r, c, v),
  moves: (n: number) => window.__app?.__moves(n),
  cheat: (d: Direction) => window.__app?.__cheat(d),
  fillPowerups: () => window.__app?.__fillPowerups(),
  win: () => window.__app?.__win(),
  noDelay: () => window.__app?.__noDelay(),
  nextNumber: () => window.__app?.__nextNumber() ?? -1,
  nextLocation: () => window.__app?.__nextLocation() ?? { row: -1, col: -1 },
  validate: () => window.__app?.__validate(),
  updatePosition: () => window.__app?.__updatePosition(),
  bypassValidation: (valueFirst?: boolean) => window.__app?.__bypassValidation(valueFirst),
  help: () => window.__app?.__help(),
  fixBest: () => window.__app?.__fixBest(),
  refreshScore: () => window.__app?.__refreshScore(),
  refreshPlayAgainStatus: () => window.__app?.__refreshPlayAgainStatus(),
  // ---------- Periodic logger ----------
  _timers: new Map<number, ReturnType<typeof setInterval>>(),
  _nextId: 1,
  log: function (fn: (...args: unknown[]) => unknown, intervalMs = 1000): number {
    const app = window.__app;
    if (!app) { console.warn('[2048] App not ready for __dev.log'); return -1; }
    const id = this._nextId++;
    // Log immediately on first call
    try { console.log(`[dev.log#${id}]`, fn()); } catch (e) { console.error(`[dev.log#${id}]`, e); }
    const timer = setInterval(() => {
      try { console.log(`[dev.log#${id}]`, fn()); } catch (e) { console.error(`[dev.log#${id}]`, e); }
    }, intervalMs);
    this._timers.set(id, timer);
    console.log(`[dev.log] started (id=${id}, interval=${intervalMs}ms)`);
    return id;
  },
  stopLog: function (id?: number): void {
    const timers = (this as Record<string, unknown>)._timers as Map<number, ReturnType<typeof setInterval>>;
    if (id !== undefined && id !== null) {
      const timer = timers.get(id);
      if (timer) { clearInterval(timer); timers.delete(id); console.log(`[dev.log] stopped (id=${id})`); }
      else console.warn(`[dev.log] no logger found with id=${id}`);
    } else {
      for (const [, t] of timers) { clearInterval(t); }
      timers.clear();
      console.log('[dev.log] stopped all loggers');
    }
  },
  // ---------- Native caller ----------
  callNative: function (methodName: string, ...args: unknown[]): unknown {
    const app = window.__app;
    if (!app) { console.warn('[2048] App not ready for __dev.callNative'); return undefined; }
    const method = (app as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') {
      console.warn(`[dev.callNative] no such method: ${methodName}`);
      return undefined;
    }
    try {
      const result = (method as Function).apply(app, args);
      return result;
    } catch (e) {
      console.error(`[dev.callNative] error calling ${methodName}:`, e);
      return undefined;
    }
  },
};

// Dispose the old instance on hot reload so its timers/listeners don't linger.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
  import.meta.hot.accept();
}
