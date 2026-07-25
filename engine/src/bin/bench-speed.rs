//! Speed-only benchmark: measures how long each AI configuration takes per decision.
//! No score / win-rate tracking — just raw timing across board sizes, depths, and states.
//!
//! Usage:
//!   cargo run --release --bin bench-speed          # run all configs
//!   cargo run --release --bin bench-speed -- 3     # only size 3
//!   cargo run --release --bin bench-speed -- 4     # only size 4
//!
//! Always use `--release`.

use engine2048::Engine;
use std::env;
use std::io::Write;
use std::time::Instant;

/// Board sizes to benchmark.
const SIZES: [usize; 5] = [3, 4, 5, 6, 8];

/// Search depth overrides: 0 = adaptive auto.
const DEPTHS: [(usize, &'static str); 4] = [
    (0, "auto"),
    (2, "basic (d=2)"),
    (4, "medium (d=4)"),
    (6, "advanced (d=6)"),
];

/// Number of decisions to average per configuration.
const DECISIONS_PER_CONFIG: usize = 20;

fn run_phase(
    _label: &str,
    grid: Vec<Vec<u32>>,
    _size: usize,
    _state: &str,
) -> u128 {
    let t0 = Instant::now();
    for _ in 0..DECISIONS_PER_CONFIG {
        let _dir = Engine::suggest_move_for(&grid, None);
    }
    let elapsed = t0.elapsed().as_micros() / DECISIONS_PER_CONFIG as u128;
    elapsed
}

fn main() {
    let filter_size: Option<usize> = env::args()
        .nth(1)
        .and_then(|s| s.parse().ok());

    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    writeln!(out, "═══════════════════════════════════════════════════════════").unwrap();
    writeln!(out, "  2048 AI Speed Benchmarks  ({} decisions per config)", DECISIONS_PER_CONFIG).unwrap();
    writeln!(out, "═══════════════════════════════════════════════════════════").unwrap();
    writeln!(out).unwrap();

    // Phase 1: Directional move, plain expectimax
    writeln!(out, "── Phase 1: Directional moves only (plain expectimax) ──").unwrap();
    writeln!(
        out,
        "{:<8} {:<12} {:<18} {:>10} {:>10}",
        "Size", "State", "Depth", "μs/move", "ratio"
    ).unwrap();
    writeln!(out, "{}", "─".repeat(62)).unwrap();
    out.flush().unwrap();

    for &size in &SIZES {
        if let Some(f) = filter_size {
            if size != f { continue; }
        }

        let opening = build_opening_board(size);
        let danger = build_danger_board(size);

        // Auto depth on opening
        let base_us = run_phase("opening", opening.clone(), size, "opening");
        writeln!(
            out,
            "{:<8} {:<12} {:<18} {:>10} {:>10}",
            size, "opening", "auto", base_us, "1.0x"
        ).unwrap();

        // Danger with auto
        let danger_us = run_phase("danger", danger.clone(), size, "danger");
        writeln!(
            out,
            "{:<8} {:<12} {:<18} {:>10} {:>10.2}",
            size, "danger", "auto", danger_us, danger_us as f64 / base_us as f64
        ).unwrap();

        // Fixed depths on danger
        for (_depth, name) in &DEPTHS[1..] {
            let us = run_phase("danger+d", danger.clone(), size, "danger");
            writeln!(
                out,
                "{:<8} {:<12} {:<18} {:>10} {:>10.2}",
                size, "danger", name, us, us as f64 / base_us as f64
            ).unwrap();
        }
        out.flush().unwrap();
    }

    writeln!(out).unwrap();

    // Phase 2: Full action (with power-up evaluation)
    // Use a stuck board so power-up evaluation is always triggered.
    writeln!(out, "── Phase 2: Full action (move + power-up eval, stuck board) ──").unwrap();
    writeln!(
        out,
        "{:<8} {:<18} {:>10} {:>10}",
        "Size", "Depth", "μs/action", "ratio"
    ).unwrap();
    writeln!(out, "{}", "─".repeat(50)).unwrap();
    out.flush().unwrap();

    // Stuck board: no legal moves, forces power-up evaluation
    let stuck_4 = vec![
        vec![2, 4, 2, 4],
        vec![4, 2, 4, 2],
        vec![2, 4, 2, 4],
        vec![4, 2, 4, 2],
    ];

    for &size in &SIZES {
        if let Some(f) = filter_size {
            if size != f { continue; }
        }

        // Base: plain directional move on the same stuck board
        let base_us = {
            let t0 = Instant::now();
            for _ in 0..DECISIONS_PER_CONFIG {
                let _dir = Engine::suggest_move_for(&stuck_4, None);
            }
            t0.elapsed().as_micros() / DECISIONS_PER_CONFIG as u128
        };

        for (depth, name) in &DEPTHS[..=2] {
            let t0 = Instant::now();
            for _ in 0..DECISIONS_PER_CONFIG {
                let _action = Engine::suggest_action_for(&stuck_4, 2, 2, Some(*depth));
            }
            let elapsed = t0.elapsed().as_micros() / DECISIONS_PER_CONFIG as u128;
            writeln!(
                out,
                "{:<8} {:<18} {:>10} {:>10.2}",
                size, name, elapsed, elapsed as f64 / base_us.max(1) as f64
            ).unwrap();
        }
        out.flush().unwrap();
    }

    writeln!(out).unwrap();

    // Phase 3: Predictive vs plain
    writeln!(out, "── Phase 3: Predictive (manipulate) vs Plain ──").unwrap();
    writeln!(
        out,
        "{:<8} {:<12} {:>12} {:>12} {:>8}",
        "Size", "State", "plain μs", "det μs", "ratio"
    ).unwrap();
    writeln!(out, "{}", "─".repeat(56)).unwrap();
    out.flush().unwrap();

    for &size in &SIZES {
        if let Some(f) = filter_size {
            if size != f { continue; }
        }
        for state_name in ["opening", "danger"] {
            let grid = if state_name == "opening" {
                build_opening_board(size)
            } else {
                build_danger_board(size)
            };

            let key = [0u32; 8];

            let t0 = Instant::now();
            for _ in 0..DECISIONS_PER_CONFIG {
                let _dir = Engine::suggest_move_for(&grid, None);
            }
            let plain = t0.elapsed().as_micros() / DECISIONS_PER_CONFIG as u128;

            let t0 = Instant::now();
            for _ in 0..DECISIONS_PER_CONFIG {
                let _dir = Engine::suggest_move_det_for(&grid, None, &key, 0, true);
            }
            let det = t0.elapsed().as_micros() / DECISIONS_PER_CONFIG as u128;

            writeln!(
                out,
                "{:<8} {:<12} {:>12} {:>12} {:>7.2}x",
                size, state_name, plain, det, det as f64 / plain as f64
            ).unwrap();
        }
        out.flush().unwrap();
    }

    writeln!(out).unwrap();
    writeln!(out, "═══════════════════════════════════════════════════════════").unwrap();
    out.flush().unwrap();
}

/// Build a board with 2-3 tiles (fresh game state).
fn build_opening_board(size: usize) -> Vec<Vec<u32>> {
    let mut grid = vec![vec![0u32; size]; size];
    grid[0][0] = 2;
    if size > 1 {
        grid[0][1] = 2;
    }
    if size >= 3 {
        grid[1][0] = 4;
    }
    grid
}

/// Build a dangerous, nearly-full board with high tiles.
fn build_danger_board(size: usize) -> Vec<Vec<u32>> {
    let mut grid = vec![vec![0u32; size]; size];
    let values: Vec<u32> = (1..=(size * size - 3)).map(|i| 2u32.pow(i.min(12) as u32)).collect();
    let mut vi = 0;
    for r in 0..size {
        let forward = r % 2 == 0;
        for c in 0..size {
            let col = if forward { c } else { size - 1 - c };
            if vi < values.len() {
                grid[r][col] = values[vi];
                vi += 1;
            }
        }
    }
    // Leave exactly 2 cells empty (maximally dangerous)
    grid[size - 1][size - 1] = 0;
    grid[size - 1][size - 2] = 0;
    grid
}
