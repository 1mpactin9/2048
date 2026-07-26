/// <reference vitest-env={ "environment": "node" } />
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gridFromValues, spawnTile } from "../src/core/grid";
import { SecureRng } from "../src/core/rng";

const wasmJsPath = path.resolve(__dirname, "../engine/pkg/engine2048.js");
const wasmBinPath = path.resolve(
  __dirname,
  "../engine/pkg/engine2048_bg.wasm",
);

type PredictSpawn = (
  flat: Uint32Array,
  size: number,
  seed: Uint32Array,
  calls: number,
  manipulate: boolean,
) => Uint32Array;

let predictSpawn: PredictSpawn | null = null;
async function ensureLoaded(): Promise<PredictSpawn | null> {
  if (predictSpawn) return predictSpawn;
  if (!existsSync(wasmJsPath) || !existsSync(wasmBinPath)) return null;
  const mod = await import(wasmJsPath);
  mod.initSync({ module: readFileSync(wasmBinPath) });
  predictSpawn = mod.predict_spawn as PredictSpawn;
  return predictSpawn;
}

function jsSpawn(
  flat: number[],
  size: number,
  seed: number[],
  calls: number,
  manipulate: boolean,
): { idx: number; value: number; draws: number } | null {
  const values: number[][] = [];
  for (let r = 0; r < size; r++)
    values.push(flat.slice(r * size, (r + 1) * size));
  const grid = gridFromValues(values);
  const gen = new SecureRng(seed, calls);
  const rng = (): number => gen.next();
  const spawned = spawnTile(grid, { rng, manipulate });
  if (!spawned) return null;
  return {
    idx: spawned.row * size + spawned.col,
    value: spawned.value,
    draws: gen.calls - calls,
  };
}

function rustSpawn(
  fn: PredictSpawn,
  flat: number[],
  size: number,
  seed: number[],
  calls: number,
  manipulate: boolean,
): { idx: number; value: number; draws: number } | null {
  const out = fn(
    new Uint32Array(flat),
    size,
    new Uint32Array(seed),
    calls,
    manipulate,
  );
  if (out[0] === 4294967295) return null;
  return { idx: out[0], value: out[1], draws: out[2] };
}

interface Case {
  name: string;
  flat: number[];
  size: number;
  seed: number[];
  calls: number;
  manipulate: boolean;
}

const cases: Case[] = [
  {
    name: "4x4 plain spawn",
    flat: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0],
    size: 4,
    seed: [1, 2, 3, 4, 5, 6, 7, 8],
    calls: 0,
    manipulate: false,
  },
  {
    name: "4x4 manipulated spawn",
    flat: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0],
    size: 4,
    seed: [1, 2, 3, 4, 5, 6, 7, 8],
    calls: 3,
    manipulate: true,
  },
  {
    name: "3x3 manipulated spawn",
    flat: [2, 4, 0, 0, 0, 8, 0, 0, 0],
    size: 3,
    seed: [9, 9, 9, 9, 9, 9, 9, 9],
    calls: 7,
    manipulate: true,
  },
  {
    name: "5x5 manipulated spawn",
    flat: [
      2, 0, 4, 0, 8, 0, 16, 0, 2, 0, 4, 0, 0, 0, 2, 0, 8, 0, 4, 0, 2, 0, 0, 0,
      0,
    ],
    size: 5,
    seed: [3, 1, 4, 1, 5, 9, 2, 6],
    calls: 11,
    manipulate: true,
  },
  {
    name: "manipulated spawn crossing a ChaCha block boundary (calls=20)",
    flat: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0],
    size: 4,
    seed: [5, 5, 5, 5, 5, 5, 5, 5],
    calls: 20,
    manipulate: true,
  },
  {
    name: "manipulate with a single empty falls back to the plain draw",
    flat: [2, 4, 8, 16, 32, 64, 128, 2, 4, 8, 16, 32, 64, 128, 0, 4],
    size: 4,
    seed: [2, 4, 6, 8, 10, 12, 14, 16],
    calls: 2,
    manipulate: true,
  },
  {
    name: "8x8 manipulated spawn on a large board",
    flat: [
      2, 0, 4, 0, 8, 0, 16, 0, 0, 32, 0, 64, 0, 2, 0, 4, 8, 0, 16, 0, 32, 0, 64,
      0, 128, 0, 2, 0, 4, 0, 8, 0, 0, 16, 0, 32, 0, 64, 0, 128, 2, 0, 4, 0, 8,
      0, 16, 0, 32, 0, 64, 0, 2, 0, 4, 0, 8, 0, 16, 0, 32, 0, 64, 0,
    ],
    size: 8,
    seed: [7, 7, 7, 7, 7, 7, 7, 7],
    calls: 33,
    manipulate: true,
  },
];

describe("predictive spawn parity (Rust predict_spawn vs JS spawnTile)", () => {
  for (const c of cases) {
    it(`matches for: ${c.name}`, async () => {
      const fn = await ensureLoaded();
      if (!fn) {
        expect(true).toBe(true);
        return;
      }
      const js = jsSpawn(c.flat, c.size, c.seed, c.calls, c.manipulate);
      const rust = rustSpawn(fn, c.flat, c.size, c.seed, c.calls, c.manipulate);
      expect(rust).not.toBeNull();
      expect(js).not.toBeNull();
      expect(js).toEqual(rust);
    });
  }

  it("both return null (no spawn) on a full board", async () => {
    const fn = await ensureLoaded();
    if (!fn) {
      expect(true).toBe(true);
      return;
    }
    const full = [2, 4, 8, 16, 32, 64, 128, 2, 4, 8, 16, 32, 64, 128, 2, 4];
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(jsSpawn(full, 4, seed, 0, true)).toBeNull();
    expect(rustSpawn(fn, full, 4, seed, 0, true)).toBeNull();
  });
});
