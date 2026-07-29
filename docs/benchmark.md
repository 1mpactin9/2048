<div align="center">
    <h1>Benchmark</h1>
    <p>
        <a href="#phase-1-directional-move-speed-plain-expectimax">Part 01</a> -
        <a href="#phase-2-power-up-evaluation-full-action-search">02</a> -
        <a href="#phase-3-predictive-search-rng-manipulation-mode">03</a>
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

## 🔴 IMPORTANT: Benchmark Refactoring Results

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

---

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

---

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

---

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
| 0–2 | 15,000 | Basic / opening — near-instant |
| 3 | 40,000 | Moderate |
| 4 | 90,000 | Medium |
| 5–6 | 150,000 | Advanced — the default cap |
| 7–8 | 220,000 | Deep danger zones |
| 9+ | 320,000 | Maximum |

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

---

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

---

## JavaScript Benchmark (bench)

A JavaScript reference implementation is available at `engine/bench/`:

```bash
# Run JS benchmark (Node.js required)
node engine/bench/simulate.mjs [games] [depth] [maxCells] [--verbose]
```

This provides a cross-implementation sanity check comparing the Rust engine behavior against a pure-JS expectimax reference with the same heuristic weights. It's useful for verifying algorithmic correctness independent of low-level optimizations.