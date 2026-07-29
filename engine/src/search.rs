const SEARCH_NODE_BUDGET: u64 = 500_000;
const ENDGAME_EMPTY_THRESHOLD: usize = 2;
const ENDGAME_EXTRA_DEPTH: usize = 30;
const DEFAULT_TIME_BUDGET_MS: u64 = 200;
const PROB_CUTOFF: f64 = 1e-4;
const PRUNE_MARGIN: f64 = 400.0;

#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

use crate::transposition::{tt_get, tt_put, zobrist_hash};
use crate::{Action, Direction, Engine};

impl Engine {
    pub(crate) fn endgame_depth(grid: &Vec<Vec<u32>>, depth: usize) -> usize {
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        if empties <= ENDGAME_EMPTY_THRESHOLD {
            depth.max(ENDGAME_EXTRA_DEPTH)
        } else {
            depth
        }
    }

    pub fn suggest_move_for(grid: &Vec<Vec<u32>>, depth: Option<usize>) -> Option<Direction> {
        let search_depth =
            Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)));
        Self::best_move(grid, search_depth, DEFAULT_TIME_BUDGET_MS).0
    }

    fn ordered_directions(board: &[u32], n: usize) -> [(Direction, bool, f64); 4] {
        let mut new_board = [0u32; 256];
        let mut out = [(Direction::Up, false, f64::NEG_INFINITY); 4];
        for (i, &dir) in Direction::ALL.iter().enumerate() {
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            let moved = slice != board;
            let score = if moved {
                gained as f64 + Self::heuristic_flat(slice, n)
            } else {
                f64::NEG_INFINITY
            };
            out[i] = (dir, moved, score);
        }
        out.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());
        out
    }

    fn best_move_fixed(grid: &Vec<Vec<u32>>, depth: usize, budget: &mut u64) -> (Option<Direction>, f64) {
        let n = grid.len();
        let board = Self::flatten(grid);
        let ordered = Self::ordered_directions(&board, n);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut new_board = [0u32; 256];
        for &(dir, moved, quick_score) in ordered.iter() {
            if !moved {
                continue;
            }
            if best_dir.is_some() && quick_score < best_val - PRUNE_MARGIN {
                continue;
            }
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(&board, n, dir, slice);
            let value = gained as f64
                + Self::expectimax_chance_flat(slice, n, depth.saturating_sub(1), budget, 1.0);
            if value > best_val {
                best_val = value;
                best_dir = Some(dir);
            }
        }
        let val = if best_dir.is_none() {
            -200_000.0
        } else {
            best_val
        };
        (best_dir, val)
    }

    fn best_move(
        grid: &Vec<Vec<u32>>,
        max_depth: usize,
        time_budget_ms: u64,
    ) -> (Option<Direction>, f64) {
        let start = now_ms();
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut depth = 1;
        loop {
            let mut budget = Self::budget_for_depth(depth);
            let (dir, val) = Self::best_move_fixed(grid, depth, &mut budget);
            if dir.is_some() {
                best_dir = dir;
                best_val = val;
            }
            if depth >= max_depth || now_ms() - start >= time_budget_ms as f64 {
                break;
            }
            depth += 1;
        }
        (best_dir, best_val)
    }

    pub fn suggest_action_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::auto_depth(grid));
        let mut budget = Self::budget_for_depth(d);

        let (best_dir, move_val) = Self::best_move(grid, d, DEFAULT_TIME_BUDGET_MS);

        let stuck = best_dir.is_none();
        if !stuck && !Self::is_dangerous(grid) {
            return best_dir.map(Action::Move).unwrap_or(Action::None);
        }
        const POWERUP_MARGIN: f64 = 90.0;

        let mut best_delete: Option<(usize, usize)> = None;
        let mut best_delete_val = f64::NEG_INFINITY;
        if deletes_left > 0 {
            for r in 0..size {
                for c in 0..size {
                    if grid[r][c] == 0 {
                        continue;
                    }
                    let mut g = grid.clone();
                    g[r][c] = 0;
                    let v = Self::best_move_fixed(&g, d, &mut budget).1;
                    if v > best_delete_val {
                        best_delete_val = v;
                        best_delete = Some((r, c));
                    }
                }
            }
        }

        let mut best_swap: Option<((usize, usize), (usize, usize))> = None;
        let mut best_swap_val = f64::NEG_INFINITY;
        if swaps_left > 0 {
            let occupied: Vec<(usize, usize)> = (0..size)
                .flat_map(|r| (0..size).map(move |c| (r, c)))
                .filter(|&(r, c)| grid[r][c] != 0)
                .collect();
            for (a, b) in sampled_pairs(&occupied, 48) {
                let mut g = grid.clone();
                let tmp = g[a.0][a.1];
                g[a.0][a.1] = g[b.0][b.1];
                g[b.0][b.1] = tmp;
                let v = Self::best_move_fixed(&g, d, &mut budget).1;
                if v > best_swap_val {
                    best_swap_val = v;
                    best_swap = Some((a, b));
                }
            }
        }

        let mut chosen = best_dir.map(Action::Move).unwrap_or(Action::None);
        let mut chosen_val = move_val;
        if best_delete_val >= move_val + POWERUP_MARGIN && best_delete_val > chosen_val {
            let (r, c) = best_delete.unwrap();
            chosen = Action::Delete(r, c);
            chosen_val = best_delete_val;
        }
        if best_swap_val >= move_val + POWERUP_MARGIN && best_swap_val > chosen_val {
            let (a, b) = best_swap.unwrap();
            chosen = Action::Swap(a, b);
        }
        chosen
    }

    pub(crate) fn is_dangerous(grid: &Vec<Vec<u32>>) -> bool {
        let n = grid.len();
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        let threshold = (n * n / 6).max(2);
        empties <= threshold
    }

    fn default_depth(size: usize) -> usize {
        match size {
            0..=3 => 6,
            4 => 6,
            5 => 3,
            6 => 2,
            _ => 1,
        }
    }

    pub(crate) fn auto_depth(grid: &Vec<Vec<u32>>) -> usize {
        let n = grid.len();
        let base = Self::default_depth(n);
        let empty = grid.iter().flatten().filter(|&&v| v == 0).count();
        let area = (n * n).max(1);
        let ratio = empty as f64 / area as f64;

        let depth = if ratio > 0.55 {
            base.saturating_sub(3)
        } else if ratio > 0.35 {
            base.saturating_sub(2)
        } else if ratio > 0.22 {
            base.saturating_sub(1)
        } else if ratio > 0.12 {
            base
        } else if ratio > 0.07 {
            base + 1
        } else if ratio > 0.035 {
            base + 3
        } else {
            base + 5
        };
        let floor = if n <= 4 { 3 } else { 2 };
        let result = depth.max(floor);
        debug_assert!(result >= base.saturating_sub(3));
        result
    }

    pub(crate) fn budget_for_depth(depth: usize) -> u64 {
        match depth {
            0..=2 => 15_000,
            3 => 40_000,
            4 => 90_000,
            5..=6 => 150_000,
            7..=8 => 220_000,
            _ => 320_000,
        }
    }

    fn expectimax_max_flat(board: &[u32], n: usize, depth: usize, budget: &mut u64, prob: f64) -> f64 {
        if depth == 0 || *budget == 0 || prob < PROB_CUTOFF {
            return Self::heuristic_flat(board, n);
        }
        let hash = zobrist_hash(board);
        if let Some(cached) = tt_get(hash, depth) {
            return cached;
        }
        *budget -= 1;
        let ordered = Self::ordered_directions(board, n);
        let mut best = f64::NEG_INFINITY;
        let mut any_move = false;
        let mut new_board = [0u32; 256];
        for &(dir, moved, quick_score) in ordered.iter() {
            if !moved {
                continue;
            }
            any_move = true;
            if best > f64::NEG_INFINITY && quick_score < best - PRUNE_MARGIN {
                if quick_score > best {
                    best = quick_score;
                }
                continue;
            }
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            let v = gained as f64
                + Self::expectimax_chance_flat(slice, n, depth.saturating_sub(1), budget, prob);
            if v > best {
                best = v;
            }
        }
        let result = if !any_move { -200000.0 } else { best };
        if prob >= PROB_CUTOFF {
            tt_put(hash, depth, result);
        }
        result
    }

    fn expectimax_chance_flat(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        prob: f64,
    ) -> f64 {
        if *budget == 0 || prob < PROB_CUTOFF {
            return Self::heuristic_flat(board, n);
        }
        let mut empties = [0usize; 256];
        let mut num_empties = 0;
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties[num_empties] = idx;
                num_empties += 1;
            }
        }
        if num_empties == 0 || depth == 0 {
            return Self::heuristic_flat(board, n);
        }
        let hash = zobrist_hash(board);
        if let Some(cached) = tt_get(hash, depth) {
            return cached;
        }
        *budget -= 1;

        const MAX_CELLS: usize = 6;
        let mut sampled = [0usize; MAX_CELLS];
        let sampled_len = if num_empties <= MAX_CELLS {
            for i in 0..num_empties {
                sampled[i] = empties[i];
            }
            num_empties
        } else {
            let stride = num_empties as f64 / MAX_CELLS as f64;
            for i in 0..MAX_CELLS {
                sampled[i] = empties[(i as f64 * stride) as usize];
            }
            MAX_CELLS
        };

        let mut total = 0.0;
        let weight_each = 1.0 / sampled_len as f64;
        let next_depth = depth.saturating_sub(1);
        for i in 0..sampled_len {
            let idx = sampled[i];
            let p2 = prob * weight_each * 0.9;
            let p4 = prob * weight_each * 0.1;

            board[idx] = 2;
            let v2 = if p2 < PROB_CUTOFF {
                Self::heuristic_flat(board, n)
            } else {
                Self::expectimax_max_flat(board, n, next_depth, budget, p2)
            };
            board[idx] = 4;
            let v4 = if p4 < PROB_CUTOFF {
                Self::heuristic_flat(board, n)
            } else {
                Self::expectimax_max_flat(board, n, next_depth, budget, p4)
            };
            board[idx] = 0;

            total += weight_each * (0.9 * v2 + 0.1 * v4);
        }
        if prob >= PROB_CUTOFF {
            tt_put(hash, depth, total);
        }
        total
    }

}

pub(crate) fn sampled_pairs(occ: &[(usize, usize)], max: usize) -> Vec<((usize, usize), (usize, usize))> {
    let n = occ.len();
    if n < 2 || max == 0 {
        return Vec::new();
    }
    let total: usize = n * (n - 1) / 2;
    let step = if total <= max {
        1
    } else {
        (total + max - 1) / max
    };
    let mut out: Vec<((usize, usize), (usize, usize))> = Vec::with_capacity(total.min(max));
    let mut count = 0usize;
    for i in 0..n {
        for j in (i + 1)..n {
            if count % step == 0 {
                out.push((occ[i], occ[j]));
            }
            count += 1;
        }
    }
    out
}
