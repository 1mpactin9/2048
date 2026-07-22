import type { AutoAction, Direction, Engine, EngineContext } from './types';
import { PlaceholderEngine } from './engine';

// Direction codes returned by the Rust AI (see engine/src/wasm.rs):
// 0 = up, 1 = down, 2 = left, 3 = right. Any value outside [0, 3] means
// "no legal move" (the AI returns u32::MAX when the board is stuck).
const DIR_BY_CODE: readonly Direction[] = ['up', 'down', 'left', 'right'];

// The compiled expectimax AI lives in engine/pkg (built by `npm run
// build:wasm`). Lazy-load it via a dynamic import so the WASM binary stays out
// of the initial bundle and is only fetched the first time auto-play is used.
let wasmPromise: Promise<typeof import('../../engine/pkg/engine2048.js')> | null = null;

function loadWasm(): Promise<typeof import('../../engine/pkg/engine2048.js')> {
  if (!wasmPromise) {
    wasmPromise = import('../../engine/pkg/engine2048.js').then(async (mod) => {
      await mod.default(); // fetch + instantiate the .wasm
      return mod;
    });
  }
  return wasmPromise;
}

/**
 * Auto-play engine backed by the Rust expectimax AI, compiled to WebAssembly.
 *
 * The browser keeps full ownership of game state (grid, score, powerups,
 * history, animations); this only decides the next action. The live board size
 * is forwarded to the AI so its search depth auto-adapts (deeper on small
 * boards, shallower on large ones) - matching the engine's capability to every
 * supported size (3, 4, 5, 6, 8). A non-zero `ctx.depth` overrides that.
 *
 * When `ctx.usePowerups` is set, the AI may spend swap/delete charges to escape
 * a congested or stuck board (it won't waste them in the comfortable midgame).
 * Otherwise it only ever returns directional moves. If the WASM module can't be
 * loaded (e.g. it hasn't been built yet), it falls back to a random legal move.
 */
export const WasmEngine: Engine = {
  name: 'Expectimax AI (Rust -> WASM)',
  async chooseAction(ctx: EngineContext): Promise<AutoAction> {
    const { size, grid, depth, usePowerups, powerups } = ctx;
    const flat = new Uint32Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        flat[r * size + c] = grid[r]?.[c]?.value ?? 0;
      }
    }
    try {
      const mod = await loadWasm();
      if (usePowerups) {
        const out = mod.suggest_action(flat, size, powerups.swap, powerups.delete, depth);
        return decodeAction(out);
      }
      const code = mod.suggest_move(flat, size, depth);
      if (!Number.isInteger(code) || code < 0 || code > 3) return { kind: 'stop' };
      return { kind: 'move', dir: DIR_BY_CODE[code] };
    } catch (err) {
      console.error('[WasmEngine] Rust AI unavailable, falling back to random:', err);
      return PlaceholderEngine.chooseAction(ctx);
    }
  },
};

/**
 * Decode the flat `u32` action array returned by `suggest_action`:
 * `[0, dir]` = move, `[1, r, c]` = delete, `[2, r1, c1, r2, c2]` = swap,
 * anything else (incl. `[3]`) = stop.
 */
function decodeAction(out: Uint32Array): AutoAction {
  const kind = out[0];
  if (kind === 0) {
    const d = out[1];
    if (d != null && d >= 0 && d <= 3) return { kind: 'move', dir: DIR_BY_CODE[d] };
    return { kind: 'stop' };
  }
  if (kind === 1) return { kind: 'delete', row: out[1], col: out[2] };
  if (kind === 2) return { kind: 'swap', r1: out[1], c1: out[2], r2: out[3], c2: out[4] };
  return { kind: 'stop' };
}
