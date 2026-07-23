# AI tuning/validation scripts (not part of the shipped app)

This folder is **not** part of the 2048 app — it's a plain-Node.js port of the
Rust AI algorithm (`engine/src/lib.rs`), used to iterate on and validate the
search/heuristic logic quickly. It exists because this sandbox has no Rust
toolchain (`cargo`/`rustc` not installed, no network to install one), so the
actual `.rs` changes could not be compiled or run here.

- `algo.mjs` — faithful JS port of the expectimax search + heuristic
  (slide/merge, monotonicity, smoothness, corner-snake weighting, dynamic
  search depth). Kept in sync by hand with `engine/src/lib.rs`.
- `simulate.mjs` — plays full simulated games and reports score stats.

## Usage

```bash
node simulate.mjs [games] [depth] [maxCells]        # batch stats
node simulate.mjs [games] [depth] [maxCells] --verbose  # progress log per game
```

## What this did/didn't verify

It confirmed the algorithm's move-selection logic is sound (slide/merge,
heuristic, depth scaling) and was used to spot that heap-allocation-heavy
board cloning was the likely reason the real Rust/WASM AI wasn't searching
deep enough. It did **not** verify actual Rust performance or final score
numbers — Node.js and compiled Rust have very different cost models (V8's
array handling vs. Rust's allocator), so JS timing doesn't transfer directly.

**To get real numbers, build and run the actual Rust benchmark:**

```bash
cd engine
cargo test              # correctness, including slide_flat vs slide_grid cross-check
cargo run --release --bin bench -- 20
```

This prints min/median/average/max score across 20 full standard 4x4 games
(no power-ups) and how many clear 100k / 200k, which is what determines
whether the depth/heuristic tuning actually hits the target in practice.
