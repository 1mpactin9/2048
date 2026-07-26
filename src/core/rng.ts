// ChaCha20 CSPRNG for deterministic, unpredictable tile spawns.
//
// The 256-bit key is a per-game seed XOR-ed with a constant in this file.
// Without source: reproducing the stream is infeasible. With source + seed: fully predictable.
// Stream state is one integer (`calls`), persisted so reloaded games resume exactly.

// Source-embedded key material (32 bytes). Reproducing a stream requires reading this constant.
const KEY_MATERIAL = new Uint8Array([
  0x9e, 0x37, 0x79, 0xb9, 0x8f, 0x1c, 0x4d, 0xa2, 0x55, 0x71, 0x03, 0x96, 0xc4,
  0x6e, 0x20, 0xf1, 0x4a, 0xd8, 0x7b, 0xe5, 0x19, 0xa0, 0x66, 0x3c, 0xf2, 0x4b,
  0x88, 0x0d, 0xe6, 0x11, 0xc7, 0x5a,
]);

// "expand 32-byte k"
const SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);

// Per-game variation carried by the key; zero nonce is fine.
const NONCE = new Uint32Array([0, 0]);

// 64-byte block / 4 bytes per uint32 = 16 values.
const VALUES_PER_BLOCK = 16;

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function quarterRound(
  x: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl(x[b] ^ x[c], 7);
}

/** Run one ChaCha20 block, writing 16 output words into `out`. */
function chacha20BlockInto(
  key: Uint32Array,
  counter: number,
  nonce: Uint32Array,
  out: Uint32Array,
): void {
  const s = new Uint32Array(16);
  s.set(SIGMA, 0);
  s.set(key, 4);
  s[12] = counter >>> 0;
  s[13] = 0;
  s[14] = nonce[0] >>> 0;
  s[15] = nonce[1] >>> 0;

  const x = s.slice();
  for (let i = 0; i < 10; i++) {
    quarterRound(x, 0, 4, 8, 12);
    quarterRound(x, 1, 5, 9, 13);
    quarterRound(x, 2, 6, 10, 14);
    quarterRound(x, 3, 7, 11, 15);
    quarterRound(x, 0, 5, 10, 15);
    quarterRound(x, 1, 6, 11, 12);
    quarterRound(x, 2, 7, 8, 13);
    quarterRound(x, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) out[i] = (x[i] + s[i]) >>> 0;
}

/** XOR per-game seed with KEY_MATERIAL to produce the ChaCha20 key. */
function deriveKey(seed: number[]): Uint32Array {
  const seedBytes = new Uint8Array(32);
  const dv = new DataView(seedBytes.buffer);
  for (let i = 0; i < 8; i++) dv.setUint32(i * 4, (seed[i] ?? 0) >>> 0, true);
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = seedBytes[i] ^ KEY_MATERIAL[i];
  const key = new Uint32Array(8);
  const kdv = new DataView(keyBytes.buffer);
  for (let i = 0; i < 8; i++) key[i] = kdv.getUint32(i * 4, true) >>> 0;
  return key;
}

/** Generate a fresh 32-byte seed as 8 uint32 values. */
export function createRngSeed(): number[] {
  const a = new Uint32Array(8);
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(a);
  } else {
    for (let i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 0x100000000);
  }
  return Array.from(a);
}

/** Seeded, deterministic CSPRNG. Wrap as `() => number` via `gen.next()`. */
export class SecureRng {
  private key: Uint32Array;
  private block = new Uint32Array(16);
  private blockIndex = -1;
  /** Values consumed so far. Persist/restore to resume. */
  calls = 0;

  constructor(seed: number[], calls = 0) {
    this.key = deriveKey(seed);
    this.calls = calls;
  }

  private ensureBlock(): void {
    const idx = Math.floor(this.calls / VALUES_PER_BLOCK);
    if (idx !== this.blockIndex) {
      chacha20BlockInto(this.key, idx, NONCE, this.block);
      this.blockIndex = idx;
    }
  }

  /** Next float in [0, 1). */
  next(): number {
    this.ensureBlock();
    const w = this.block[this.calls % VALUES_PER_BLOCK];
    this.calls++;
    return w / 0x100000000;
  }
}
