<div align="center">
    <h1>Benchmark</h1>
    <p>
        <a href="#phase-1-directional-move-speed-plain-expectimax">Part 01</a> -
        <a href="#phase-2-power-up-evaluation-full-action-search">02</a> -
        <a href="#phase-3-predictive-search-rng-manipulation-mode">03</a>
    </p>
</div>

Benchmark results for the Rust expectimax engine (`engine/src/lib.rs`), compiled to WASM and run in the browser via a dedicated Web Worker. All timings measured on a single core, release build (`--release`), averaged over 20 decisions per configuration.

---

## Test Configurations

| Dimension | Values tested |
|-----------|--------------|
| **Board size** | 3×3, 4×4, 5×5, 6×6, 8×8 |
| **Board state** | Opening (2–3 tiles) / Danger (1–2 empties, high tiles) / Stuck (no legal moves) |
| **Search depth** | Auto (adaptive) / Basic (d=2) / Medium (d=4) / Advanced (d=6) |
| **AI mode** | Plain expectimax / Predictive (RNG manipulation) / Full action (with power-ups) |

### Board states used

- **Opening**: 2–3 tiles placed near the corner; most cells empty. Adaptive depth drops to ~1–2.
- **Danger**: Nearly full board with high-value tiles arranged along a snake path; 2 cells empty. Adaptive depth ramps up aggressively.
- **Stuck**: 4×4 board with alternating 2/4 pattern and zero legal moves — forces power-up evaluation in `suggest_action_for`.

---

## Phase 1: Directional Move Speed (Plain Expectimax)

Time per AI decision when only choosing a direction (up/down/left/right). No power-up evaluation.

| Size | State | Depth | μs/decision | vs opening |
|------|-------|-------|-------------:|-----------:|
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

### Key observations

- **The 5×5 danger zone is the worst case by far** — adaptive depth ramps to ~8 on nearly-full 5×5 boards, producing trees of millions of nodes. At 5.9 ms per decision, this is the single slowest configuration tested.
- **4×4 stays well bounded** — even in danger, the node budget (150k) and capped branching (MAX_CELLS=6) keep decisions under 2 ms.
- **Larger boards stay fast** — 6×6 and 8×8 use shallower adaptive depths (base 2 and 1 respectively), so they never explode.
- **Depth has diminishing returns past d=2** on 4×4 danger — the node budget caps expansion regardless of requested depth.

---

## Phase 2: Power-Up Evaluation (Full Action Search)

Time per AI decision when `suggest_action_for` evaluates delete and swap candidates. Tested on a stuck board (no legal moves, so power-up search is always triggered).

| Size | Depth | μs/decision | vs plain move |
|------|-------|-------------:|--------------:|
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

### What's happening here

`Engine::suggest_action_for` evaluates three categories of candidate:

1. **Directional moves** — 4 expectimax searches (one per direction)
2. **Delete candidates** — O(n²) searches, one per occupied cell
3. **Swap candidates** — Up to 48 sampled pairs, each with a full expectimax search

At `auto` or `basic(d=2)` depth, each individual search is cheap (~10–50 μs), so the total stays under 1.4 ms. At `medium(d=4)`, each search balloons to ~400–500 μs, and with dozens of candidates the total hits 20+ ms.

### Implications for the Web Worker

The worker has a 2-second hard timeout per decision. Even at d=4 on a stuck board, the worst case (~22 ms) is well within budget. But on a larger board with more occupied cells, this could approach the limit — which is why the default AI mode in the browser uses `depth=0` (auto) rather than fixed medium/advanced.

---

## Phase 3: Predictive Search (RNG Manipulation Mode)

Compares plain expectimax against the deterministic ("cheat") variant that peeks the ChaCha20 spawn stream. The predictive search collapses each chance node from up to 12 branches (6 empty cells × {2, 4}) down to exactly 1, so the same node budget reaches much deeper plies.

| Size | State | Plain μs | Predictive μs | Speedup |
|------|-------|---------:|--------------:|--------:|
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

### Why this matters

Turning RNG Manipulation **on** doesn't slow down the AI — it makes it significantly faster. The predictive search is the same algorithm but with a deterministic chance node instead of probabilistic branching. On the 5×5 danger case (the slowest plain configuration), manipulation brings it from 5.3 ms down to 77 μs.

This also means the `suggest_move_det` / `suggest_action_det` WASM entry points are cheaper to call than their plain counterparts, which is beneficial since they're called every auto-play tick when manipulation is enabled.

---

## Configuration Reference

### Adaptive depth ramp

The engine automatically adjusts search depth based on how full the board is:

| Empty ratio | Depth adjustment | Typical range |
|-------------|-----------------:|---------------|
| > 55% (opening) | base − 3 | Very shallow, plays fast |
| 35–55% | base − 2 | Shallow |
| 22–35% | base − 1 | Slightly shallow |
| 12–22% (midgame) | base | Comfortable baseline |
| 7–12% | base + 1 | Looking ahead |
| 3.5–7% | base + 3 | Dangerous |
| < 3.5% | base + 5 | Critical |

Base depth by board size:

| Size | Base depth |
|------|-----------:|
| 3×3 | 6 |
| 4×4 | 6 |
| 5×5 | 3 |
| 6×6 | 2 |
| 8×8 | 1 |

### Node budget by resolved depth

| Depth | Node budget | Notes |
|-------|------------:|-------|
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

---

## How to Run

```bash
# Full benchmark (all sizes, all phases)
cd engine
cargo run --release --bin bench-speed

# Single board size
cargo run --release --bin bench-speed -- 4

# Score benchmark (full games, existing binary)
cargo run --release --bin bench           # 20 games
cargo run --release --bin bench -- 50     # 50 games
```

All benchmarks require `--release` — debug builds are 10–50× slower and not representative of real usage.
