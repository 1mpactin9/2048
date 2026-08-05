# engine2048

A 2048 expectimax engine: bitboard board representation, precomputed move/heuristic
lookup tables, and a **bounded in-memory transposition table** for caching repeated
subtree evaluations. Nothing is precomputed to disk and nothing is shipped as a
database — every position is scored live; only the current process's cache speeds
up later, related calculations.

## Why this design

Both reference repos you provided use the same bitboard/row-table trick:

- `2048-ai` (nneonneo): expectimax search with a heuristic evaluator (monotonicity,
  merges, empty cells, tile sum) and an `unordered_map` transposition table.
- `2048EndgameTablebase`: same low-level board representation, but its actual
  strategy is a precomputed **endgame tablebase** (`BookBuilder`, `L3Manager`,
  pattern-database probes) — a multi-GB database built ahead of time. That's the
  part you asked to avoid.

This engine keeps the first repo's live-search approach, fixes its two real
weaknesses, and makes everything configurable for testing:

1. **Unbounded cache growth** — the original's `unordered_map` grows without limit
   for the whole game. This engine uses a fixed-size, direct-mapped hash table
   (`--tt-bits`, default `2^22` entries ≈ 32MB) with a depth-aware replacement
   policy, so memory is bounded and predictable regardless of game length.
2. **No time budget** — the original searches to a fixed depth
   (`max(3, distinct_tiles - 2)`), which is fine early on but becomes
   impractically slow once many distinct tiles are on the board (confirmed
   during testing: fixed depth 8+ can take tens of seconds per move at high
   tile counts). This engine uses **iterative deepening with a wall-clock time
   budget per move** (`--time-budget`), checked both between depth levels and
   periodically inside the search itself, so a single move can never blow past
   its budget. If a deeper pass is aborted mid-way, its (unreliable, partial)
   result is discarded in favor of the last fully completed depth.

## Structure

```
engine2048/
  include/
    board.h                 bitboard packing, transforms, move enum
    tables.h                precomputed 65536-entry move/heuristic tables
    weights.h                configurable heuristic weight struct
    transposition_table.h    bounded direct-mapped evaluation cache
    engine.h                 expectimax search + iterative deepening
    simulate.h                self-play / RNG / game-loop helpers
  src/
    main.cpp                 CLI: run N self-play games with a given config
  configs/
    presets.json              named test configurations (see below)
  scripts/
    build.sh                  compiles ./engine2048
    benchmark.py               runs presets and prints a comparison table
  tests/
    (see "Testing" below)
```

## Build

```
./scripts/build.sh
```

Requires a C++17 compiler (g++ or clang++). No external dependencies.

## Run a single configuration

```
./engine2048 --games 5 --time-budget 0.1 --tt-bits 22 --verbose
./engine2048 --help          # full list of flags
```

Key flags:

| Flag | Meaning | Default |
|---|---|---|
| `--games N` | number of self-play games | 10 |
| `--seed N` | base RNG seed (game i uses seed+i) | 1 |
| `--time-budget F` | per-move search time budget in seconds; `0` disables iterative deepening and uses a fixed depth instead | 0.2 |
| `--tt-bits N` | transposition table size = `2^N` entries | 22 |
| `--cache-depth-limit N` | max search depth eligible for caching | 15 |
| `--min-depth N` / `--depth-bias N` | starting depth = `max(min_depth, distinct_tiles - depth_bias)` | 3 / 2 |
| `--max-depth N` | hard ceiling on search depth | 8 |
| `--no-cache` | disable the transposition table entirely (for A/B comparison) | off |
| `--lost-penalty/--mono-power/--mono-weight/--sum-power/--sum-weight/--merges-weight/--empty-weight` | heuristic weights | nneonneo's original values |

## Testing multiple configurations

`configs/presets.json` defines 9 named configurations to compare:

- `baseline` — default weights/settings
- `fast` — tight time budget, for quick iteration
- `strong` — larger time budget, bigger cache, deeper max depth
- `no_cache` — cache disabled, isolates how much the transposition table helps
- `small_cache` / `huge_cache` — cache size sweep (2^16 vs 2^26 entries)
- `empty_focused` / `monotonicity_focused` — alternate heuristic weight balances
- `shallow_deep_depthbias` — most aggressive depth-vs-tile-count ratio

Run them all:

```
python3 scripts/benchmark.py --games 5 --out results.json
```

Run a subset:

```
python3 scripts/benchmark.py --presets fast strong no_cache --games 3
```

This prints a comparison table (avg score, avg max tile, 2048 win rate, average
per-move search time, cache hit rate, total wall time) and can optionally save
raw results as JSON with `--out`.

**Expected runtime — please read before running the full suite:** games are not
fixed-length; a single game commonly runs 500–2000 moves, and each move's cost is
bounded by `--time-budget` (default 0.1–0.5s depending on preset). In testing here,
individual games took anywhere from **~15 seconds to ~100 seconds** depending on
preset and how far the game progressed. Running all 9 presets at `--games 5` can
take **30–60+ minutes total**. Recommended first pass:

```
python3 scripts/benchmark.py --games 2 --timeout 1800
```

then increase `--games` once you've confirmed timing on your machine. Every
preset's timeout defaults to 30 minutes (`--timeout`), which is intentionally
generous — lower it only after you know how fast your machine runs a game.

## What to send back

After running the benchmark (all presets or a subset), send back either the
printed comparison table or the `--out results.json` file. From there I can:

- pick the strongest config as-is, or
- propose 1-2 follow-up configs narrowing in on whatever the results suggest
  (e.g. more cache, different depth bias, a blended heuristic), or
- finalize weights/settings into a single recommended "release" configuration.

## Notes on the caching model

The transposition table caches `(board_state) -> heuristic value` for nodes
reached during the *tile-placement* (chance) step of the search, tagged with the
depth at which they were evaluated. A cache hit is only used if it was recorded
at least as deep as the current lookup requires — this preserves search
correctness (shallow, cheap results never masquerade as deep ones) while still
giving large speedups on repeated transpositions, both within a single move's
search tree and across consecutive moves in the same game (the cache persists
across moves by default; use `--reset-cache-each-game` to isolate per-game cache
behavior for benchmarking).
