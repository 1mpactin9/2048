# Engine changes

## 1. `heuristic.rs` — 4x4 fast path wired up
`heur_score_board4` (precomputed per-row lookup table in `board/heur4.rs`) existed
but was never called. `heuristic_flat` now dispatches to it for 4x4 boards made of
plain powers of two, falling back to the generic path otherwise (non-power-of-two
tiles, or n != 4).

This changes the *composition* of the 4x4 heuristic, not just its speed: the table
scores rows on empties/merges/monotonicity/sum with its own weights, then snake +
consistency + corner terms are added on top (same weights as the generic path).
Net effect should be faster eval and a merges-aware component that the old 4x4 path
didn't have — but the scoring surface is different enough that you'll want to run
the quality sweep on 4x4 specifically and compare against baseline.

5x5–8x8 still use the generic path. A precomputed table for those sizes was
evaluated and rejected — a full row table at 5 bits/cell needs 256MB+ at n=5 and
scales absurdly worse beyond that, so it's not a safe unconditional win the way
n=4 was.

## 2. `game.rs` — fixed a latent overflow bug in the non-bitboard slide fallback
`slide_flat_into`'s fallback path (used only when the bitboard path can't handle
the board — currently n > 12, or non-power-of-two tiles) used fixed 16-slot arrays
regardless of `n`. Any board wider than 16 would silently truncate mid-slide and
corrupt state. Arrays are now sized to a safe cap and the write count is bounded
by it. This doesn't change behavior for any board size you're likely to run
(bitboard path covers up to 12x12), it just removes a latent trap for larger n.

## 3. `deterministic.rs` — manipulation candidate scoring now uses the right function
`predict_spawn_flat_with_usage`'s RNG-manipulation loop was calling the full
`heuristic_flat` (expensive, especially now that it may build a bitboard
representation) on every candidate spawn, every round, at every search node —
despite a lightweight purpose-built `score_spawn_candidate_flat` sitting unused in
the same file. Swapped it in. Should meaningfully speed up deterministic +
manipulate=true runs without changing the *ranking* of candidates in any
qualitative way (same terms: empty count, smoothness, monotonicity penalty; just
cheaper weights and no merges term).

## 4. `deterministic.rs` — manipulation-rounds cap now actually respects `Limit`/tuned modes
The old code did `usage.manipulation_rounds_cap().max(5)`. For `Max`/`Balanced`/
`Custom` (which return `usize::MAX`) this correctly floored to a real number. But
if you ever tune `Limit`'s cap (or add a new mode) below 5, `.max(5)` would
silently override your tuning and force 5+ rounds anyway. Fixed so only the
unbounded case gets a floor (64, same as before); any explicit cap is now
respected as given. Numerically identical to before for the current mode configs
(Max/Balanced/Custom = 64 rounds, Limit = 6 rounds) — this only matters once you
start tuning `usage.rs`.

## 5. `search.rs` — transposition table correctness fix (standard expectimax path)
The TT was keyed on `(board hash, depth)` only. But `expectimax_chance_flat` and
`expectimax_max_flat` also branch on `prob` (the accumulated spawn probability) to
decide whether to cut off early via `PROB_CUTOFF`. Two different move sequences
can reach the same board at the same depth with different accumulated `prob`, and
the old code would let a value computed under one `prob` regime get reused for a
lookup under a different one — sometimes returning a value that was cut off
early when it shouldn't have been, or vice versa. This is a real (if usually
small-magnitude) correctness bug, more likely to matter at higher depths / larger
boards where trees are deeper and TT hit rates are higher.

Fixed by folding a coarse log2-bucketed `prob` into the hash (`prob_bucket_hash`),
so a cache hit only happens within the same cutoff regime. This is deliberately
coarse (64 buckets) to avoid tanking the TT hit rate — a tighter bucketing would
be more "correct" but would mostly just evict useful cache entries for no benefit,
since PROB_CUTOFF only cares about crossing a fixed threshold, not fine-grained
prob differences.

The deterministic search path (`deterministic.rs`) was not affected — it already
folds RNG call-count into its hash via `mix_calls`, which fully identifies the
subtree's RNG state and doesn't have this ambiguity.

## Left alone on purpose (didn't want to guess at values you'll want to sweep)
- `budget_for_depth`, `auto_depth`, `default_depth` — these are exactly the kind
  of tunable table you said you'd want to sweep yourself. Not touched.
- `PRUNE_MARGIN` / `DET_PRUNE_MARGIN`, `POWERUP_MARGIN` — same reasoning.
- Heuristic weights (`W_EMPTY`, `W_MONO`, etc.) — same reasoning, other than the
  4x4 dispatch above, which is a code-path change, not a weight change.
- Extending precomputed heuristic/line tables to n=5-8 — rejected, see #1.
- `ordered_directions`'s move-ordering — already uses the full heuristic
  (including empties) for ordering, so there wasn't a cheap correctness or
  performance win available there without risking a real behavior change.

## What to test
Run `scripts/run_quality_sweep.sh <games>` for score/tile quality across sizes,
usage modes, and modes (standard/guarantee/deterministic/det_guarantee).
Run `scripts/run_speed_sweep.sh` for per-decision timing across all sizes.
If you kept your original repo around, `scripts/compare_before_after.sh
<path-to-original-repo> <games>` runs both and diffs the summary tables.
