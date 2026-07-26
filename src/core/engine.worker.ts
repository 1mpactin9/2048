/** Web Worker host for the Rust expectimax AI. Moves off-thread search so the UI stays responsive. */
import init, {
import init, {
  suggest_move,
  suggest_action,
  suggest_move_det,
  suggest_action_det,
} from '../../engine/pkg/engine2048.js';

// Lazily instantiated init promise. Reset on failure so transient errors retry.
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
  /** Run predictive search using spawn stream. */
  manipulate: boolean;
  /** 8-uint32 ChaCha20 seed (only when `manipulate`). */
  seed: Uint32Array;
  /** Stream position (only when `manipulate`). */
  calls: number;
}

// Cast self to DedicatedWorkerGlobalScope to avoid DOM lib conflicts.
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
