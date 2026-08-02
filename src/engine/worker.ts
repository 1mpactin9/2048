import init, {
  suggest_move,
  suggest_action,
  suggest_move_det,
  suggest_action_det,
} from "../../engine/pkg/engine2048.js";

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
  manipulate: boolean;
  seed: Uint32Array;
  calls: number;
  usageCode: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Inbound>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = async (e: MessageEvent<Inbound>): Promise<void> => {
  const {
    id,
    flat,
    size,
    depth,
    usePowerups,
    swaps,
    deletes,
    manipulate,
    seed,
    calls,
    usageCode,
  } = e.data;
  try {
    await ensure();
    if (usePowerups) {
      const action = manipulate
        ? suggest_action_det(
            flat,
            size,
            swaps,
            deletes,
            depth,
            seed,
            calls,
            true,
            usageCode,
          )
        : suggest_action(flat, size, swaps, deletes, depth, usageCode);
      ctx.postMessage({ id, ok: true, action });
    } else {
      const code = manipulate
        ? suggest_move_det(flat, size, depth, seed, calls, true, usageCode)
        : suggest_move(flat, size, depth, usageCode);
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
