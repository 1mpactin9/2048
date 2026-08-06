# Engine changes

## 0d. Third round: the warm-up fix from 0c had its own bug, plus a proper fix for Guarantee/6x6
Results after 0c showed `Deterministic`/`DetGuarantee`/4x4 scoring *worse* than
before, and `Max/Deterministic` (more time budget) scoring worse than
`Balanced/Deterministic` (less budget) — a clear sign of a new bug, not just an
unhelped one. And `Guarantee/6x6` barely moved (37.7k vs 36.9k).

**Bug: the warm-up and deep passes shared one deadline.** In 0c's fix,
`set_search_deadline` was called once before *both* the depth-3 warm-up pass and
the deep target-depth pass. The warm-up pass would consume part of that shared
window before the deep pass even started — so the deep pass started with less
time than the deadline implied, sometimes almost none. Worse under `Max` mode:
its 4x bigger node-budget scale let the depth-3 warm-up explore more nodes (still
cheap relative to `Max`'s huge total budget, but non-zero), eating more of the
shared window before the deep pass's turn — explaining why `Max` scored worse
than `Balanced` despite having 16x more total time budget.

Fixed by giving each pass its own independent deadline window: a small fixed
slice (15% of the total budget) for the warm-up, and the *full* budget for the
deep pass, timed from when the deep pass actually starts. Applied to
`suggest_move_det_with_usage`, `suggest_move_det_guarantee`, and
`suggest_action_det_with_usage` in `deterministic.rs`.

**`Guarantee/6x6` — the fixed `max_depth - 2` warm-up-start (from 0c) wasn't
aggressive enough.** A flat "-2 from target" offset doesn't account for board
size: depth 6-8 on a 6x6 board is still too expensive to complete even once
within `Balanced`'s ~100ms hard cap, so `best_move`'s single attempted pass was
still getting deadline-truncated mid-search, same failure mode as before, just
one level shallower.

Replaced the static offset with **real adaptive iterative deepening** in
`search.rs`'s `best_move`: start at depth 1 (always cheap, always completes),
and after each *fully completed* pass, only attempt the next depth if that
pass's elapsed time — projected forward with a 6x safety margin, since
expectimax branching typically multiplies cost by several x per extra ply —
fits within the remaining soft time budget. This adapts correctly to board size
and usage mode without hardcoding an offset: a 6x6 board that can only afford
depth 4 in its time budget will stop at depth 4 with a clean, fully-computed
result; a 4x4 board that can reach depth 12 will do so. Critically, this also
means `best_move` now only ever returns a move from a **fully completed** pass —
never a deadline-truncated partial one — so the search depth adapts, but the
result at whatever depth it reaches is never biased by an uneven mid-search cutoff.
Each pass still gets its own hard per-pass deadline as a safety net against one
pass unexpectedly running away (e.g. pathological branching), it's just no
longer the thing deciding how deep the search goes under normal conditions.

## 0e. `scripts/run_full_bundle.ps1` — speed-sweep loop was crashing on a compiler warning
The speed-sweep half of the bundle script failed with
`STATUS_CONTROL_C_EXIT`-adjacent noise after `cargo`'s harmless
`unused variable` warning. Cause: `2>&1 | Tee-Object` merges `cargo`'s stderr
output into the pipeline as PowerShell `ErrorRecord` objects, and
`$ErrorActionPreference = "Stop"` then treats the *first* one as a terminating
script error — even though `cargo`'s actual process exit code was 0 (a compiler
warning isn't a build failure). Fixed by relaxing `$ErrorActionPreference`
around the native `cargo` calls specifically (PowerShell's `Stop` preference
isn't meant to apply to plain stderr text from external programs) and checking
`$LASTEXITCODE` explicitly instead, which is the actual reliable signal of
whether `cargo` failed.

## 0c. Two more timing-related quality bugs found from the second test run
The move/game caps held (sweep finished in ~46 min, no hangs), but the results
exposed two real quality bugs, both downstream of the deadline fix actually
working correctly now:

**`Balanced/Guarantee/6x6` collapsed to ~36-40k (vs. 500k+ for `Standard/6x6`
on the same board), and every single game hit the 120s cap.** Cause:
`suggest_move_guarantee` → `best_move` uses classic iterative deepening —
depth 1, then 2, then 3, ... re-searching from scratch each time. That's a good
technique when there's enough time to reach a useful depth. But `Guarantee`
mode's target depth (`distinct_tiles - 2`, `DET_DEPTH_BONUS` doesn't apply here)
can be 13+ on a board with many tile values, while `Balanced`'s time budget is
only 50ms soft / 100ms hard. Starting from depth 1 every time meant almost the
entire budget got burned on cheap, low-value early passes, and the loop never
got anywhere near the depth that actually mattered — so every move was
effectively a depth-2-or-3 decision dressed up as a "guarantee" search.

Fixed by starting iterative deepening near the target depth (`max_depth - 2`)
instead of always at depth 1, so the budget goes toward depths that matter. This
still runs a couple of cheap warm-up passes when there's room, it just doesn't
waste time on passes 10+ levels below the target when the deadline won't allow
reaching it anyway. `search.rs`, `best_move`.

**`Deterministic`/`DetGuarantee` at 4x4 scored noticeably worse than `Standard`
at the same board size, and `6x6/Deterministic` scores were suspiciously tight
across different seeds.** Cause: `best_move_det` (used by `Deterministic` and
`DetGuarantee` modes) is a single-shot fixed-depth search with no iterative
deepening — unlike `best_move`, there's no cheap shallow pass to fall back on.
When the deadline cuts off a deep attempt partway through, the top-level loop
over 4 directions still completes (it's not itself deadline-gated), but the
*recursive* evaluations backing each direction get cut short inconsistently,
so the choice between directions is based on partially-computed, uneven data —
worse than either a completed shallow search or a completed deep one.

Fixed by running a cheap depth-3 warm-up pass first (with its own independently
seeded `SeedRng` — sharing one `SeedRng` mutably between two passes would have
advanced the RNG state and desynced the deep pass's spawn predictions from the
real game state, which would have broken deterministic mode's whole premise),
then the real target-depth attempt, and keeping whichever of the two produced
the higher evaluated value. This gives deterministic mode the same "graceful
degradation" property iterative deepening gives the standard path, without
actually switching it to iterative deepening (which isn't a good fit for a
single-shot manipulation-aware search). Applied to `suggest_move_det_with_usage`,
`suggest_move_det_guarantee`, and `suggest_action_det_with_usage` in
`deterministic.rs`.

## 0b. `bin/bench.rs` — added a per-game move/time cap to the benchmark harness
After the deadline fix, `Balanced/Guarantee/6x6` ran for **6.8 hours on a single
game** (score 12.8M, max tile 524288) instead of hanging. That's not a bug in the
search — per-move timing checked out (~100ms/move cap, consistent with the fix),
and a 524288 tile needs ~19-20 distinct tile values, which is exactly what makes
`Guarantee` mode's `distinct - 2` depth formula push search deep and, apparently,
play well enough to almost never lose. The actual problem: `bench.rs`'s game loop
had no cap at all — it only breaks on `game_over`, so a sufficiently strong
config can run one game essentially indefinitely with no way to bound total
sweep time.

Added `MAX_MOVES_PER_GAME` (20,000) and `MAX_SECONDS_PER_GAME` (120s) to the
harness. A game hitting either cap is cut short and printed with a
`[CAPPED, not game-over]` tag so you don't mistake a capped game's score for a
real game-over — it's a lower bound on what that config could have reached, not
a natural stopping point. Also added a `moves = N` column to the per-game output
line since move count is directly relevant now.

This only changes the benchmark binary, not the engine itself — `Engine`'s public
API and the actual search/heuristic code are untouched here.

## 0. CRITICAL — fixed the runaway search time / bad small-board quality bug
This was the cause of the 25-hour runs and the bad 3x3/4x4 results. Two compounding bugs:

**Bug A: `ENDGAME_EXTRA_DEPTH` was a flat 30, for every board size.** Whenever a
board had ≤2 empty cells (which is most of a game's lifetime), `endgame_depth`
forced the search target to depth 30 — completely blind to board size. On a
3x3/4x4 board, depth 30 alternating max/chance plies is a combinatorial explosion
regardless of low branching factor. On top of that, `auto_depth` separately adds
up to `+8` for sparse-empty boards, and `suggest_move_for_det_guarantee` /
`suggest_action_det_with_usage` add another flat `DET_DEPTH_BONUS = 4` on top of
whatever `auto_depth`/`endgame_depth` already produced — so deterministic-mode
searches could target depth 34.

**Bug B: the wall-clock time budget was only checked *between* iterative-deepening
passes, and the deterministic search path had no time check at all.** `best_move`'s
loop calls `best_move_fixed` once per depth (1, 2, 3, ... up to the target), and
only checks `time_budget_ms` after each full pass completes. If a single pass at
depth 20+ takes minutes (or hours), the 50ms `Balanced` budget never gets a chance
to fire — the node `budget` counter (which for depth ≥13 allows up to 1,000,000
nodes, and up to 4x that under `Max` mode's `node_budget_scale`) is the only thing
stopping it, and that counter has no relationship to wall-clock time. The
deterministic path (`best_move_det`) didn't even have a node-budget iterative loop
to check between — it was one giant fixed-depth search with nothing but the node
counter as a backstop, which is why your 6x6 Guarantee game took 6+ hours on a
single move.

This also explains the *quality* problem, not just speed: a search that gets cut
off mid-tree by an arbitrary node-budget exhaustion partway through a depth-30
target produces a worse move than a search that's allowed to complete cleanly at
a realistic depth. The engine was spending almost all its time chasing an
unreachable target instead of finishing a useful one.

**Fix:**
- `ENDGAME_EXTRA_DEPTH` (30, flat) replaced with `endgame_extra_depth(n)`: 10 for
  n≤4, 7 for n=5-6, 5 for n≥7. Still gives real extra depth when the board is
  nearly full and branching has collapsed, without being a size-blind number that
  was never reachable anyway.
- Added a real wall-clock deadline (`set_search_deadline` / `deadline_hit` in
  `search.rs`, exposed to `deterministic.rs`) that the recursive search checks
  every 2048 nodes (cheap — piggybacks on the existing budget counter, no extra
  `now_ms()` calls per node) and bails out to the static heuristic immediately if
  exceeded. This is wired into every search entry point in both `search.rs` and
  `deterministic.rs` — plain move suggestions, guarantee mode, deterministic mode,
  det_guarantee mode, and the delete/swap power-up evaluation loops (which
  previously had zero time protection even in the standard path, since they run
  after `best_move`'s own internal deadline was already cleared).
- The hard deadline is `time_budget_ms * 3` (`HARD_TIME_MULTIPLIER` /
  `DET_HARD_TIME_MULTIPLIER`) rather than exactly `time_budget_ms`, so an
  iteration that's almost done finishing cleanly isn't needlessly cut off right
  at the soft limit — but nothing can run unbounded anymore. This 3x is a
  tunable constant if you want it tighter or looser once you see real timings.

None of the depth/budget *tuning tables* (`default_depth`, the `auto_depth` ratio
thresholds, `budget_for_depth`) were changed — those are legitimate knobs you said
you'd want to sweep yourself, and the deadline guard now makes it safe to
experiment with them aggressively without risking another runaway run.

### Follow-up fix: the deadline check was never actually firing
After the first round of testing, `Balanced/Guarantee/6x6` hung and had to be
killed manually. Root cause: all four `deadline_hit()` call sites were placed
**last** in a short-circuiting `||` condition, e.g.
`if depth == 0 || *budget == 0 || prob < PROB_CUTOFF || deadline_hit()`. Rust's
`||` short-circuits — if `depth == 0` is already true (which it is at every leaf
node, the overwhelming majority of calls in any tree search), `deadline_hit()`
never runs at all. Since `deadline_hit()`'s tick counter only advances when it's
actually called, this meant the deadline was checked far less often than
intended, and on an expensive board (6x6, `Guarantee` mode's `distinct - 2` depth
formula pushing search deep) the gap between real checks could be large enough in
wall-clock terms to look like a full freeze.

Fixed by moving `deadline_hit()` to the front of every one of these conditions,
unconditional and first, so it always executes and the tick counter always
advances at the true call rate regardless of which other condition would
otherwise have short-circuited it first. Also tightened
`TIME_CHECK_NODE_INTERVAL` (2048→512) and `HARD_TIME_MULTIPLIER` /
`DET_HARD_TIME_MULTIPLIER` (3.0→2.0), since the check is now reliably reached and
doesn't need as much slack.

## 1. `heuristic.rs` — 4x4 fast path exists but is gated OFF (reverted)
`heur_score_board4` (precomputed per-row lookup table in `board/heur4.rs`) was
originally unused dead code, so I wired it into `heuristic_flat` for 4x4 boards.
**This was wrong and I've reverted it.** `docs/benchmark.md` in this repo already
documents someone trying exactly this change and hitting a severe regression:
0/8 games reaching 2048 vs. a 9/10 baseline, because the table's
`SUM_WEIGHT=11 * rank^3.5` term produces score magnitudes (10⁵–10⁶ for late-game
boards) on a completely different scale than `PRUNE_MARGIN` (600) and the rest of
the search's tuning, which was calibrated around the generic heuristic's scale.
The search converged on "confidently wrong" positions — boards with big tiles
ready to merge scored *lower* than near-empty boards, so the engine learned to
avoid merging.

The dispatch is now `if false && n == 4 && ...` — same pattern the previous
author used — so the fast-path code stays in the codebase for future tuning work
(the table + snake/corner terms are all still there), but every board size
currently runs the generic heuristic, matching the documented working baseline.
If you want to revisit this, it needs its own dedicated re-scaling and sweep, not
a quiet re-enable — don't just flip the `if false` back on.

5x5–8x8 still use the generic path only. A precomputed table for those sizes was
evaluated and rejected — a full row table at 5 bits/cell needs 256MB+ at n=5 and
scales absurdly worse beyond that, so it's not a safe unconditional win the way
a (properly re-scaled) n=4 table might be.

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
All sweep scripts now scale games per board size and skip 8x8 entirely (it was
the dominant source of total runtime — one 8x8 game alone was taking 10-90+
minutes even before the timing bugs above). Games-per-size scale off a single
`-Games`/`$1` input, floored at 5:

| size | games |
|------|-------|
| 3x3  | input + 5 |
| 4x4  | input |
| 5x5  | input - 2 |
| 6x6  | input - 5 |
| 8x8  | skipped |

e.g. `-Games 10` → 15/10/8/5 games for 3x3/4x4/5x5/6x6.

Windows (PowerShell): `scripts\run_full_bundle.ps1 -Games <n>` for a single
combined run — quality sweep followed by speed sweep (speed sweep now also runs
per-size via `bench-speed`'s existing single-size filter arg, sizes 3/4/5/6
only), both logged with a shared timestamp (`quality_sweep_<ts>.log` in
`engine/`, `speed_sweep_<ts>.log` in the repo root). Or run
`scripts\run_quality_sweep.ps1` / `scripts\run_speed_sweep.ps1` separately.

Mac/Linux: `scripts/run_quality_sweep.sh <games>` and `scripts/run_speed_sweep.sh`
(no games arg needed for the speed script — it just runs each size once).

Given the 4x4 fast-path heuristic is currently gated off (see #1), this run
should be directly comparable to whatever numbers you had before that change —
the only things different from your original engine now are the timing/depth
fixes (#0) and the smaller correctness fixes (#2-#5) below, none of which touch
heuristic scoring.
