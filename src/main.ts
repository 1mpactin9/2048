import { App } from './ui/app';
import './styles/main.css';

declare global {
  interface Window {
    __app?: App;
    __runAutoLoop: (score: number) => void;
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

// Dispose the old instance on hot reload so its timers/listeners don't linger.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
  import.meta.hot.accept();
}
