import type { Direction } from './core/types';
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
      clear(): void;
      fill(val?: number): void;
      score(n: number): void;
      max(row: number, col: number, val?: number): void;
      moves(n: number): void;
      cheat(dir: Direction): void;
      fillPowerups(): void;
      win(): void;
      nextNumber(): number;
      nextLocation(): { row: number; col: number };
      help(): void;
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
  clear: () => window.__app?.__clear(),
  fill: (v = 2) => window.__app?.__fill(v),
  score: (n: number) => window.__app?.__score(n),
  max: (r: number, c: number, v = 2048) => window.__app?.__max(r, c, v),
  moves: (n: number) => window.__app?.__moves(n),
  cheat: (d: Direction) => window.__app?.__cheat(d),
  fillPowerups: () => window.__app?.__fillPowerups(),
  win: () => window.__app?.__win(),
  nextNumber: () => window.__app?.__nextNumber() ?? -1,
  nextLocation: () => window.__app?.__nextLocation() ?? { row: -1, col: -1 },
  help: () => window.__app?.__help(),
};

// Dispose the old instance on hot reload so its timers/listeners don't linger.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
  import.meta.hot.accept();
}
