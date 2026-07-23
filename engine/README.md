# engine2048

A standalone Rust 2048 engine — no UI. Supports arbitrary square board sizes
(3x3, 4x4, 5x5, 6x6, 8x8, or any N≥2), undo, a tile-swap power-up, a
tile-delete power-up, and an expectimax AI that can suggest or auto-play
moves.

## Layout

- `src/lib.rs` — the engine (this is what you depend on / embed in your own UI).
- `src/wasm.rs` — WebAssembly bindings exposing the AI to a browser (built
  only for the `wasm32` target).
- `src/main.rs` — a small interactive terminal demo (`cargo run`).
- `examples/bench.rs` — runs the AI to completion on each board size and
  prints timing / max tile / score (`cargo run --release --example bench`).

## WebAssembly (browser auto-play)

The expectimax AI is exposed to the web frontend through a small `wasm-bindgen`
shim. The browser keeps full ownership of game state (grid, score, powerups,
animations) and asks the AI for the next action - a direction, or a power-up
when the board is congested and power-ups are enabled.

Build the package (run from the repo root, requires
[`wasm-pack`](https://rustwasm.github.io/wasm-pack/) and the
`wasm32-unknown-unknown` target; both are one-time installs):

```bash
cargo install wasm-pack    # one-time
rustup target add wasm32-unknown-unknown
npm run build:wasm         # = wasm-pack build --target web --release engine
```

This writes `engine/pkg/` (`engine2048.js` + `engine2048_bg.wasm`). The JS
glue's default export is an `init()` that loads the `.wasm`; after it resolves
two functions are available, each taking a row-major `Uint32Array` of tile
values (`0` = empty) and the board edge `size`:

- `suggest_move(flat, size, depth)` - direction only. Returns `0 = up`,
  `1 = down`, `2 = left`, `3 = right`, or a value `> 3` (`u32::MAX`) when no
  legal move exists.
- `suggest_action(flat, size, swaps_left, deletes_left, depth)` - direction or
  power-up. Returns a flat array: `[0, dir]` move, `[1, r, c]` delete,
  `[2, r1, c1, r2, c2]` swap, `[3]` none. Power-ups are only considered when
  their charge is `> 0` and the board is congested or stuck, so they're saved
  for when they matter (and spent to escape game over).

`depth = 0` uses the engine's adaptive default (deeper on small boards,
shallower on large ones), so it matches every supported board size (3, 4, 5, 6,
8) without configuration; a non-zero value overrides it.

The frontend wires this up in `src/core/wasm-engine.ts` and uses it from the
auto-play loop in `src/ui/app.ts`. Re-run `npm run build:wasm` after any change
to `src/lib.rs` or `src/wasm.rs`.

## Running the demo

```bash
cargo run
```

Then type a board size (3, 4, 5, 6, or 8) and use these commands:

| Command | Effect |
|---|---|
| `w` / `a` / `s` / `d` | move up / left / down / right |
| `u` | undo the last move / swap / delete |
| `ai` | let the AI play a single move |
| `auto N` | let the AI auto-play up to N moves |
| `swap r1 c1 r2 c2` | swap the tiles at (r1,c1) and (r2,c2) |
| `delete r c` | delete the tile at (r,c) |
| `q` | quit |

Run the benchmark (recommended in release mode, since debug builds are much
slower for the search):

```bash
cargo run --release --example bench
```

## Using it as a library

Add it as a path/git dependency in your own `Cargo.toml`, then:

```rust
use engine2048::{Config, Engine, Direction};

fn main() {
    // Any board size >= 2 works; swap/delete charges and undo depth are configurable.
    let mut engine = Engine::new(Config {
        size: 6,
        target_tile: 2048,   // win condition; use u32::MAX to disable
        max_undo_history: 20,
        swap_charges: 3,
        delete_charges: 3,
        four_probability: 0.1,
    }).unwrap();

    // Or just: let mut engine = Engine::with_size(4).unwrap();

    // Make a move.
    let outcome = engine.make_move(Direction::Left).unwrap();
    println!("{:?}", outcome); // moved / gained_score / spawned / game_over / won

    // Undo it.
    engine.undo().unwrap();

    // Ask the AI what it would do, or just let it play.
    if let Some(dir) = engine.suggest_move(None) {
        println!("AI suggests: {:?}", dir);
    }
    engine.auto_play_step(None); // plays the AI's suggested move for you

    // Power-ups.
    engine.swap_tiles((0, 0), (1, 1)).ok();
    engine.delete_tile((2, 2)).ok();

    // Inspect state.
    for row in engine.grid() {
        println!("{:?}", row);
    }
    println!("score={} won={} game_over={}", engine.score(), engine.has_won(), engine.is_game_over());
}
```

## Notes on the AI

- Algorithm: expectimax search (max nodes = your 4 possible moves, chance
  nodes = the random tile spawn), scored with a heuristic that rewards empty
  cells, monotonic rows/columns, smoothness, and keeping the largest tile in
  a corner — the same family of heuristics used by the strongest known
  hand-tuned 2048 engines.
- Search depth is adaptive by board size by default (deeper on small boards,
  shallower on large ones, since branching factor grows fast with board
  area). You can override it: `engine.suggest_move(Some(depth))`.
- On boards with many empty cells, the chance-node expansion is capped to a
  sample of empty cells (not all of them) to keep large boards (6x6, 8x8)
  fast. This is an approximation, not exact expectimax, but it's what makes
  8x8 tractable in real time.
- The search internally works on a single flat `Vec<u32>` board rather than a
  nested `Vec<Vec<u32>>`, and mutates that board in place (with restore)
  when trying the two chance-node outcomes (a 2 or a 4 in a given empty
  cell) instead of cloning it. Both remove allocation overhead that used to
  dominate the cost of deeper searches, which is what buys back the extra
  ply used in the default depth for 3x3/4x4 boards.
- Run `cargo run --release --bin bench -- 20` (from `engine/`) to play N
  full standard 4x4 games (no power-ups) with the AI and print min/median/
  average/max score plus how many games clear 100k and 200k. Always use
  `--release` — debug builds are much slower and not representative.

## Tests

```bash
cargo test
```

by Claude