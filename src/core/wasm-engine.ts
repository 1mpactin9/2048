import type { AutoAction, Direction, Engine, EngineContext } from './types';
import { PlaceholderEngine } from './engine';

// Direction codes returned by the Rust AI (see engine/src/wasm.rs):
// 0 = up, 1 = down, 2 = left, 3 = right. Any value outside [0, 3] means
// "no legal move" (the AI returns u32::MAX when the board is stuck).
const DIR_BY_CODE: readonly Direction[] = ['up', 'down', 'left', 'right'];

/**
 * Hard wall-clock cap on a single AI decision. The Rust engine already bounds
 * the *computation* per decision by a node budget (see `SEARCH_NODE_BUDGET` /
 * `budget_for_depth` in engine/src/lib.rs), so this is purely a safety net: if
 * something pathological ever hangs the search past this many milliseconds, the
 * worker is terminated (freeing the core it was pinned to) and the caller falls
 * back to a random legal move for that one tick. Generous enough that a
 * legitimate deep search on a large, congested board never trips it.
 */
const DECISION_TIMEOUT_MS = 2000;

interface WorkerRequest {
  id: number;
  flat: Uint32Array;
  size: number;
  depth: number;
  usePowerups: boolean;
  swaps: number;
  deletes: number;
  /** Predictive "cheat" search: peek the spawn stream instead of averaging. */
  manipulate: boolean;
  /** 8-uint32 ChaCha20 seed (only meaningful when `manipulate`). */
  seed: Uint32Array;
  /** Stream position / uint32 values consumed so far (only when `manipulate`). */
  calls: number;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  /** Direction code from `suggest_move` (0..3), or `>3` / undefined for "no move". */
  code?: number;
  /** Flat action array from `suggest_action` (see `decodeAction`). */
  action?: Uint32Array;
  error?: string;
}

// One long-lived worker handles every decision. Idle between auto-play ticks
// (negligible cost) and reused across auto-play sessions so the WASM module
// only loads once. `workerDead` is set only when the worker can't be created at
// all (e.g. an environment without `Worker`); transient errors drop the worker
// and let a fresh one spin up on the next request.
let worker: Worker | null = null;
let workerDead = false;
let nextRequestId = 1;
let warnedFallback = false;

const pending = new Map<
  number,
  { resolve: (r: WorkerReply) => void; timer: ReturnType<typeof setTimeout> }
>();

function getWorker(): Worker | null {
  if (workerDead) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerReply>): void => {
      const reply = e.data;
      const entry = pending.get(reply.id);
      if (!entry) return; // reply for a request already cleared by timeout/teardown
      pending.delete(reply.id);
      clearTimeout(entry.timer);
      entry.resolve(reply);
    };
    w.onerror = (): void => {
      // Fatal worker error: fail every in-flight request, then drop the worker
      // so a fresh one is created next time (transient errors don't permanently
      // disable the AI).
      failAllPending('worker error');
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };
    worker = w;
    return w;
  } catch {
    workerDead = true;
    return null;
  }
}

function failAllPending(error: string): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve({ id: 0, ok: false, error });
  }
  pending.clear();
}

/**
 * Post one search request to the worker and await its reply. Resolves with
 * `{ ok: false }` (never rejects) if the worker is unavailable, errors, or
 * exceeds the hard time cap - the caller then falls back. The timeout
 * terminates the stuck worker so it can't keep a core busy.
 */
function request(req: Omit<WorkerRequest, 'id'>): Promise<WorkerReply> {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      resolve({ id: 0, ok: false, error: 'worker unavailable' });
      return;
    }
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      // Hard cap: kill the stuck worker so it can't hog a core. A fresh one is
      // spun up on the next decision.
      if (worker) {
        worker.terminate();
        worker = null;
      }
      resolve({ id, ok: false, error: 'timeout' });
    }, DECISION_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, ...req });
  });
}

/**
 * Auto-play engine backed by the Rust expectimax AI, compiled to WebAssembly
 * and run on a dedicated Web Worker.
 *
 * The browser keeps full ownership of game state (grid, score, powerups,
 * history, animations); this only decides the next action. Running the search
 * off the main thread is what keeps the UI responsive and animations smooth
 * while the engine thinks at full depth - the synchronous WASM call used to
 * block the event loop, freezing input and delaying the merge pop. The live
 * board size is forwarded so the AI's search depth auto-adapts (deeper on small
 * boards, shallower on large ones); a non-zero `ctx.depth` overrides that.
 *
 * When `ctx.usePowerups` is set, the AI may spend swap/delete charges to escape
 * a congested or stuck board (it won't waste them in the comfortable midgame).
 * Otherwise it only ever returns directional moves. If the worker can't be
 * loaded or a decision times out, it falls back to a random legal move so
 * auto-play never stalls.
 */
export const WasmEngine: Engine = {
  name: 'Expectimax AI (Rust -> WASM, worker)',
  async chooseAction(ctx: EngineContext): Promise<AutoAction> {
    const { size, grid, depth, usePowerups, powerups } = ctx;
    // Snapshot the board synchronously, before any await, so the worker always
    // searches exactly what was on screen at decision time (the caller also
    // guards against the board changing while we wait - see App.autoTick).
    const flat = new Uint32Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        flat[r * size + c] = grid[r]?.[c]?.value ?? 0;
      }
    }

    // Predictive "cheat" mode is on only when manipulation is enabled AND we
    // have a usable seed. Without a seed (e.g. the legacy/injected-RNG test
    // path) the stream can't be reproduced, so fall back to the fair averaging
    // search rather than predicting from a bogus stream.
    const seedArr = ctx.rngSeed;
    const manipulate = ctx.manipulate === true && Array.isArray(seedArr) && seedArr.length === 8;
    const seed = manipulate ? new Uint32Array(seedArr as number[]) : new Uint32Array(0);
    const calls = ctx.rngCalls ?? 0;

    const reply = await request({
      flat,
      size,
      depth,
      usePowerups,
      swaps: powerups.swap,
      deletes: powerups.delete,
      manipulate,
      seed,
      calls,
    });

    if (!reply.ok) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn('[WasmEngine] search unavailable (' + reply.error + '); using random legal move.');
      }
      return PlaceholderEngine.chooseAction(ctx);
    }

    try {
      if (usePowerups) {
        if (!reply.action) return PlaceholderEngine.chooseAction(ctx);
        return decodeAction(reply.action);
      }
      const code = reply.code;
      if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code > 3) {
        return { kind: 'stop' };
      }
      return { kind: 'move', dir: DIR_BY_CODE[code] };
    } catch (err) {
      console.error('[WasmEngine] failed to decode action, falling back:', err);
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
