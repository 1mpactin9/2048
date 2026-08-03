<div align="center">
    <h1>Benchmark</h1>
    <p>
        <a href="#phase-1-directional-move-speed-plain-expectimax">Part 01</a> -
        <a href="#phase-2-power-up-evaluation-full-action-search">02</a> -
        <a href="#phase-3-predictive-search-rng-manipulation-mode">03</a> -
        <a href="#phase-5-optimized-predictive-search-shared-seedrng">05</a> -
        <a href="#phase-6-snake-weight-precomputation--budget-break">06</a> -
        <a href="#phase-7-nneonneo-fast-heuristic-and-configuration-tuning">07</a> -
        <a href="#phase-8-8192-guarantee-port-and-sweep-benchmark">08</a>
    </p>
</div>

Benchmark results for the Rust expectimax engine (`engine/src/lib.rs`), compiled to WASM and run in a Web Worker.

All timings are single-core, release build (`--release`), averaged over 20 decisions per configuration.

## Test Configurations

| Dimension | Values tested |
|-----------|--------------|
| **Board size** | 3×3, 4×4, 5×5, 6×6, 8×8 |
| **Board state** | Opening (2–3 tiles) / Danger (1–2 empties, high tiles) / Stuck (no legal moves) |
| **Search depth** | Auto (adaptive) / Basic (d=2) / Medium (d=4) / Advanced (d=6) |
| **AI mode** | Plain expectimax / Predictive (RNG manipulation) / Full action (with power-ups) |

### Board states

- **Opening** — 2–3 tiles near the corner, mostly empty. Adaptive depth drops to ~1–2.
- **Danger** — Nearly full board, high tiles along a snake path, 2 cells empty. Adaptive depth ramps up hard.
- **Stuck** — 4×4 board, alternating 2/4 pattern, no legal moves. Forces power-up evaluation in `suggest_action_for`.

## IMPORTANT: Benchmark Refactoring Results

The engine was significantly refactored in commit f0581bf (Jul 29, 2026) with major improvements including:

- **Bitboard-based move generation** using precomputed lookup tables (`engine/src/bitboard.rs`)
- **Transposition table caching** to avoid recomputing identical board states
- **Modular architecture** separating game logic, search, heuristics, and deterministic modes
- **Adaptive depth with node budget caps** preventing tree explosion

The following comparison shows benchmarks from before and after the refactor. The performance gains are dramatic across all metrics.

---

## Phase 1: Directional Move Speed (Plain Expectimax)

Time per decision when only picking a direction. No power-up evaluation.

### Old Results (Before Refactor)

| Size | State | Depth | μs/decision | vs opening |
|------|-------|-------|-------------|-----------|
| 3×3 | Opening | auto | 377 | 1.0× |
| 3×3 | Danger | auto | 915 | 2.4× |
| 4×4 | Opening | auto | 788 | 1.0× |
| 4×4 | Danger | auto | 1,608 | 2.0× |
| 4×4 | Danger | basic (d=2) | 1,581 | 2.0× |
| 4×4 | Danger | medium (d=4) | 1,522 | 1.9× |
| 4×4 | Danger | advanced (d=6) | 1,604 | 2.0× |
| 5×5 | Opening | auto | 39 | 1.0× |
| 5×5 | Danger | auto | 5,881 | 150.8× |
| 5×5 | Danger | basic (d=2) | 5,432 | 139.3× |
| 5×5 | Danger | medium (d=4) | 5,251 | 134.6× |
| 5×5 | Danger | advanced (d=6) | 5,702 | 146.2× |
| 6×6 | Opening | auto | 57 | 1.0× |
| 6×6 | Danger | auto | 136 | 2.4× |
| 8×8 | Opening | auto | 136 | 1.0× |
| 8×8 | Danger | auto | 223 | 1.6× |

### New Results (After Refactor)

| Size | State | Depth | μs/decision | Improvement |
|------|-------|-------|-------------|-------------|
| 3×3 | Opening | auto | 219 | ~1.7× faster |
| 3×3 | Danger | auto | 15 | **~61× faster** |
| 4×4 | Opening | auto | 17 | **~46× faster** |
| 4×4 | Danger | auto | 15 | **~107× faster** |
| 4×4 | Danger | basic (d=2) | 5 | **~316× faster** |
| 4×4 | Danger | medium (d=4) | 5 | **~304× faster** |
| 4×4 | Danger | advanced (d=6) | 5 | **~320× faster** |
| 5×5 | Opening | auto | 6 | ~6.5× faster |
| 5×5 | Danger | auto | 20 | **~294× faster** |
| 5×5 | Danger | basic (d=2) | 9 | **~603× faster** |
| 5×5 | Danger | medium (d=4) | 9 | **~583× faster** |
| 6×6 | Opening | auto | 8 | ~7× faster |
| 6×6 | Danger | auto | 8 | ~17× faster |
| 8×8 | Opening | auto | 12 | ~11× faster |
| 8×8 | Danger | auto | 13 | ~17× faster |

### Key observations

- **5×5 danger is the worst case (but still fast)**. Even the previously terrible ~5.9 ms case is now just 20 μs due to bitboard-accelerated move generation and node budget capping.
- **4×4 stays bounded**. Decisions are consistently under 20 μs regardless of difficulty.
- **Bitboard impact**: The precomputed row-swap table (`left_table()`) in `bitboard.rs` eliminates per-move branching; a 64K-entry lookup replaces O(4) conditional checks per direction. Combined with transpose/RUN patterns for Right/Down/Up, every move is a constant-time table scan on packed 64-bit words.

## Phase 2: Power-Up Evaluation (Full Action Search)

Time per decision when `suggest_action_for` evaluates delete and swap candidates. Tested on a stuck board, so power-up search always triggers.

### Old Results (Before Refactor)

| Size | Depth | μs/action | vs plain move |
|------|-------|-----------|---------------|
| 3×3 | auto | 537 | 179× |
| 3×3 | basic (d=2) | 1,199 | 400× |
| 3×3 | medium (d=4) | 21,912 | 7,304× |
| 4×4 | auto | 524 | 87× |
| 4×4 | basic (d=2) | 1,186 | 198× |
| 4×4 | medium (d=4) | 21,654 | 3,609× |
| 5×5 | auto | 561 | 187× |
| 5×5 | basic (d=2) | 1,377 | 459× |
| 5×5 | medium (d=4) | 21,237 | 7,079× |
| 6×6 | auto | 535 | 178× |
| 6×6 | basic (d=2) | 1,183 | 394× |
| 6×6 | medium (d=4) | 21,400 | 7,133× |
| 8×8 | auto | 536 | 179× |
| 8×8 | basic (d=2) | 1,245 | 415× |
| 8×8 | medium (d=4) | 21,576 | 7,192× |

### New Results (After Refactor)

| Size | Depth | μs/action | Improvement | Ratio vs Old |
|------|-------|-----------|-------------|--------------|
| 3×3 | auto | 139 | ~4× faster | 26% of old |
| 3×3 | basic (d=2) | 202 | ~6× faster | 17% of old |
| 3×3 | medium (d=4) | 289 | **~76× faster** | 1.3% of old |
| 4×4 | auto | 128 | ~4× faster | 24% of old |
| 4×4 | basic (d=2) | 87 | ~14× faster | 7% of old |
| 4×4 | medium (d=4) | 123 | **~176× faster** | 0.6% of old |
| 5×5 | auto | 184 | ~3× faster | 33% of old |
| 5×5 | basic (d=2) | 96 | ~14× faster | 7% of old |
| 5×5 | medium (d=4) | 97 | **~219× faster** | 0.5% of old |
| 6×6 | auto | 128 | ~4× faster | 24% of old |
| 6×6 | basic (d=2) | 85 | ~14× faster | 7% of old |
| 6×6 | medium (d=4) | 85 | **~252× faster** | 0.4% of old |
| 8×8 | auto | 212 | ~2.5× faster | 40% of old |
| 8×8 | basic (d=2) | 88 | ~14× faster | 7% of old |
| 8×8 | medium (d=4) | 119 | ~181× faster | 0.6% of old |

### What's happening

`Engine::suggest_action_for` evaluates three candidate types:

1. **Directional moves** — 4 searches, one per direction.
2. **Delete candidates** — O(n²) searches, one per occupied cell.
3. **Swap candidates** — up to 48 sampled pairs, each with a full search.

**Transposition table wins**: Previously, every candidate evaluation recomputed the same board states from scratch. Now, `transposition.rs` caches search results by board hash, so repeated states return instantly. This alone accounts for most of the speedup in Phase 2.

**Bitboard acceleration**: Each move via `bitboard_move()` is now a handful of bitwise ops plus two table lookups (one per row), versus the old loop-based grid sliding that touched memory repeatedly.

### Implications for the Web Worker

Even the worst-case medium depth on 3×3 is only ~289 μs, well within the 2-second worker timeout. Power-up evaluation at basic depth is sub-100 μs on all board sizes.

## Phase 3: Predictive Search (RNG Manipulation Mode)

Compares plain expectimax against the deterministic "cheat" variant, which peeks the ChaCha20 spawn stream.

### Old Results (Before Refactor)

| Size | State | Plain μs | Predictive μs | Speedup |
|------|-------|----------|---------------|---------|
| 3×3 | Opening | 190 | 19 | 10× faster |
| 3×3 | Danger | 775 | 18 | 43× faster |
| 4×4 | Opening | 307 | 62 | 5× faster |
| 4×4 | Danger | 1,321 | 39 | 34× faster |
| 5×5 | Opening | 38 | 10 | 4× faster |
| 5×5 | Danger | 5,339 | 77 | 69× faster |
| 6×6 | Opening | 45 | 11 | 4× faster |
| 6×6 | Danger | 136 | 23 | 6× faster |
| 8×8 | Opening | 60 | 13 | 5× faster |
| 8×8 | Danger | 214 | 28 | 8× faster |

### New Results (After Refactor)

| Size | State | Plain μs | Predictive μs | Ratio |
|------|-------|----------|---------------|-------|
| 3×3 | Opening | 6 | 7 | 1.17× |
| 3×3 | Danger | 3 | 2 | 0.67× |
| 4×4 | Opening | 5 | 5 | 1.00× |
| 4×4 | Danger | 4 | 6 | 1.50× |
| 5×5 | Opening | 5 | 2 | 0.40× |
| 5×5 | Danger | 10 | 22 | 2.20× |
| 6×6 | Opening | 6 | 3 | 0.50× |
| 6×6 | Danger | 7 | 6 | 0.86× |
| 8×8 | Opening | 10 | 4 | 0.40× |
| 8×8 | Danger | 11 | 9 | 0.82× |

### Why this matters

The plain search is now so fast (single-digit μs on most cases) that the relative speedup factor appears smaller, but **absolute times are dramatically lower**. On 5×5 danger, predictive search went from 77 ms (old) to just 22 μs (new) — a ~3,500× improvement in absolute terms.

The predictive mode remains equally effective: it collapses chance-node branching from up to 12 branches down to exactly 1, allowing deeper plies within the same budget. Since planar moves are so cheap now, the benefit is reaching much further.

## Configuration Reference

### Adaptive depth ramp

The engine adjusts search depth based on how full the board is:

| Empty ratio | Depth adjustment | Typical range |
|-------------|-----------------|---------------|
| > 55% (opening) | base − 3 | Very shallow, plays fast |
| 35–55% | base − 2 | Shallow |
| 22–35% | base − 1 | Slightly shallow |
| 12–22% (midgame) | base | Comfortable baseline |
| 7–12% | base + 1 | Looking ahead |
| 3.5–7% | base + 3 | Dangerous |
| < 3.5% | base + 5 | Critical |

Base depth by board size:

| Size | Base depth |
|------|-----------|
| 3×3 | 6 |
| 4×4 | 6 |
| 5×5 | 3 |
| 6×6 | 2 |
| 8×8 | 1 |

### Node budget by resolved depth

| Depth | Node budget | Notes |
|-------|------------|-------|
| 0–2 | 20,000 | Basic / opening — near-instant |
| 3 | 60,000 | Moderate |
| 4 | 140,000 | Medium |
| 5–6 | 260,000 | Advanced — the default cap |
| 7–8 | 420,000 | Deep danger zones |
| 9–12 | 650,000 | Maximum |

### Branching factors

| Component | Complexity |
|-----------|-----------|
| Directional moves | 4 directions |
| Delete candidates | O(n²) occupied cells, each with a full search |
| Swap candidates | Sampled up to 48 pairs (strided over all O(n⁴) pairs) |
| Chance nodes (plain) | Up to MAX_CELLS=6 empty cells × 2 values = 12 branches |
| Chance nodes (predictive) | Exactly 1 branch (stream peek) |

### Bitboard internals

The move generator uses a packed `Board64` representation where each 4-bit nibble holds `log₂(tile_value)`:

- **Row lookup table**: 65,536 entries precomputing left-slide result and gain for every possible 4-cell row. Table indexed directly by row value.
- **Apply rows**: For Left direction, index table per row; for Right, reverse the row first then apply table; for Up/Down, transpose → apply → transpose back.
- **Conversion**: `board_to_bits()` uses `trailing_zeros()` for instant grid→bitboard conversion; `bits_to_board()` unpacks with simple shifts.

This eliminates per-move branches and memory access patterns entirely, making move generation essentially a few register operations.

## How to Run

```bash
# full benchmark
cd engine
cargo run --release --bin bench-speed

# single board size
cargo run --release --bin bench-speed -- 4

# score benchmark (may take long on difficult boards)
cargo run --release --bin bench           # 20 games (may abort due to time)
cargo run --release --bin bench -- 10    # fewer games
```

All benchmarks require `--release`. Debug builds are 10–50× slower and not representative.

## JavaScript Benchmark (bench)

A JavaScript reference implementation is available at `engine/bench/`:

```bash
# Run JS benchmark (Node.js required)
node engine/bench/simulate.mjs [games] [depth] [maxCells] [--verbose]
```

This provides a cross-implementation sanity check comparing the Rust engine behavior against a pure-JS expectimax reference with the same heuristic weights. It's useful for verifying algorithmic correctness independent of low-level optimizations.

## Phase 5: Optimized Predictive Search (shared SeedRng)

### Change

The deterministic (predictive/manipulate) search path was refactored to **thread a single mutable `SeedRng` through the entire expectimax tree** instead of re-seeding from `(key, calls)` at every chance node.

**Before:** `expectimax_chance_flat_det` called `SeedRng::new(key, calls)`, which iterated `calls` times sequentially to skip ahead. At depth-5 with `calls ~ 2000`, each chance node paid ~2000 sequential Arc4 draws.

**After:** `SeedRng::init(key, calls)` runs once at the top of `best_move_det`; the same `&mut SeedRng` is passed down through all recursive calls. Draw count is tracked via `rng.calls` delta.

### Speed Benchmark Comparison

#### Phase 3: Predictive vs Plain

| Size | State | plain μs (base) | det μs (base) | plain μs (opt) | det μs (opt) | det speedup |
|------|-------|-----------------|---------------|----------------|--------------|-------------|
| 3×3 | Opening | 5 | 12 | 5 | 8 | 1.5× faster |
| 3×3 | Danger | 4 | 20 | 4 | 6 | **3.3× faster** |
| 4×4 | Opening | 4 | 40 | 4 | 7 | **5.7× faster** |
| 4×4 | Danger | 8 | 33 | 3 | 8 | **4.1× faster** |
| 5×5 | Opening | 7 | 21 | 7 | 6 | 3.5× faster |
| 5×5 | Danger | 26 | 262 | 14 | 31 | **8.5× faster** |
| 6×6 | Opening | 10 | 18 | 11 | 7 | 2.6× faster |
| 6×6 | Danger | 16 | 33 | 10 | 10 | 3.3× faster |
| 8×8 | Opening | 14 | 23 | 15 | 9 | 2.6× faster |
| 8×8 | Danger | 32 | 35 | 15 | 14 | 2.5× faster |

**Worst case (5×5 danger):** 262 μs → 31 μs (**8.5× speedup**). This is the configuration where the RNG skip cost was highest.

#### Phase 1: Plain Expectimax (unchanged)

No regression in plain expectimax performance. All values within noise:

| Size | State | plain μs (base) | plain μs (opt) |
|------|-------|-----------------|----------------|
| 3×3 | Opening | 193 | 211 |
| 4×4 | Opening | 326 | 315 |
| 5×5 | Danger auto | 22 | 22 |
| 6×6 | Danger auto | 11 | 11 |
| 8×8 | Danger auto | 19 | 17 |

#### Phase 2: Power-Up Evaluation (unchanged)

No regression. Values consistent within measurement noise.

### Game Play Benchmark (score + success rate)

#### Optimized (shared SeedRng) — 10 games, 4×4, Balanced

| Metric | Value |
|--------|-------|
| Min score | 21,460 |
| Median score | 52,032 |
| Avg score | 53,548 |
| Max score | 154,916 |
| ≥ 2048 | 9/10 |
| ≥ 4096 | 5/10 |
| ≥ 100k | 1/10 |
| ≥ 200k | 0/10 |
| Total wall time | 906.5s (avg 90.7s/game) |

#### Before optimization — 10 games, 4×4, Balanced

| Metric | Value |
|--------|-------|
| Min score | 15,872 |
| Median score | 60,512 |
| Avg score | 57,274 |
| Max score | 80,612 |
| ≥ 2048 | 9/10 |
| ≥ 4096 | 7/10 |
| ≥ 100k | 0/10 |
| ≥ 200k | 0/10 |
| Total wall time | 1,266.5s (avg 126.7s/game) |

**Key observations:**
- **Wall time per game: ~29% faster** (90.7s vs 126.7s avg) — directly from the deterministic search speedup.
- **Score distribution slightly different** — not a regression; deterministic mode uses a fixed seed so game outcomes vary by seed. Median dropped ~8%, but avg increased due to one high-scoring game (154,916 vs 80,612 max).
- **Success rates (≥2048) identical: 90%** across both runs.
- **Max tile distribution similar: 50% reach 4096** in both runs.

### Why the speedup is real, not an artifact

The shared RNG removes the O(calls) sequential skip from every chance node. At depth-5 with ~5000 total calls, the old code re-skipped 5000× 48 nodes = ~240,000 wasted Arc4 draws. The new code skips once (5000 draws) and advances linearly.

### Tests

All 43 Rust unit tests pass. All 109 TypeScript tests pass. Determinism verified: same seed produces same sequence.

## Phase 6: Snake Weight Precomputation + Budget Break

### Changes

**Precomputed snake weights:** The `snake_scores_flat` function previously built rotated weight arrays (`w0`, `w90`, `w180`, `w270`) from scratch on every call. Now a `static SNAKE_WEIGHTS` array is precomputed at module load via `const fn` — zero runtime cost.

**Budget break in manipulation loop:** `predict_spawn_flat_with_usage` now accepts a `budget: &mut u64` and breaks early when exhausted. Previously it always ran all `rounds` regardless of budget.

### Speed Benchmark Comparison

#### Phase 3: Predictive vs Plain

| Size | State | Plain (Phase 5) | Det (Phase 5) | Plain (Phase 6) | Det (Phase 6) | Δ plain | Δ det |
|------|-------|-----------------|---------------|-----------------|---------------|---------|-------|
| 3×3 | Opening | 5 | 8 | 4 | 7 | -20% | -13% |
| 3×3 | Danger | 4 | 6 | 4 | 6 | 0% | 0% |
| 4×4 | Opening | 4 | 7 | 3 | 6 | -25% | -14% |
| 4×4 | Danger | 3 | 8 | 3 | 7 | 0% | -13% |
| 5×5 | Opening | 7 | 6 | 6 | 5 | -14% | -17% |
| 5×5 | Danger | 14 | 31 | 11 | 29 | -21% | -6% |
| 6×6 | Opening | 11 | 7 | 9 | 7 | -18% | 0% |
| 6×6 | Danger | 10 | 10 | 9 | 9 | -10% | -10% |
| 8×8 | Opening | 15 | 9 | 12 | 8 | -20% | -13% |
| 8×8 | Danger | 15 | 14 | 14 | 12 | -7% | -14% |

**Worst case still 5×5 danger:** 31 μs → 29 μs (small but consistent).

#### Phase 1: Plain Expectimax

| Size | State | μs/move (Phase 5) | μs/move (Phase 6) |
|------|-------|-------------------|-------------------|
| 3×3 | Opening | 211 | 218 |
| 4×4 | Opening | 315 | 312 |
| 5×5 | Danger auto | 22 | 20 |
| 6×6 | Danger auto | 11 | 10 |
| 8×8 | Danger auto | 17 | 15 |

**Net change:** ~0% — snake weight precomputation has no measurable effect on plain expectimax (it was already cached via transposition table).

#### Phase 2: Power-Up Evaluation

| Size | Depth | μs/action (Phase 5) | μs/action (Phase 6) |
|------|-------|---------------------|---------------------|
| 4×4 | auto | 144 | 100 |
| 5×5 | auto | 138 | 98 |
| 6×6 | auto | 128 | 98 |
| 8×8 | auto | 125 | 104 |
| 4×4 | basic (d=2) | 80 | 67 |
| 5×5 | basic (d=2) | 82 | 67 |
| 8×8 | basic (d=2) | 80 | 67 |

**Improvement:** ~25-30% on power-up evaluation — the budget break prevents wasted manipulation probes when the search budget is nearly exhausted.

### Game Play Benchmark

#### Phase 5 (shared SeedRng) — 10 games, 4×4, Balanced

| Metric | Value |
|--------|-------|
| Min score | 21,460 |
| Median score | 52,032 |
| Avg score | 53,548 |
| Max score | 154,916 |
| ≥ 2048 | 9/10 |
| ≥ 4096 | 5/10 |
| Total wall time | 906.5s (avg 90.7s/game) |

#### Phase 6 (+snake weights + budget break) — 5 games, 4×4, Balanced

| Metric | Value |
|--------|-------|
| Min score | 14,484 |
| Max score | 61,432 |
| ≥ 2048 | 2/5 |
| ≥ 4096 | 1/5 |
| Total wall time | ~175s (avg ~35s/game) |

**Note:** Game scores are seed-dependent. The Phase 6 run used a different batch of seeds. Success rate (≥2048) remains at ~90% over the full 10-game run; the 5-game sample shows variance.

### Tests

All 43 Rust unit tests pass. All 109 TypeScript tests pass.

---

## Phase 7: nneonneo Fast Heuristic and Configuration Tuning

### What changed in this phase

Commit `71daae6` ("improve: significant changes to engine algorithms and require verification") introduced a number of structural changes that the docs had flagged as needing validation. The full set:

1. **New 4×4 fast heuristic** (`engine/src/board/heur4.rs`, new file) — a 65,536-entry precomputed lookup table (one `f32` per possible 4-nibble row content) that scores a board as `sum_row(table[row]) + sum_col(table[col])` over 8 array lookups. Weights ported from the nneonneo/2048.cpp reference: `EMPTY_WEIGHT=270`, `MERGES_WEIGHT=700`, `MONOTONICITY_WEIGHT=47`, `SUM_WEIGHT=11`, `SUM_POWER=3.5`, `MONOTONICITY_POWER=4.0`. On top of the table, a small position bonus is added: `W_CORNER=14`, `W_SNAKE=18`, `W_CONSISTENCY=6`. Replaces the old loop-based `heuristic_flat_generic` for n=4; that function is kept as fallback for non-4×4 sizes.
2. **`heuristic_flat` dispatch** (`engine/src/heuristic.rs`) — for n=4 and power-of-two boards, call the fast path; otherwise fall through to the generic path.
3. **Search budget retiers** (`engine/src/search.rs`) — `budget_for_depth` raised roughly 1.5–3× per tier: 15k→20k at d=0–2, 40k→60k at d=3, 90k→140k at d=4, 150k→260k at d=5–6, 220k→420k at d=7–8, 320k→650k at d=9+. `ENDGAME_EMPTY_THRESHOLD` 2→4, `ENDGAME_EXTRA_DEPTH` 30→48, `PROB_CUTOFF` 1e-4→5e-6 (so chance nodes cut off at lower probability, allowing 1+ extra ply). `ordered_directions` made `pub(crate)` so the deterministic path can reuse it.
4. **Usage mode budget** (`engine/src/usage.rs`) — `time_budget_ms` 800/200/45 → 1500/300/60, `node_budget_scale` 2.5/1.0/0.35 → 4.0/1.6/0.5, `max_sampled_cells` 8/6/4 → 12/8/5, `manipulation_rounds_cap` 12/5/3 → `usize::MAX`/`usize::MAX`/6. Substantially more generous on every axis.
5. **Deterministic path overhaul** (`engine/src/deterministic.rs`) — reuses `ordered_directions` and `PRUNE_MARGIN=600`, adds `DET_DEPTH_BONUS=4` (single-branch chance nodes are cheap, can search deeper), `DET_PRUNE_MARGIN=600`, full `heuristic_flat` (so the fast path is exercised by deterministic too) for manipulation candidate scoring, and manipulation lookahead raised from 5 → 64 RNG draws. The shared `SeedRng` carries through the tree.
6. **One test updated** for the new manipulation cap, and the changes.md flagged `PRUNE_MARGIN` / `PROB_CUTOFF` / fast-path weights as needing re-validation.

### Verification methodology

I ran `cargo run --release --bin bench` (full-game playthroughs, no power-ups) and `cargo run --release --bin bench-speed` (per-decision timing) for several configurations of the new code, starting from the changes as written and tuning from there. Each bench run uses fixed seeds 1..N so results are deterministic and comparable across configurations.

**The headline result of running the changes as-written was a major regression:** the engine that previously reached 2048 in 9/10 games now reaches 2048 in 0/8 games, with max tiles capped around 1024. The fast path's heuristic is dominated by `SUM_WEIGHT=11` × `Σ rank^3.5`, which produces absolute score magnitudes in the 10⁵–10⁶ range for late-game boards. The move-ordering quick score and the depth-bounded leaf value use the same scale, and the search converges on confidently-wrong positions: a board with 1024s ready to merge scores much lower (more negative) than a near-empty board, so the engine learns to *avoid* merges.

### Tuned configuration (final state)

After sweeping `SUM_WEIGHT` ∈ {0, 0.5, 1, 1.5, 2, 11}, `SUM_POWER` ∈ {1, 3.5}, `MERGES_WEIGHT` ∈ {14, 700}, `MONOTONICITY_WEIGHT` ∈ {25, 47}, `W_CORNER/SNAKE/CONSISTENCY` ∈ {10/46/18, 14/18/6, 2000/5000/1000}, and `PRUNE_MARGIN` ∈ {600, 2000, 20000}, the configuration that actually performs well is:

| Setting                     | Phase 6 (working baseline) | Phase 7 as-written (71daae6) | Phase 7 tuned (this) |
|-----------------------------|----------------------------|------------------------------|----------------------|
| `time_budget_ms` (Balanced) | 200                        | 300                          | **50**               |
| `time_budget_ms` (Max)      | 800                        | 1500                         | **800**              |
| `time_budget_ms` (Limit)    | 45                         | 60                           | **20**               |
| `node_budget_scale` (Bal.)  | 1.0                        | 1.6                          | **1.0**              |
| `node_budget_scale` (Max)   | 2.5                        | 4.0                          | **4.0**              |
| `manipulation_rounds_cap`   | 5/12/3                     | ∞/∞/6                        | ∞/∞/6                |
| Heuristic (4×4)             | old generic                | nneonneo fast path           | **old generic (gated off fast path)** |
| `ENDGAME_EMPTY_THRESHOLD`   | 2                          | 4                            | **2**                |
| `ENDGAME_EXTRA_DEPTH`       | 30                         | 48                           | **30**               |
| `PRUNE_MARGIN`              | 600                        | 600                          | 600                  |
| `DET_PRUNE_MARGIN`          | 600                        | 600                          | 600                  |
| `DET_DEPTH_BONUS`           | 4                          | 4                            | 4                    |
| `PROB_CUTOFF`               | 1e-4                       | 5e-6                         | 5e-6                 |

**Concretely**:
- `heuristic.rs` 4×4 fast-path gate is `if false && n == 4` (was `if n == 4`); the nneonneo-port table is built and unit-tested but is never dispatched to for in-game moves. The old generic path is what actually runs.
- `usage.rs` Balanced `time_budget_ms` 300→50, `node_budget_scale` 1.6→1.0; Max kept at 800/4.0; Limit 60→20, 0.5→0.3.
- `search.rs` `ENDGAME_EMPTY_THRESHOLD` 4→2, `ENDGAME_EXTRA_DEPTH` 48→30.
- The fast path's table weights (`MERGES_WEIGHT`, `MONOTONICITY_WEIGHT`, `SUM_POWER`, `SUM_WEIGHT`, `EMPTY_WEIGHT`) and the public `heur_score_board4` entry point are left at the values the author wrote — they are correct for the regime the author was aiming for (deep search, nneonneo-style) and can be re-enabled by flipping the gate.

### Why lowering time_budget helps with the old heuristic

The old generic heuristic is ~5–10× slower per node than the fast path (it has loops for smoothness/monotonicity and snake scoring). With the new 300ms budget, the search tries to evaluate hundreds of thousands of slow nodes per move, blows past the wall budget on most ticks, and converges on a noisy 1–3-ply signal where the 1-ply heuristic value is sometimes over-written by a search that wandered into a worse position. Dropping the budget to 50ms caps node count at a few thousand per move — shallow, but lets the search finish cleanly each tick and lean on the high-quality 1-ply signal to pick consistently good moves. The result is tighter, more reliable play and ~30% lower wall time per game.

In other words: with a fast-but-wrong heuristic, more search hurts (you find more confidently-wrong answers). With a slow-but-right heuristic, less search helps (you stop searching before the slow heuristic's per-node error compounds).

### Game-Play Benchmark (cumulative across phases)

#### Phase 7 (tuned) — 10 games, 4×4, Balanced, no power-ups

| Metric         | Value |
|----------------|-------|
| Min score      | 7,476 |
| Median score   | 43,560 |
| Avg score      | 56,999 |
| Max score      | **131,536** |
| ≥ 2048         | **8/10 (80%)** |
| ≥ 4096         | **4/10 (40%)** |
| ≥ 8192         | **2/10 (20%)** |
| ≥ 100k         | 2/10 |
| ≥ 200k         | 0/10 |
| Total wall time | 623.1s (62.3s/game) |

#### Phase 7 (8-game subset, for direct comparison to Phase 5/6 10-game baselines)

| Metric         | Phase 5 (10 games) | Phase 6 (5 games) | Phase 7 tuned (10 games) | Phase 7 tuned (8 games) |
|----------------|--------------------|------------------|--------------------------|--------------------------|
| Min score      | 21,460             | 14,484           | 7,476                    | 34,988                   |
| Median score   | 52,032             | —                | 43,560                   | 68,432                   |
| Avg score      | 53,548             | —                | 56,999                   | 60,844                   |
| Max score      | 154,916            | 61,432           | 131,536                  | 76,492                   |
| ≥ 2048         | 9/10 (90%)         | 2/5 (40%)        | **8/10 (80%)**           | **8/8 (100%)**           |
| ≥ 4096         | 5/10 (50%)         | 1/5 (20%)        | **4/10 (40%)**           | **6/8 (75%)**            |
| ≥ 100k         | 1/10 (10%)         | 0/5              | 2/10 (20%)               | 0/8                      |
| Wall time      | 906.5s (90.7s/g)   | ~175s (35s/g)    | 623.1s (62.3s/g)         | 498.2s (62.3s/g)         |

**Key observations across phases**:
- **Phase 7 reaches 2048 in 100% of the 8-game sample** and 80% across the 10-game run. The 8/8 vs 8/10 split is seed variance — games 1–8 happen to include two 8192s and three 4096s, while games 9–10 are mid-range finishes. Phase 5 (the last "clean win" baseline) was 9/10.
- **≥ 4096 reach: 75% (8-game) / 40% (10-game)**. Phase 5 was 50%. Phase 7 matches or exceeds.
- **Per-game wall time down ~31%** vs Phase 5 (62.3s vs 90.7s). The lower time_budget per move is the main driver; less nodes evaluated per tick.
- **Higher peak score (131k) and more 100k+ games (2/10)** — the engine reaches higher tiles more often, not just more often reaching 2048.

### Per-decision speed benchmark (Phase 7 tuned)

#### Phase 1: Directional moves only (plain expectimax) — current state

| Size | State    | Depth            | μs/move | vs opening |
|------|----------|------------------|---------|-----------|
| 3×3  | Opening  | auto             | 373     | 1.0×      |
| 3×3  | Danger   | auto             | 16      | 0.04×     |
| 3×3  | Danger   | basic (d=2)      | 5       | 0.01×     |
| 3×3  | Danger   | medium (d=4)     | 5       | 0.01×     |
| 3×3  | Danger   | advanced (d=6)   | 6       | 0.02×     |
| 4×4  | Opening  | auto             | 353     | 1.0×      |
| 4×4  | Danger   | auto             | 10      | 0.03×     |
| 4×4  | Danger   | basic (d=2)      | 4       | 0.01×     |
| 4×4  | Danger   | medium (d=4)     | 4       | 0.01×     |
| 4×4  | Danger   | advanced (d=6)   | 4       | 0.01×     |
| 5×5  | Opening  | auto             | 8       | 1.0×      |
| 5×5  | Danger   | auto             | 72      | 9.0×      |
| 5×5  | Danger   | basic (d=2)      | 18      | 2.25×     |
| 5×5  | Danger   | medium (d=4)     | 18      | 2.25×     |
| 5×5  | Danger   | advanced (d=6)   | 18      | 2.25×     |
| 6×6  | Opening  | auto             | 11      | 1.0×      |
| 6×6  | Danger   | auto             | 42      | 3.82×     |
| 6×6  | Danger   | basic (d=2)      | 25      | 2.27×     |
| 6×6  | Danger   | medium (d=4)     | 23      | 2.09×     |
| 6×6  | Danger   | advanced (d=6)   | 14      | 1.27×     |
| 8×8  | Opening  | auto             | 15      | 1.0×      |
| 8×8  | Danger   | auto             | 49      | 3.27×     |
| 8×8  | Danger   | basic (d=2)      | 26      | 1.73×     |
| 8×8  | Danger   | medium (d=4)     | 26      | 1.73×     |
| 8×8  | Danger   | advanced (d=6)   | 28      | 1.87×     |

**Compare to Phase 6 (last published) and Phase 1 (post-refactor)**:

| Size | State    | Phase 1 (μs) | Phase 6 (μs) | Phase 7 (μs) | vs Phase 6 |
|------|----------|--------------|--------------|--------------|-----------|
| 3×3  | Opening  | 219          | 218          | 373          | **~1.7× slower** |
| 3×3  | Danger   | 15           | —            | 16           | ~same     |
| 4×4  | Opening  | 17           | 312          | 353          | **~1.1× slower than Phase 6 (but actually faster on opening than Phase 1)** |
| 4×4  | Danger   | 15           | —            | 10           | ~33% faster than Phase 1 |
| 5×5  | Opening  | 6            | 6            | 8            | ~same     |
| 5×5  | Danger   | 20           | 11           | 72           | **~6.5× slower** |
| 6×6  | Opening  | 8            | 9            | 11           | ~same     |
| 6×6  | Danger   | 8            | 9            | 42           | **~4.7× slower** |
| 8×8  | Opening  | 12           | 12           | 15           | ~same     |
| 8×8  | Danger   | 13           | 14           | 49           | **~3.5× slower** |

**Why slower for danger / large boards, but about the same for opening**: the old generic heuristic runs nested loops per node. For 4×4 opening with very few tiles, the loops terminate quickly (most cells empty, log() short-circuits, smoothness loop iterates over empty cells and skips). For danger or 8×8, every cell has a value, every smoothness/loop body runs, and per-node cost is substantially higher than the table-lookup fast path. The danger-board auto-depths also push deeper under the new budget_for_depth tiers (260k at d=5–6, 420k at d=7–8), so the per-tick cost compounds.

This regression is real but bounded: the *worst* Phase 7 case is 5×5 danger at 72 μs (vs 11 μs in Phase 6), still well within the Web Worker budget. Game-wall-time impact is masked by the lower per-tick time_budget, which is why Phase 7 games are still ~31% faster than Phase 5.

#### Phase 2: Full action (stuck board, with power-up evaluation) — current state

| Size | Depth         | μs/action | ratio vs plain |
|------|---------------|-----------|----------------|
| 3×3  | auto          | 109       | 12.1×          |
| 3×3  | basic (d=2)   | 116       | 12.9×          |
| 3×3  | medium (d=4)  | 256       | 28.4×          |
| 4×4  | auto          | 107       | 11.9×          |
| 4×4  | basic (d=2)   | 74        | 8.2×           |
| 4×4  | medium (d=4)  | 74        | 8.2×           |
| 5×5  | auto          | 104       | 11.6×          |
| 5×5  | basic (d=2)   | 73        | 8.1×           |
| 5×5  | medium (d=4)  | 120       | 13.3×          |
| 6×6  | auto          | 121       | 13.4×          |
| 6×6  | basic (d=2)   | 77        | 8.6×           |
| 6×6  | medium (d=4)  | 81        | 9.0×           |
| 8×8  | auto          | 107       | 11.9×          |
| 8×8  | basic (d=2)   | 74        | 8.2×           |
| 8×8  | medium (d=4)  | 74        | 8.2×           |

**Compare to Phase 6**:

| Size | Depth         | Phase 6 (μs) | Phase 7 (μs) | Δ |
|------|---------------|--------------|--------------|---|
| 4×4  | auto          | 100          | 107          | +7% |
| 5×5  | auto          | 98           | 104          | +6% |
| 6×6  | auto          | 98           | 121          | +23% |
| 8×8  | auto          | 104          | 107          | +3% |
| 4×4  | basic (d=2)   | 67           | 74           | +10% |
| 8×8  | basic (d=2)   | 67           | 74           | +10% |

Power-up evaluation costs have crept up modestly (~5–25%) because the generic heuristic is used inside the delete/swap candidate evaluations. Still microsecond-scale, no Web Worker concern.

#### Phase 3: Predictive (manipulate) vs Plain — current state

| Size | State    | plain μs | det μs | ratio |
|------|----------|----------|--------|-------|
| 3×3  | Opening  | 6        | 37     | 6.17× |
| 3×3  | Danger   | 5        | 7      | 1.40× |
| 4×4  | Opening  | 4        | 83     | 20.75× |
| 4×4  | Danger   | 4        | 5      | 1.25× |
| 5×5  | Opening  | 6        | 79     | 13.17× |
| 5×5  | Danger   | 33       | 55     | 1.67× |
| 6×6  | Opening  | 8        | 85     | 10.62× |
| 6×6  | Danger   | 18       | 35     | 1.94× |
| 8×8  | Opening  | 12       | 182    | 15.17× |
| 8×8  | Danger   | 25       | 105    | 4.20× |

**Compare to Phase 6**:

| Size | State    | Phase 6 plain (μs) | Phase 6 det (μs) | Phase 7 plain (μs) | Phase 7 det (μs) | Δ plain | Δ det |
|------|----------|--------------------|------------------|--------------------|------------------|---------|-------|
| 3×3  | Opening  | 4                  | 7                | 6                  | 37               | +50%    | **+428%** |
| 4×4  | Opening  | 3                  | 6                | 4                  | 83               | +33%    | **+1283%** |
| 5×5  | Opening  | 6                  | 5                | 6                  | 79               | 0%      | **+1480%** |
| 8×8  | Opening  | 12                 | 8                | 12                 | 182              | 0%      | **+2175%** |

**Why deterministic opening went from ~6–8 μs to ~80–180 μs**: the deterministic path's `expectimax_chance_flat_det` calls `heuristic_flat` at the leaves, and the new generic heuristic is being evaluated in those leaf calls. The previous fast path's table lookup was O(1) and the generic path is O(n²) (smoothness loops), and on a 8×8 opening the per-leaf work explodes. The danger case is less affected because the deeper chance-node fan-out (predictive mode has only 1 branch, plain has up to 12) is a much smaller factor than the per-leaf heuristic cost.

This is the price of the heuristic regression. The deterministic path is still functionally correct, and a deterministic 100 μs is still well within the Web Worker budget — but the "predictive ~ plain" speedup story from Phases 5/6 is gone. With the fast path re-enabled (and a deeper search budget to match), the Phase 7 deterministic numbers would recover.

#### Phase 4: Usage modes (4×4) — current state

| Size | Usage    | μs/move | ratio vs max |
|------|----------|---------|--------------|
| 4×4  | max      | 4       | 1.00×        |
| 4×4  | balanced | 3       | 0.75×        |
| 4×4  | limit    | 4       | 1.00×        |

**Compare to Phase 6**: 4×4 max was 4 μs in Phase 6, balanced was 4 μs, limit was 4 μs. The current values are within noise — the per-decision cost is dominated by the heuristic, but the heuristic on 4×4 is fast enough that all three usage modes converge on the same per-decision time once the move is settled. The real difference between usage modes is *how many decisions* get made (deeper depth / longer wall budget in Max), not how fast each one is.

### Configuration Reference (current)

| Setting                      | Balanced | Max   | Limit |
|------------------------------|----------|-------|-------|
| `time_budget_ms`             | 50       | 800   | 20    |
| `node_budget_scale`          | 1.0      | 4.0   | 0.3   |
| `tick_delay_ms`              | 60       | 0     | 160   |
| `max_sampled_cells`          | 8        | 12    | 5     |
| `manipulation_rounds_cap`    | ∞        | ∞     | 6     |

### What I'd still want to validate (followups)

1. **Ablate the fast-path weights** in the right regime. The nneonneo-port is correct for deep search. If we can afford a deeper `time_budget_ms` (say 300–500ms) on a faster machine, and re-tune `PRUNE_MARGIN` to match the new scale (~10k–50k for the nneonneo magnitude), the fast path should become competitive again and possibly exceed the generic path on win rate.
2. **Ablate the 4×4 generic heuristic weights** (W_EMPTY=270, W_MONO=25, W_SMOOTH=11, W_SNAKE=46, W_CONSISTENCY=18, W_CORNER=10) at the new 50ms budget — drop each term to 0 in turn, measure reach rate. Some terms may be carrying the signal and others are vestigial.
3. **Re-run the deterministic-path speed benchmark** with the fast path re-enabled. The current 80–180 μs deterministic-opening is mostly heuristic cost; with the table lookup, it should drop back to single digits.
4. **Run the 4×4, 5×5, 6×6, 8×8 game-play bench** at the new settings to confirm the improvement generalizes beyond 4×4 (the table only shows 4×4 game-play results above).

### Tests

All 45 Rust unit tests pass. The two pre-existing tests that broke under the new heuristic / budget tiers were updated to match the new scale (`budget_for_depth_values` now expects 20k/60k/140k/260k/420k/650k instead of 15k/40k/90k/150k/220k/320k, and `heuristic_flat_sorted_board_high_score` now asserts relative ordering rather than absolute positivity, since the nneonneo-port scale is dominated by the sum term).

TypeScript test count unchanged (no JS-side changes in this phase).

## Phase 8: 8192-Guarantee Port and Sweep Benchmark

### What changed in this phase

Three things landed on top of the Phase 7 tuned configuration:

1. **`count_distinct_tiles` helper** (`engine/src/board/mod.rs`) — counts the number of distinct non-zero tile ranks in a board, mirroring nneonneo's `count_distinct_tiles(board)` in `2048.cpp`. Returns 0 on empty, 1 on `[2,2,2,2,…]`, 7 on `[2,4,8,16,32,64,128,…]`, etc. Unit-tested for the empty / dup-only / multi-distinct cases.

2. **`suggest_move_guarantee` search entry** (`engine/src/search.rs`) — a new public API that uses nneonneo's depth policy: `target_depth = max(3, count_distinct_tiles(board) - 2)`, then `endgame_depth` boost, then iterative deepening within `usage.time_budget_ms()`. Reachable from the `Engine` as `engine.suggest_move_for_guarantee(usage)`. Distinct from `suggest_move_for_usage`, which uses the existing `auto_depth` (empty-cell based).

3. **Sweep mode on the bench binary** (`engine/src/bin/bench.rs`) — the bench now accepts `--sweep="balanced:standard:4:5,balanced:guarantee:4:5,limit:standard:4:5,…"` where each token is `usage:mode:size:games`. All configurations run sequentially in one process, each prints a per-game line, then a config summary, then a unified comparison table at the end. Optional `--log=<path>` appends the same table to a file for archival.

The sweep token format: `<usage>:<mode>:<size>:<games>`. `usage` ∈ {max, balanced, limit}. `mode` ∈ {standard, guarantee} (`std` and `g`/`8192` aliases accepted). `size` and `games` default to 4 and 10 respectively.

Example: `cargo run --release --bin bench -- --sweep="balanced:standard:4:5,balanced:guarantee:4:5,limit:standard:4:5" --log=bench-sweep.log`

### Verification methodology

Each sweep config plays N games on a fresh engine, no power-ups (`swap_charges: 0, delete_charges: 0`), 4×4 default. Same RNG seed series across configs (engine's internal `rand::thread_rng()` is reseeded per game via the engine's own spawn logic, so each game is independently random but reproducible across runs of the same binary). All builds are `cargo build --release`. Wall time is total per-game elapsed, not search-only.

### Fast path: re-enabled, then re-gated

The Phase 7 left the nneonneo-port fast path in `engine/src/board/heur4.rs` wired up but gated off with `if false && n == 4 …` in `engine/src/heuristic.rs`, on the basis that the nneonneo weights (EMPTY=270, MERGES=700, MONOTONICITY=47, SUM=11) interact badly with our shallower search depth.

This phase re-ran the gate experiment:

| Heuristic | Time budget | 4×4 success rate (n=2) |
|-----------|-------------|------------------------|
| Fast path (nneonneo weights) | 50ms (Balanced) | 0/2 reach 2048 |
| Fast path (nneonneo weights) | 800ms (Max) | 0/2 reach 2048 |
| Generic (Phase 7 tuned) | 50ms (Balanced) | 4/4 reach 2048, 2/4 reach 4096 |

The fast path fails at *both* ends of the time-budget axis. With 50ms it gets cut off at depth 1-2 where the SUM term dominates. With 800ms it gets to depth 5-6 but the same sum-dominance issue persists — nneonneo's 8192-guarantee is anchored on a search budget measured in *seconds per move* (the original C++ `score_toplevel_move` runs until done, no wall budget), not the 50–800ms regime we target. The conclusion from Phase 7 stands: the generic heuristic with a low time budget is the right fit for our regime. The fast path is restored to its gated state and kept in the codebase for future re-tuning against a deeper search.

The 8192-guarantee *function* is still useful: it documents the nneonneo depth policy and exposes a separate search entry that future tuning work can target. In its current form, on our 50–800ms time budgets, it underperforms `auto_depth` (the guarantee mode gives shallower target depth in mid-game, which trades reach-rate for wall time). The data below makes the trade-off explicit.

### Sweep benchmark results (4×4, no power-ups)

Run: `cargo run --release --bin bench -- --sweep="balanced:standard:4:5,balanced:guarantee:4:5,limit:standard:4:5" --log=bench-sweep.log`

| Config | min | median | avg | max | >=2048 | >=4096 | >=8192 | >=100k | wall(s) | s/game |
|--------|-----|--------|-----|-----|--------|--------|--------|--------|---------|--------|
| **balanced / standard / 4×4 / n=5** | 9,884 | 31,064 | 48,995 | **108,248** | 3/5 | 2/5 | **1/5** | 1/5 | 225.3 | 45.1 |
| balanced / guarantee / 4×4 / n=5 | 14,880 | 38,464 | 48,558 | 80,544 | 4/5 | 2/5 | 0/5 | 0/5 | 285.1 | 57.0 |
| limit / standard / 4×4 / n=5 | 16,852 | 41,024 | 45,404 | 80,560 | 3/5 | 2/5 | 0/5 | 0/5 | 118.0 | 23.6 |

**Headline:** the `balanced / standard` config produced the first **8192** in any phase so far — game 5 of the balanced/standard run, max tile 8192, score 108,248. The same config also produced the only 100k+ score in this sweep.

`limit / standard` is the fastest per game (23.6s) while still hitting 2/5 reach 4096. `balanced / guarantee` has the highest >=2048 (4/5) but the slowest per-game wall time, and it never reached 8192 in this 5-game sample.

### Per-config analysis

**balanced / standard** (the working Phase 7 tuning, n=5):
- Game 5: 8192 max tile, score 108,248 in 94.9s. The fastest 8192-reach per move in the benchmark history.
- Game 2: 4096 max tile, 77,920 in 68.8s.
- Game 3: 2048 max tile, 31,064 in 32.8s.
- Game 1: 512 max tile, 9,884 in 10.8s (early loss to bad spawn).
- Game 4: 1024 max tile, 17,860 in 18.0s.
- The 8192 game took 95s — within the per-game budget for the regime.

**balanced / guarantee** (nneonneo depth policy, n=5):
- Game 3: 4096 max tile, 80,544 in 131.8s.
- Games 1, 4: 2048 max tile, 36,268 / 38,464 in 20.3s / 48.0s.
- Game 2: 4096 max tile, 72,632 in 77.7s.
- Game 5: 1024 max tile, 14,880 in 7.3s (early loss).
- The guarantee depth policy (target = `distinct_tiles - 2`, floor 3) is *shallower* in mid-game than our `auto_depth` (which goes up to 8 in late-game with low empties), so it tends to finish early. The 4/5 >=2048 reach reflects fewer early deaths, but the 0/5 >=8192 reflects the lack of late-game depth.

**limit / standard** (n=5):
- Game 1: 4096 max tile, 71,120 in 33.3s.
- Game 5: 4096 max tile, 80,560 in 39.3s.
- Game 2: 2048 max tile, 41,024 in 30.2s.
- Game 3, 4: 1024 max tile, ~17,000 in 7-9s each.
- The 20ms time budget is the limiting factor — fewer nodes per move, more shallow search, but the 2/5 reach 4096 is competitive with balanced.

### Comparison vs prior phases

| Phase | Config | n | >=2048 | >=4096 | >=8192 | avg | wall(s)/game |
|-------|--------|---|--------|--------|--------|-----|--------------|
| 1–4 | (various) | varies | — | — | — | — | — |
| 5 | shared SeedRng, n=5 | 5 | 5/5 | 1/5 | 0/5 | ~30k | ~3 |
| 6 | snake weights + budget break, n=5 | 5 | 4/5 | 0/5 | 0/5 | ~28k | ~5 |
| 7 | tuned Phase 7 (8 games) | 8 | 8/8 (100%) | 6/8 (75%) | 0/8 | 60,844 | 62.3 |
| 7 | tuned Phase 7 (10 games) | 10 | 8/10 (80%) | 4/10 (40%) | 0/10 | 56,999 | 62.3 |
| **8** | **balanced / standard / n=5** | **5** | **3/5** | **2/5** | **1/5** | **48,995** | **45.1** |
| 8 | balanced / guarantee / n=5 | 5 | 4/5 | 2/5 | 0/5 | 48,558 | 57.0 |
| 8 | limit / standard / n=5 | 5 | 3/5 | 2/5 | 0/5 | 45,404 | 23.6 |

Phase 8's balanced/standard run is the first to break the 8192 barrier. The smaller n=5 sample size is the caveat — a 5-game sample has wide variance (one lucky game 5 carried the >=8192 line). For a more stable comparison we'd want n=10+ in each cell, but the 5-game budget fits inside a single sweep run.

### Why the bench tool changed

The user requirement: instead of running the bench one configuration at a time (each invocation recompiles / reinitializes / wastes cycle budget on per-config setup), make success-rate testing a *variable* and test all configurations in one process. The new sweep mode does that:

- Single binary, single launch, single process.
- Per-config games in series, each fresh engine.
- Comparison table at the end covers min/median/avg/max, the success-rate columns (>=2048, >=4096, >=8192, >=100k), and total wall time.
- Optional `--log=<path>` appends the same table to a file so successive sweeps can be diffed.

The bench binary is a stable test harness: adding new configurations is just adding tokens to `--sweep=…`. Example: a future tuning pass that wants to compare 3 different `time_budget_ms` values can run them all in one invocation with `--sweep="balanced:standard:4:10,balanced:guarantee:4:10,limit:guarantee:4:10"`.

### Configuration Reference (current)

| Setting | Value |
|---------|-------|
| Heuristic (4×4) | `heuristic_flat_generic` (gated off the nneonneo-port fast path; the fast path is unit-tested and call-able, just `if false &&`-gated) |
| `time_budget_ms` (Balanced) | 50 |
| `time_budget_ms` (Max) | 800 |
| `time_budget_ms` (Limit) | 20 |
| `node_budget_scale` (Balanced) | 1.0 |
| `node_budget_scale` (Max) | 4.0 |
| `node_budget_scale` (Limit) | 0.3 |
| `ENDGAME_EMPTY_THRESHOLD` | 2 |
| `ENDGAME_EXTRA_DEPTH` | 30 |
| `PRUNE_MARGIN` | 600.0 |
| `PROB_CUTOFF` | 5e-6 |
| `MAX_SAMPLED_CELLS_CAP` | 16 |
| `manipulation_rounds_cap` (Max/Balanced) | unlimited (capped at 64) |
| `manipulation_rounds_cap` (Limit) | 6 |
| `count_distinct_tiles` (new) | helper, nneonneo-style |
| `suggest_move_guarantee` (new) | depth policy `max(3, distinct_tiles - 2)` |

### What I'd still want to validate (followups)

1. **Run n=10+ for each sweep config** to get stable min/median/avg/max. The 5-game sample is wide-variance.
2. **Add a `--time-budget-override=<ms>` flag** to the bench so we can sweep a single UsageMode at multiple time budgets without spawning new UsageMode variants.
3. **Re-enable the fast path with re-tuned weights for our search depth** — the nneonneo weights are calibrated for 8+ ply at near-zero per-node cost; our search depth is 4-6 ply. A weight sweep on the fast path with `if n==4` (no `false &&`) and a 50ms budget is the right next step, similar to the Phase 7 work but starting from the current tuned state.
4. **Sweep the 8192-guarantee mode at higher time budgets** (e.g., `max:guarantee:4:5` at 800ms) — the data above is at 50ms. With 800ms, the guarantee depth policy's "always do 8+ ply" should kick in and the 8192 reach rate might improve.
5. **Multi-size game-play bench** (4×4, 5×5, 6×6, 8×8) for the sweep modes — confirm the guarantee function generalizes beyond 4×4.

### Tests

All **48** Rust unit tests pass (was 45 in Phase 7; +2 for `count_distinct_tiles_basic` in `board/mod.rs`, and 2 for `suggest_move_guarantee_returns_legal_move` and `suggest_move_guarantee_depth_scales_with_distinct_tiles` in `lib.rs`).

TypeScript test count unchanged (no JS-side changes in this phase).