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

## Phase 1: Directional Move Speed (Plain Expectimax)

Time per decision when only picking a direction. No power-up evaluation.

| Size | State | Depth | μs/decision | vs opening |
|------|-------|-------|-------------|-----------|
| 3×3 | Opening | auto | 28 | 1.0× |
| 3×3 | Danger | auto | 40 | 1.43× |
| 4×4 | Opening | auto | 37 | 1.0× |
| 4×4 | Danger | auto | 143 | 3.86× |
| 4×4 | Danger | basic (d=2) | 108 | 2.92× |
| 4×4 | Danger | medium (d=4) | 101 | 2.73× |
| 4×4 | Danger | advanced (d=6) | 93 | 2.51× |
| 5×5 | Opening | auto | 9 | 1.0× |
| 5×5 | Danger | auto | 538 | 59.78× |
| 5×5 | Danger | basic (d=2) | 447 | 49.67× |
| 5×5 | Danger | medium (d=4) | 609 | 67.67× |
| 5×5 | Danger | advanced (d=6) | 538 | 59.78× |
| 6×6 | Opening | auto | 20 | 1.0× |
| 6×6 | Danger | auto | 24 | 1.20× |
| 6×6 | Danger | basic (d=2) | 17 | 0.85× |
| 6×6 | Danger | medium (d=4) | 34 | 1.70× |
| 6×6 | Danger | advanced (d=6) | 49 | 2.45× |
| 8×8 | Opening | auto | 33 | 1.0× |
| 8×8 | Danger | auto | 49 | 1.48× |
| 8×8 | Danger | basic (d=2) | 51 | 1.55× |
| 8×8 | Danger | medium (d=4) | 31 | 0.94× |
| 8×8 | Danger | advanced (d=6) | 33 | 1.00× |

### Key observations

- **5×5 danger is the worst case.** Adaptive depth ramps to ~8 on nearly-full boards, producing large search trees. At 538 μs, it's the slowest configuration tested.
- **4×4 stays bounded.** Even in danger, the 150k node budget and capped branching (MAX_CELLS=6) keep decisions under 150 μs.
- **Larger boards stay fast.** 6×6 and 8×8 use shallower base depths (2 and 1), so they never explode. 6×6 danger even completes faster than opening due to adaptive depth reduction.
- **Depth has diminishing returns past d=2** on 4×4 danger — the node budget caps expansion regardless of requested depth. On 8×8, deeper searches can actually be faster due to smaller branching factor.

## Phase 2: Power-Up Evaluation (Full Action Search)

Time per decision when `suggest_action_for` evaluates delete and swap candidates. Tested on a stuck board, so power-up search always triggers.

| Size | Depth | μs/action | vs plain move |
|------|-------|-----------|---------------|
| 3×3 | auto | 64 | 64.00× |
| 3×3 | basic (d=2) | 287 | 287.00× |
| 3×3 | medium (d=4) | 3,602 | 3,602.00× |
| 4×4 | auto | 63 | 63.00× |
| 4×4 | basic (d=2) | 181 | 181.00× |
| 4×4 | medium (d=4) | 2,631 | 2,631.00× |
| 5×5 | auto | 62 | 62.00× |
| 5×5 | basic (d=2) | 133 | 133.00× |
| 5×5 | medium (d=4) | 2,732 | 2,732.00× |
| 6×6 | auto | 65 | 65.00× |
| 6×6 | basic (d=2) | 133 | 133.00× |
| 6×6 | medium (d=4) | 2,582 | 2,582.00× |
| 8×8 | auto | 63 | 63.00× |
| 8×8 | basic (d=2) | 134 | 134.00× |
| 8×8 | medium (d=4) | 2,638 | 2,638.00× |

### What's happening

`Engine::suggest_action_for` evaluates three candidate types:

1. **Directional moves** — 4 searches, one per direction.
2. **Delete candidates** — O(n²) searches, one per occupied cell.
3. **Swap candidates** — up to 48 sampled pairs, each with a full search.

At `auto` or `basic (d=2)`, each search is cheap (~10–50 μs), so totals stay under 1.4 ms. At `medium (d=4)`, each search balloons to ~400–500 μs, and dozens of candidates push the total past 2 ms.

### Implications for the Web Worker

The worker has a 2-second timeout per decision. Even the worst case here (~3.6 ms on 3×3) is well within budget. But a larger board with more occupied cells could push closer to the limit — which is why the browser defaults to `depth=0` (auto) instead of fixed medium/advanced.

## Phase 3: Predictive Search (RNG Manipulation Mode)

Compares plain expectimax against the deterministic "cheat" variant, which peeks the ChaCha20 spawn stream. Predictive search collapses each chance node from up to 12 branches (6 empty cells × {2, 4}) down to exactly 1, so the same node budget reaches much deeper plies.

| Size | State | Plain μs | Predictive μs | Speedup |
|------|-------|----------|---------------|---------|
| 3×3 | Opening | 45 | 5 | 9.0× faster |
| 3×3 | Danger | 69 | 2 | 34.5× faster |
| 4×4 | Opening | 37 | 4 | 9.3× faster |
| 4×4 | Danger | 90 | 4 | 22.5× faster |
| 5×5 | Opening | 8 | 2 | 4.0× faster |
| 5×5 | Danger | 448 | 19 | 23.6× faster |
| 6×6 | Opening | 11 | 3 | 3.7× faster |
| 6×6 | Danger | 18 | 5 | 3.6× faster |
| 8×8 | Opening | 18 | 4 | 4.5× faster |
| 8×8 | Danger | 29 | 7 | 4.1× faster |

### Why this matters

Turning RNG manipulation **on** doesn't slow the AI down — it speeds it up dramatically. Predictive search is the same algorithm, just with a deterministic chance node instead of probabilistic branching. On 5×5 danger (the slowest plain case), manipulation drops 538 μs to 19 μs (~28× faster).

This also means `suggest_move_det` / `suggest_action_det` are cheaper than their plain counterparts — useful, since they're called every auto-play tick when manipulation is on.

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

## How to Run

```bash
# full benchmark
cd engine
cargo run --release --bin bench-speed

# single board size
cargo run --release --bin bench-speed -- 4

# score benchmark
cargo run --release --bin bench           # 20 games
cargo run --release --bin bench -- 50     # 50 games
```

All benchmarks require `--release`. Debug builds are 10–50× slower and not representative.
