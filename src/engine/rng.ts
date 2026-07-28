// seedrandom rng wrapper — float, choice, serializable state

import seedrandom from 'seedrandom';
import type { PRNG } from 'seedrandom';
import type { RngState } from './types';

export type Rng = {
  seed: string;
  float: () => number;
  int: (min: number, max: number) => number;
  choice: <T>(arr: T[]) => T;
  state: () => RngState;
};

function wrap(seed: string, prng: PRNG): Rng {
  return {
    seed,
    float: () => prng(),
    int: (min, max) => Math.floor(prng() * (max - min + 1)) + min,
    choice: (arr) => arr[Math.floor(prng() * arr.length)],
    state: () => ({ seed, state: prng.state() }),
  };
}

export function createRng(seed?: string): Rng {
  const s = seed ?? Math.random().toString();
  return wrap(s, seedrandom(s, { state: true }));
}

// restore from a persisted state (falls back to fresh seed on mismatch)
export function restoreRng(saved: RngState): Rng {
  try {
    if (saved.state) return wrap(saved.seed, seedrandom('', { state: saved.state }));
  } catch {
    // format mismatch
  }
  return createRng(saved.seed);
}
