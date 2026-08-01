import seedrandom from "seedrandom";

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

function seedString(seed: number[]): string {
  return Array.from(seed, (v) => v.toString(16).padStart(8, "0")).join("");
}

export class SecureRng {
  private prng: seedrandom.PRNG;
  calls = 0;

  constructor(seed: number[], calls = 0) {
    this.prng = seedrandom(seedString(seed));
    for (let i = 0; i < calls; i++) this.prng();
    this.calls = calls;
  }

  next(): number {
    const v = this.prng();
    this.calls++;
    return v;
  }
}
