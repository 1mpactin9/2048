import type { Direction, Engine, EngineContext } from './types';
import { DIRECTIONS } from './types';
import { move } from './move';

/**
 * A legal random move. Shipped only so the auto-play plumbing is testable end
 * to end - replace this with a real solver (expectimax / your own algorithm)
 * by implementing the Engine interface and registering it in the app.
 */
export const PlaceholderEngine: Engine = {
  name: 'Placeholder (random legal)',
  chooseMove(ctx: EngineContext): Direction | null {
    const order = [...DIRECTIONS];
    // Fisher-Yates with Math.random; fine in the browser.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const dir of order) {
      if (move(ctx.grid, dir).transcript.moved) return dir;
    }
    return null;
  },
};
