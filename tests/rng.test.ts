import { describe, it, expect } from "vitest";
import { SecureRng, createRngSeed } from "../src/core/rng";

describe("createRngSeed", () => {
  it("returns an array of exactly 8 numbers", () => {
    const seed = createRngSeed();
    expect(Array.isArray(seed)).toBe(true);
    expect(seed.length).toBe(8);
  });

  it("each number is in u32 range [0, 2^32)", () => {
    for (let i = 0; i < 100; i++) {
      const seed = createRngSeed();
      for (const v of seed) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(2 ** 32);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("produces different seeds on successive calls", () => {
    const s1 = createRngSeed();
    const s2 = createRngSeed();
    // With 2^256 possible seeds, collision is astronomically unlikely
    expect(s1).not.toEqual(s2);
  });
});

describe("SecureRng determinism", () => {
  it("same seed produces identical sequence", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new SecureRng(seed, 0);
    const b = new SecureRng(seed, 0);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("sequence is deterministic across runs", () => {
    const seed = [42, 42, 42, 42, 42, 42, 42, 42];
    const results: number[] = [];
    const gen = new SecureRng(seed, 0);
    for (let i = 0; i < 10; i++) {
      results.push(gen.next());
    }
    // Verify reproducibility
    const gen2 = new SecureRng(seed, 0);
    for (let i = 0; i < 10; i++) {
      expect(gen2.next()).toBe(results[i]);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = new SecureRng([1, 2, 3, 4, 5, 6, 7, 8], 0);
    const b = new SecureRng([8, 7, 6, 5, 4, 3, 2, 1], 0);
    expect(a.next()).not.toBe(b.next());
  });
});

describe("SecureRng calls tracking", () => {
  it("calls property advances correctly", () => {
    const gen = new SecureRng([1, 2, 3, 4, 5, 6, 7, 8], 0);
    expect(gen.calls).toBe(0);
    gen.next();
    expect(gen.calls).toBe(1);
    gen.next();
    expect(gen.calls).toBe(2);
    for (let i = 0; i < 14; i++) gen.next();
    expect(gen.calls).toBe(16);
  });

  it("resumes from saved calls position", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    // Advance generator to call 10
    const gen1 = new SecureRng(seed, 0);
    for (let i = 0; i < 10; i++) gen1.next();
    const savedCalls = gen1.calls;

    // Create new generator at saved position
    const gen2 = new SecureRng(seed, savedCalls);
    // Both should produce the same next value
    expect(gen2.next()).toBe(gen1.next());
  });
});

describe("SecureRng block boundary crossing", () => {
  it("switches block after 16 values", () => {
    const seed = [
      0xdeadc0de, 0xbeefcafe, 0x12345678, 0x9abcdef0, 0xfedcba98, 0x76543210,
      0xdeadbeef, 0xcafebabe,
    ];
    const gen = new SecureRng(seed, 0);
    // Values 0-15 are from block 0, values 16+ from block 1
    const beforeBoundary: number[] = [];
    for (let i = 0; i < 16; i++) beforeBoundary.push(gen.next());
    const afterBoundary: number[] = [];
    for (let i = 0; i < 5; i++) afterBoundary.push(gen.next());
    // Block boundary should produce different values (not just a linear progression)
    // The ChaCha20 algorithm ensures each block is independent
    expect(afterBoundary[0]).not.toBe(beforeBoundary[0]);
  });

  it("values at exact block boundaries are consistent", () => {
    const seed = [42, 42, 42, 42, 42, 42, 42, 42];
    const gen1 = new SecureRng(seed, 0);
    for (let i = 0; i < 16; i++) gen1.next();
    const val1 = gen1.next(); // 17th value

    const gen2 = new SecureRng(seed, 16);
    const val2 = gen2.next(); // first value from block 1
    expect(val1).toBe(val2);
  });

  it("continuous sequence across boundary", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    const gen = new SecureRng(seed, 0);
    const all: number[] = [];
    for (let i = 0; i < 32; i++) all.push(gen.next());
    // Verify: values 0-15 from block 0, 16-31 from block 1
    const gen1 = new SecureRng(seed, 0);
    for (let i = 0; i < 16; i++) expect(gen1.next()).toBe(all[i]);
    const gen2 = new SecureRng(seed, 16);
    for (let i = 0; i < 16; i++) expect(gen2.next()).toBe(all[16 + i]);
  });
});

describe("SecureRng float range", () => {
  it("next() returns value in [0, 1)", () => {
    const gen = new SecureRng([0x12345678, 0, 0, 0, 0, 0, 0, 0], 0);
    for (let i = 0; i < 1000; i++) {
      const v = gen.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("values appear uniformly distributed (sanity check)", () => {
    const gen = new SecureRng(
      [
        0xabcdef00, 0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00, 0x11111111,
        0x22222222, 0x33333333,
      ],
      0,
    );
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      sum += gen.next();
    }
    const mean = sum / n;
    // Uniform [0,1) has mean 0.5; allow ±0.05 tolerance
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe("SecureRng with custom calls offset", () => {
  it("starting at calls=8 skips first 8 values", () => {
    const seed = [99, 99, 99, 99, 99, 99, 99, 99];
    const genFull = new SecureRng(seed, 0);
    for (let i = 0; i < 8; i++) genFull.next();
    const expected = genFull.next();

    const genSkipped = new SecureRng(seed, 8);
    expect(genSkipped.next()).toBe(expected);
  });

  it("starting at calls=16 crosses into block 1", () => {
    const seed = [0, 0, 0, 0, 0, 0, 0, 1];
    const genFull = new SecureRng(seed, 0);
    for (let i = 0; i < 16; i++) genFull.next();
    const expected = genFull.next();

    const genSkipped = new SecureRng(seed, 16);
    expect(genSkipped.next()).toBe(expected);
  });
});
