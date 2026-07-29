use crate::search::sampled_pairs;
use crate::{Action, Direction, Engine};

impl Engine {
    pub fn derive_key(seed: &[u32]) -> [u32; 8] {
        let mut seed_bytes = [0u8; 32];
        for i in 0..8 {
            let v = seed.get(i).copied().unwrap_or(0);
            seed_bytes[i * 4..i * 4 + 4].copy_from_slice(&v.to_le_bytes());
        }
        let mut key_bytes = [0u8; 32];
        for i in 0..32 {
            key_bytes[i] = seed_bytes[i] ^ KEY_MATERIAL[i];
        }
        let mut key = [0u32; 8];
        for i in 0..8 {
            key[i] = u32::from_le_bytes([
                key_bytes[i * 4],
                key_bytes[i * 4 + 1],
                key_bytes[i * 4 + 2],
                key_bytes[i * 4 + 3],
            ]);
        }
        key
    }

    pub fn predict_spawn_flat(
        board: &mut [u32],
        n: usize,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Option<(usize, u32, u64)> {
        let mut empties = [0usize; 256];
        let mut num_empties = 0;
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties[num_empties] = idx;
                num_empties += 1;
            }
        }
        if num_empties == 0 {
            return None;
        }
        let mut rng = ChaChaGen::new(key, calls);
        const PROB_4: f64 = 0.1;
        let (spot, value) = if manipulate && num_empties > 1 {
            let rounds = 5_usize.min(num_empties);
            let mut best_spot = empties[0];
            let mut best_value: u32 = 2;
            let mut best_score = f64::NEG_INFINITY;
            for _ in 0..rounds {
                let cand_spot = empties[(rng.next() * num_empties as f64) as usize];
                let cand_value: u32 = if rng.next() < PROB_4 { 4 } else { 2 };
                board[cand_spot] = cand_value;
                let score = score_spawn_candidate_flat(board, n);
                board[cand_spot] = 0;
                if score > best_score {
                    best_score = score;
                    best_spot = cand_spot;
                    best_value = cand_value;
                }
            }
            (best_spot, best_value)
        } else {
            let spot = empties[(rng.next() * num_empties as f64) as usize];
            let value: u32 = if rng.next() < PROB_4 { 4 } else { 2 };
            (spot, value)
        };
        let draws = rng.calls - calls;
        Some((spot, value, draws))
    }

    fn expectimax_max_flat_det(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> f64 {
        if depth == 0 || *budget == 0 {
            return Self::heuristic_flat(board, n);
        }
        *budget -= 1;
        let mut best = f64::NEG_INFINITY;
        let mut any_move = false;
        let mut new_board = [0u32; 256];
        for &dir in Direction::ALL.iter() {
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(board, n, dir, slice);
            if slice == board {
                continue;
            }
            any_move = true;
            let v = gained as f64
                + Self::expectimax_chance_flat_det(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    key,
                    calls,
                    manipulate,
                );
            if v > best {
                best = v;
            }
        }
        if !any_move {
            return -200000.0;
        }
        best
    }

    fn expectimax_chance_flat_det(
        board: &mut [u32],
        n: usize,
        depth: usize,
        budget: &mut u64,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> f64 {
        if *budget == 0 {
            return Self::heuristic_flat(board, n);
        }
        let empties = board.iter().filter(|&&v| v == 0).count();
        if empties == 0 || depth == 0 {
            return Self::heuristic_flat(board, n);
        }
        *budget -= 1;
        let (idx, value, draws) = Self::predict_spawn_flat(board, n, key, calls, manipulate)
            .expect("non-empty board has a spawn");
        board[idx] = value;
        let v = Self::expectimax_max_flat_det(
            board,
            n,
            depth.saturating_sub(1),
            budget,
            key,
            calls + draws,
            manipulate,
        );
        board[idx] = 0;
        v
    }

    fn best_move_det(
        grid: &Vec<Vec<u32>>,
        depth: usize,
        budget: &mut u64,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> (Option<Direction>, f64) {
        let n = grid.len();
        let board = Self::flatten(grid);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        let mut new_board = [0u32; 256];
        for &dir in Direction::ALL.iter() {
            let slice = &mut new_board[..n * n];
            let gained = Self::slide_flat_into(&board, n, dir, slice);
            if slice == board {
                continue;
            }
            let value = gained as f64
                + Self::expectimax_chance_flat_det(
                    slice,
                    n,
                    depth.saturating_sub(1),
                    budget,
                    key,
                    calls,
                    manipulate,
                );
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

    pub fn suggest_move_det_for(
        grid: &Vec<Vec<u32>>,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Option<Direction> {
        let search_depth =
            Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)));
        let mut budget = Self::budget_for_depth(search_depth);
        Self::best_move_det(grid, search_depth, &mut budget, key, calls, manipulate).0
    }

    pub fn suggest_action_det_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::auto_depth(grid));
        let mut budget = Self::budget_for_depth(d);

        let (best_dir, move_val) =
            Self::best_move_det(grid, d, &mut budget, key, calls, manipulate);

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
                    let v = Self::best_move_det(&g, d, &mut budget, key, calls, manipulate).1;
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
                let v = Self::best_move_det(&g, d, &mut budget, key, calls, manipulate).1;
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
}

const KEY_MATERIAL: [u8; 32] = [
    0x9e, 0x37, 0x79, 0xb9, 0x8f, 0x1c, 0x4d, 0xa2, 0x55, 0x71, 0x03, 0x96, 0xc4, 0x6e, 0x20, 0xf1,
    0x4a, 0xd8, 0x7b, 0xe5, 0x19, 0xa0, 0x66, 0x3c, 0xf2, 0x4b, 0x88, 0x0d, 0xe6, 0x11, 0xc7, 0x5a,
];
const CHACHA_SIGMA: [u32; 4] = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
const CHACHA_NONCE: [u32; 2] = [0, 0];
const VALUES_PER_BLOCK: u64 = 16;

fn rotl32(x: u32, n: u32) -> u32 {
    x.rotate_left(n)
}

fn chacha_quarter_round(x: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize) {
    x[a] = x[a].wrapping_add(x[b]);
    x[d] = rotl32(x[d] ^ x[a], 16);
    x[c] = x[c].wrapping_add(x[d]);
    x[b] = rotl32(x[b] ^ x[c], 12);
    x[a] = x[a].wrapping_add(x[b]);
    x[d] = rotl32(x[d] ^ x[a], 8);
    x[c] = x[c].wrapping_add(x[d]);
    x[b] = rotl32(x[b] ^ x[c], 7);
}

fn chacha20_block(key: &[u32; 8], counter: u32, nonce: &[u32; 2], out: &mut [u32; 16]) {
    let mut s = [0u32; 16];
    s[0..4].copy_from_slice(&CHACHA_SIGMA);
    s[4..12].copy_from_slice(key);
    s[12] = counter;
    s[13] = 0;
    s[14] = nonce[0];
    s[15] = nonce[1];
    let mut x = s;
    for _ in 0..10 {
        chacha_quarter_round(&mut x, 0, 4, 8, 12);
        chacha_quarter_round(&mut x, 1, 5, 9, 13);
        chacha_quarter_round(&mut x, 2, 6, 10, 14);
        chacha_quarter_round(&mut x, 3, 7, 11, 15);
        chacha_quarter_round(&mut x, 0, 5, 10, 15);
        chacha_quarter_round(&mut x, 1, 6, 11, 12);
        chacha_quarter_round(&mut x, 2, 7, 8, 13);
        chacha_quarter_round(&mut x, 3, 4, 9, 14);
    }
    for i in 0..16 {
        out[i] = x[i].wrapping_add(s[i]);
    }
}

struct ChaChaGen<'a> {
    key: &'a [u32; 8],
    block: [u32; 16],
    block_index: u64,
    calls: u64,
}

impl<'a> ChaChaGen<'a> {
    fn new(key: &'a [u32; 8], calls: u64) -> Self {
        ChaChaGen {
            key,
            block: [0; 16],
            block_index: u64::MAX,
            calls,
        }
    }

    fn ensure_block(&mut self) {
        let idx = self.calls / VALUES_PER_BLOCK;
        if idx != self.block_index {
            chacha20_block(self.key, idx as u32, &CHACHA_NONCE, &mut self.block);
            self.block_index = idx;
        }
    }

    fn next(&mut self) -> f64 {
        self.ensure_block();
        let w = self.block[(self.calls % VALUES_PER_BLOCK) as usize];
        self.calls += 1;
        w as f64 / 4_294_967_296.0
    }
}

pub(crate) fn score_spawn_candidate_flat(board: &[u32], n: usize) -> f64 {
    let log = |v: u32| -> f64 {
        if v == 0 {
            0.0
        } else {
            v.trailing_zeros() as f64
        }
    };
    let mut empty = 0.0;
    let mut smoothness = 0.0;
    for r in 0..n {
        for c in 0..n {
            let v_raw = board[r * n + c];
            if v_raw == 0 {
                empty += 1.0;
                continue;
            }
            let v = log(v_raw);
            if c + 1 < n {
                let mut right_c = c + 1;
                while right_c < n && board[r * n + right_c] == 0 {
                    right_c += 1;
                }
                if right_c < n {
                    smoothness -= (v - log(board[r * n + right_c])).abs();
                }
            }
            if r + 1 < n {
                let mut down_r = r + 1;
                while down_r < n && board[down_r * n + c] == 0 {
                    down_r += 1;
                }
                if down_r < n {
                    smoothness -= (v - log(board[down_r * n + c])).abs();
                }
            }
        }
    }
    empty * 4.0 + smoothness
}
