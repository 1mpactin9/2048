/**
 * Web Worker host for the Rust expectimax AI (compiled to WASM).
 *
 * The WASM `suggest_move` / `suggest_action` calls are synchronous and can run
 * for tens to hundreds of milliseconds on deep or congested boards. Running
 * them on the main thread freezes animations and input - and, because the merge
 * pop is scheduled with a `setTimeout` (see board.ts), it also delays the
 * merged tile appearing until after the search finishes. This worker moves that
 * work off the main thread so the UI stays responsive (and merges pop on time)
 * while the engine thinks at full depth.
 *
 * Protocol: each inbound message is
 *   `{ id, flat, size, depth, usePowerups, swaps, deletes, manipulate, seed, calls }`
 * and the reply is
 *   `{ id, ok: true, code }`            (suggest_move -> a direction code), or
 *   `{ id, ok: true, action }`          (suggest_action -> a u32 action array), or
 *   `{ id, ok: false, error }`          (init or search failed).
 * `id` lets the dispatcher (wasm-engine.ts) match replies to requests.
 *
 * When `manipulate` is set, the request also carries the ChaCha20 `seed` (8
 * uint32) and stream position `calls`; the worker calls the predictive
 * `suggest_*_det` entry points, which peek the exact next spawn from that
 * stream instead of averaging over random spawns (faster + sharper). Otherwise
 * it calls the plain averaging `suggest_*`.
 */
import init, {
  suggest_move,
  suggest_action,
  suggest_move_det,
  suggest_action_det,
} from '../../engine/pkg/engine2048.js';

// Lazily instantiated init promise. Reset to `null` on failure so a transient
// load error (e.g. the .wasm not being served yet) is retried on the next
// request rather than poisoning the worker permanently.
let ready: Promise<void> | null = null;

function ensure(): Promise<void> {
  if (!ready) {
    ready = init().then(
      () => undefined,
      (err) => {
        ready = null;
        throw err;
      },
    );
  }
  return ready;
}

interface Inbound {
  id: number;
  flat: Uint32Array;
  size: number;
  depth: number;
  usePowerups: boolean;
  swaps: number;
  deletes: number;
  /** When true, run the predictive search using the spawn stream below. */
  manipulate: boolean;
  /** 8-uint32 ChaCha20 seed (only used when `manipulate`). */
  seed: Uint32Array;
  /** Stream position / uint32 values consumed so far (only when `manipulate`). */
  calls: number;
}

// `self` is the DedicatedWorkerGlobalScope inside a module worker. The DOM lib
// types it as `Window`, so cast to the small shape we use instead of pulling in
// the (DOM-conflicting) `webworker` lib.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Inbound>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = async (e: MessageEvent<Inbound>): Promise<void> => {
  const { id, flat, size, depth, usePowerups, swaps, deletes, manipulate, seed, calls } = e.data;
  try {
    await ensure();
    if (usePowerups) {
      const action = manipulate
        ? suggest_action_det(flat, size, swaps, deletes, depth, seed, calls, true)
        : suggest_action(flat, size, swaps, deletes, depth);
      ctx.postMessage({ id, ok: true, action });
    } else {
      const code = manipulate
        ? suggest_move_det(flat, size, depth, seed, calls, true)
        : suggest_move(flat, size, depth);
      ctx.postMessage({ id, ok: true, code });
    }
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
