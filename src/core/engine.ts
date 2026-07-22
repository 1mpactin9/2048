import type { AutoAction, Engine, EngineContext } from './types';
import { DIRECTIONS } from './types';
import { move } from './move';

/**
 * A legal random move. Shipped only so the auto-play plumbing is testable end
 * to end - the real auto-play uses WasmEngine (Rust expectimax via WASM). This
 * fallback never spends power-ups; it just picks a random legal direction.
 */
export const PlaceholderEngine: Engine = {
  name: 'Placeholder (random legal)',
  chooseAction(ctx: EngineContext): AutoAction {
    const order = [...DIRECTIONS];
    // Fisher-Yates with Math.random; fine in the browser.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const dir of order) {
      if (move(ctx.grid, dir).transcript.moved) return { kind: 'move', dir };
    }
    return { kind: 'stop' };
  },
};
