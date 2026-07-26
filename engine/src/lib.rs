use rand::Rng;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;

const SEARCH_NODE_BUDGET: u64 = 150_000;
const ENDGAME_EMPTY_THRESHOLD: usize = 2;
const ENDGAME_EXTRA_DEPTH: usize = 30;

thread_local! {
    static TT: RefCell<HashMap<(u64, usize), f64>> = RefCell::new(HashMap::new());
}

fn board_hash(board: &[u32]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &v in board {
        h ^= v as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

#[cfg(target_arch = "wasm32")]
mod wasm;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub const ALL: [Direction; 4] = [
        Direction::Up,
        Direction::Down,
        Direction::Left,
        Direction::Right,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Move(Direction),
    Delete(usize, usize),
    Swap((usize, usize), (usize, usize)),
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    OutOfBounds,
    CellEmpty,
    NoCharges(&'static str),
    NothingToUndo,
    GameOver,
    InvalidSize,
    SamePosition,
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::OutOfBounds => write!(f, "position is outside the board"),
            EngineError::CellEmpty => write!(f, "cell is empty"),
            EngineError::NoCharges(kind) => write!(f, "no {} charges left", kind),
            EngineError::NothingToUndo => write!(f, "no history to undo"),
            EngineError::GameOver => write!(f, "game is already over"),
            EngineError::InvalidSize => write!(f, "board size must be >= 2"),
            EngineError::SamePosition => write!(f, "positions must differ"),
        }
    }
}
impl std::error::Error for EngineError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveOutcome {
    pub moved: bool,
    pub gained_score: u64,
    pub spawned: Option<(usize, usize, u32)>,
    pub game_over: bool,
    pub won: bool,
}

#[derive(Clone)]
struct Snapshot {
    grid: Vec<Vec<u32>>,
    score: u64,
    swaps_left: u32,
    delete_left: u32,
    won: bool,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub size: usize,
    pub target_tile: u32,
    pub max_undo_history: usize,
    pub swap_charges: u32,
    pub delete_charges: u32,
    pub four_probability: f64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            size: 4,
            target_tile: 2048,
            max_undo_history: 20,
            swap_charges: 3,
            delete_charges: 3,
            four_probability: 0.1,
        }
    }
}

pub struct Engine {
    pub size: usize,
    grid: Vec<Vec<u32>>,
    score: u64,
    target_tile: u32,
    four_probability: f64,
    history: Vec<Snapshot>,
    max_undo_history: usize,
    swaps_left: u32,
    delete_left: u32,
    won: bool,
    rng: rand::rngs::ThreadRng,
}

impl Engine {
    pub fn new(config: Config) -> Result<Self, EngineError> {
        if config.size < 2 {
            return Err(EngineError::InvalidSize);
        }
        let mut engine = Engine {
            size: config.size,
            grid: vec![vec![0u32; config.size]; config.size],
            score: 0,
            target_tile: config.target_tile,
            four_probability: config.four_probability,
            history: Vec::new(),
            max_undo_history: config.max_undo_history,
            swaps_left: config.swap_charges,
            delete_left: config.delete_charges,
            won: false,
            rng: rand::thread_rng(),
        };
        engine.spawn_tile();
        engine.spawn_tile();
        Ok(engine)
    }

    pub fn with_size(size: usize) -> Result<Self, EngineError> {
        Engine::new(Config {
            size,
            ..Config::default()
        })
    }
    pub fn grid(&self) -> &Vec<Vec<u32>> {
        &self.grid
    }
    pub fn score(&self) -> u64 {
        self.score
    }
    pub fn swaps_left(&self) -> u32 {
        self.swaps_left
    }
    pub fn deletes_left(&self) -> u32 {
        self.delete_left
    }
    pub fn has_won(&self) -> bool {
        self.won
    }

    pub fn tile_at(&self, r: usize, c: usize) -> Result<u32, EngineError> {
        self.grid
            .get(r)
            .and_then(|row| row.get(c))
            .copied()
            .ok_or(EngineError::OutOfBounds)
    }

    pub fn is_game_over(&self) -> bool {
        !self.any_move_possible()
    }

    pub fn empty_cells(&self) -> Vec<(usize, usize)> {
        let mut v = Vec::new();
        for r in 0..self.size {
            for c in 0..self.size {
                if self.grid[r][c] == 0 {
                    v.push((r, c));
                }
            }
        }
        v
    }

    pub fn make_move(&mut self, dir: Direction) -> Result<MoveOutcome, EngineError> {
        if self.is_game_over() {
            return Err(EngineError::GameOver);
        }
        let (new_grid, gained) = Self::slide_grid(&self.grid, dir);
        let moved = new_grid != self.grid;

        if !moved {
            return Ok(MoveOutcome {
                moved: false,
                gained_score: 0,
                spawned: None,
                game_over: self.is_game_over(),
                won: self.won,
            });
        }

        self.push_history();
        self.grid = new_grid;
        self.score += gained;

        if !self.won {
            for row in &self.grid {
                if row.iter().any(|&v| v >= self.target_tile) {
                    self.won = true;
                    break;
                }
            }
        }

        let spawned = self.spawn_tile();
        let game_over = self.is_game_over();

        Ok(MoveOutcome {
            moved: true,
            gained_score: gained,
            spawned,
            game_over,
            won: self.won,
        })
    }

    pub fn undo(&mut self) -> Result<(), EngineError> {
        match self.history.pop() {
            Some(snap) => {
                self.grid = snap.grid;
                self.score = snap.score;
                self.swaps_left = snap.swaps_left;
                self.delete_left = snap.delete_left;
                self.won = snap.won;
                Ok(())
            }
            None => Err(EngineError::NothingToUndo),
        }
    }

    pub fn undo_available(&self) -> usize {
        self.history.len()
    }

    pub fn swap_tiles(&mut self, a: (usize, usize), b: (usize, usize)) -> Result<(), EngineError> {
        if a == b {
            return Err(EngineError::SamePosition);
        }
        self.check_bounds(a)?;
        self.check_bounds(b)?;
        if self.swaps_left == 0 {
            return Err(EngineError::NoCharges("swap"));
        }
        if self.grid[a.0][a.1] == 0 || self.grid[b.0][b.1] == 0 {
            return Err(EngineError::CellEmpty);
        }
        self.push_history();
        let tmp = self.grid[a.0][a.1];
        self.grid[a.0][a.1] = self.grid[b.0][b.1];
        self.grid[b.0][b.1] = tmp;
        self.swaps_left -= 1;
        Ok(())
    }

    pub fn delete_tile(&mut self, pos: (usize, usize)) -> Result<(), EngineError> {
        self.check_bounds(pos)?;
        if self.delete_left == 0 {
            return Err(EngineError::NoCharges("delete"));
        }
        if self.grid[pos.0][pos.1] == 0 {
            return Err(EngineError::CellEmpty);
        }
        self.push_history();
        self.grid[pos.0][pos.1] = 0;
        self.delete_left -= 1;
        Ok(())
    }

    fn check_bounds(&self, pos: (usize, usize)) -> Result<(), EngineError> {
        if pos.0 >= self.size || pos.1 >= self.size {
            Err(EngineError::OutOfBounds)
        } else {
            Ok(())
        }
    }

    fn push_history(&mut self) {
        self.history.push(Snapshot {
            grid: self.grid.clone(),
            score: self.score,
            swaps_left: self.swaps_left,
            delete_left: self.delete_left,
            won: self.won,
        });
        if self.max_undo_history > 0 && self.history.len() > self.max_undo_history {
            self.history.remove(0);
        }
    }

    fn spawn_tile(&mut self) -> Option<(usize, usize, u32)> {
        let empties = self.empty_cells();
        if empties.is_empty() {
            return None;
        }
        let idx = self.rng.gen_range(0..empties.len());
        let (r, c) = empties[idx];
        let value = if self.rng.gen_bool(self.four_probability) {
            4
        } else {
            2
        };
        self.grid[r][c] = value;
        Some((r, c, value))
    }

    fn any_move_possible(&self) -> bool {
        if self.grid.iter().any(|row| row.iter().any(|&v| v == 0)) {
            return true;
        }
        let n = self.size;
        for r in 0..n {
            for c in 0..n {
                let v = self.grid[r][c];
                if c + 1 < n && self.grid[r][c + 1] == v {
                    return true;
                }
                if r + 1 < n && self.grid[r + 1][c] == v {
                    return true;
                }
            }
        }
        false
    }

    fn slide_grid(grid: &Vec<Vec<u32>>, dir: Direction) -> (Vec<Vec<u32>>, u64) {
        let n = grid.len();
        let mut result = vec![vec![0u32; n]; n];
        let mut gained: u64 = 0;

        let lines: Vec<Vec<(usize, usize)>> = match dir {
            Direction::Left => (0..n).map(|r| (0..n).map(|c| (r, c)).collect()).collect(),
            Direction::Right => (0..n)
                .map(|r| (0..n).rev().map(|c| (r, c)).collect())
                .collect(),
            Direction::Up => (0..n).map(|c| (0..n).map(|r| (r, c)).collect()).collect(),
            Direction::Down => (0..n)
                .map(|c| (0..n).rev().map(|r| (r, c)).collect())
                .collect(),
        };

        for line in lines {
            let values: Vec<u32> = line
                .iter()
                .map(|&(r, c)| grid[r][c])
                .filter(|&v| v != 0)
                .collect();

            let mut merged: Vec<u32> = Vec::with_capacity(values.len());
            let mut i = 0;
            while i < values.len() {
                if i + 1 < values.len() && values[i] == values[i + 1] {
                    let m = values[i] * 2;
                    merged.push(m);
                    gained += m as u64;
                    i += 2;
                } else {
                    merged.push(values[i]);
                    i += 1;
                }
            }
            while merged.len() < n {
                merged.push(0);
            }

            for (k, &(r, c)) in line.iter().enumerate() {
                result[r][c] = merged[k];
            }
        }

        (result, gained)
    }

    pub fn suggest_move(&self, depth: Option<usize>) -> Option<Direction> {
        Self::suggest_move_for(&self.grid, depth)
    }
    fn endgame_depth(grid: &Vec<Vec<u32>>, depth: usize) -> usize {
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        if empties <= ENDGAME_EMPTY_THRESHOLD {
            depth.max(ENDGAME_EXTRA_DEPTH)
        } else {
            depth
        }
    }

    pub fn suggest_move_for(grid: &Vec<Vec<u32>>, depth: Option<usize>) -> Option<Direction> {
        let search_depth = Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)));
        let mut budget = Self::budget_for_depth(search_depth);
        Self::best_move(grid, search_depth, &mut budget).0
    }

    fn flatten(grid: &Vec<Vec<u32>>) -> Vec<u32> {
        let n = grid.len();
        let mut out = Vec::with_capacity(n * n);
        for row in grid {
            out.extend_from_slice(row);
        }
        out
    }

    fn best_move(grid: &Vec<Vec<u32>>, depth: usize, budget: &mut u64) -> (Option<Direction>, f64) {
        TT.with(|c| c.borrow_mut().clear());
        let n = grid.len();
        let board = Self::flatten(grid);
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        for &dir in Direction::ALL.iter() {
            let (mut new_board, gained) = Self::slide_flat(&board, n, dir);
            if new_board == board {
                continue;
            }
            let value = gained as f64
                + Self::expectimax_chance_flat(&mut new_board, n, depth.saturating_sub(1), budget);
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

    pub fn suggest_action_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::auto_depth(grid));
        let mut budget = Self::budget_for_depth(d);

        let (best_dir, move_val) = Self::best_move(grid, d, &mut budget);

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
                    let v = Self::best_move(&g, d, &mut budget).1;
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
                let v = Self::best_move(&g, d, &mut budget).1;
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

    fn is_dangerous(grid: &Vec<Vec<u32>>) -> bool {
        let n = grid.len();
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        let threshold = (n * n / 6).max(2);
        empties <= threshold
    }

    pub fn auto_play_step(
        &mut self,
        depth: Option<usize>,
    ) -> Option<Result<MoveOutcome, EngineError>> {
        self.suggest_move(depth).map(|dir| self.make_move(dir))
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

    fn auto_depth(grid: &Vec<Vec<u32>>) -> usize {
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
        depth.max(2)
    }

    fn budget_for_depth(depth: usize) -> u64 {
        match depth {
            0..=2 => 15_000,
            3 => 40_000,
            4 => 90_000,
            5..=6 => SEARCH_NODE_BUDGET,
            7..=8 => 220_000,
            _ => 320_000,
        }
    }

    fn slide_flat(board: &[u32], n: usize, dir: Direction) -> (Vec<u32>, u64) {
        let mut result = vec![0u32; n * n];
        let mut gained: u64 = 0;

        let lines: Vec<Vec<usize>> = match dir {
            Direction::Left => (0..n)
                .map(|r| (0..n).map(|c| r * n + c).collect())
                .collect(),
            Direction::Right => (0..n)
                .map(|r| (0..n).rev().map(|c| r * n + c).collect())
                .collect(),
            Direction::Up => (0..n)
                .map(|c| (0..n).map(|r| r * n + c).collect())
                .collect(),
            Direction::Down => (0..n)
                .map(|c| (0..n).rev().map(|r| r * n + c).collect())
                .collect(),
        };

        for line in lines {
            let values: Vec<u32> = line
                .iter()
                .map(|&idx| board[idx])
                .filter(|&v| v != 0)
                .collect();

            let mut merged: Vec<u32> = Vec::with_capacity(values.len());
            let mut i = 0;
            while i < values.len() {
                if i + 1 < values.len() && values[i] == values[i + 1] {
                    let m = values[i] * 2;
                    merged.push(m);
                    gained += m as u64;
                    i += 2;
                } else {
                    merged.push(values[i]);
                    i += 1;
                }
            }
            while merged.len() < n {
                merged.push(0);
            }

            for (k, &idx) in line.iter().enumerate() {
                result[idx] = merged[k];
            }
        }

        (result, gained)
    }

    fn expectimax_max_flat(board: &[u32], n: usize, depth: usize, budget: &mut u64) -> f64 {
        if depth == 0 || *budget == 0 {
            return Self::heuristic_flat(board, n);
        }
        let key = (board_hash(board), depth);
        if let Some(cached) = TT.with(|c| c.borrow().get(&key).copied()) {
            return cached;
        }
        *budget -= 1;
        let mut best = f64::NEG_INFINITY;
        let mut any_move = false;
        for &dir in Direction::ALL.iter() {
            let (mut new_board, gained) = Self::slide_flat(board, n, dir);
            if new_board.as_slice() == board {
                continue;
            }
            any_move = true;
            let v = gained as f64
                + Self::expectimax_chance_flat(&mut new_board, n, depth.saturating_sub(1), budget);
            if v > best {
                best = v;
            }
        }
        let result = if !any_move { -200000.0 } else { best };
        TT.with(|c| c.borrow_mut().insert(key, result));
        result
    }

    fn expectimax_chance_flat(
        board: &mut Vec<u32>,
        n: usize,
        depth: usize,
        budget: &mut u64,
    ) -> f64 {
        if *budget == 0 {
            return Self::heuristic_flat(&*board, n);
        }
        let mut empties: Vec<usize> = Vec::new();
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties.push(idx);
            }
        }
        if empties.is_empty() || depth == 0 {
            return Self::heuristic_flat(&*board, n);
        }
        let key = (board_hash(board), depth);
        if let Some(cached) = TT.with(|c| c.borrow().get(&key).copied()) {
            return cached;
        }
        *budget -= 1;

        const MAX_CELLS: usize = 6;
        let sampled: Vec<usize> = if empties.len() <= MAX_CELLS {
            empties.clone()
        } else {
            let stride = empties.len() as f64 / MAX_CELLS as f64;
            (0..MAX_CELLS)
                .map(|i| empties[(i as f64 * stride) as usize])
                .collect()
        };

        let mut total = 0.0;
        let weight_each = 1.0 / sampled.len() as f64;
        let next_depth = depth.saturating_sub(1);
        for &idx in &sampled {
            board[idx] = 2;
            let v2 = Self::expectimax_max_flat(&*board, n, next_depth, budget);
            board[idx] = 4;
            let v4 = Self::expectimax_max_flat(&*board, n, next_depth, budget);
            board[idx] = 0;

            total += weight_each * (0.9 * v2 + 0.1 * v4);
        }
        TT.with(|c| c.borrow_mut().insert(key, total));
        total
    }

    fn heuristic_flat(board: &[u32], n: usize) -> f64 {
        let empty = board.iter().filter(|&&v| v == 0).count() as f64;

        let log = |v: u32| -> f64 {
            if v == 0 {
                0.0
            } else {
                (v as f64).log2()
            }
        };

        let mut smoothness = 0.0;
        for r in 0..n {
            for c in 0..n {
                let v_raw = board[r * n + c];
                if v_raw == 0 {
                    continue;
                }
                let v = log(v_raw);
                if c + 1 < n && board[r * n + c + 1] != 0 {
                    smoothness -= (v - log(board[r * n + c + 1])).abs();
                }
                if r + 1 < n && board[(r + 1) * n + c] != 0 {
                    smoothness -= (v - log(board[(r + 1) * n + c])).abs();
                }
            }
        }

        let mut mono = 0.0;
        for r in 0..n {
            let mut inc = 0.0;
            let mut dec = 0.0;
            for c in 0..n - 1 {
                let a = log(board[r * n + c]);
                let b = log(board[r * n + c + 1]);
                if a > b {
                    dec += a - b;
                } else {
                    inc += b - a;
                }
            }
            mono -= inc.min(dec);
        }
        for c in 0..n {
            let mut inc = 0.0;
            let mut dec = 0.0;
            for r in 0..n - 1 {
                let a = log(board[r * n + c]);
                let b = log(board[(r + 1) * n + c]);
                if a > b {
                    dec += a - b;
                } else {
                    inc += b - a;
                }
            }
            mono -= inc.min(dec);
        }

        const W_EMPTY: f64 = 270.0;
        const W_MONO: f64 = 25.0;
        const W_SMOOTH: f64 = 11.0;
        const W_SNAKE: f64 = 46.0;

        W_EMPTY * (empty + 1.0).log2()
            + W_MONO * mono
            + W_SMOOTH * smoothness
            + W_SNAKE * Self::snake_score_flat(board, n)
    }

    fn snake_score_flat(board: &[u32], n: usize) -> f64 {
        if n == 0 {
            return 0.0;
        }
        let log = |v: u32| -> f64 {
            if v == 0 {
                0.0
            } else {
                (v as f64).log2()
            }
        };

        const RATIO: f64 = 0.5;
        let mut weight = vec![0.0f64; n * n];
        let mut w = 1.0f64;
        for r in 0..n {
            let cols: Box<dyn Iterator<Item = usize>> = if r % 2 == 0 {
                Box::new(0..n)
            } else {
                Box::new((0..n).rev())
            };
            for c in cols {
                weight[r * n + c] = w;
                w *= RATIO;
            }
        }

        let dot = |wgt: &Vec<f64>| -> f64 {
            let mut s = 0.0;
            for r in 0..n {
                for c in 0..n {
                    s += log(board[r * n + c]) * wgt[r * n + c];
                }
            }
            s
        };
        let rotate = |wgt: &Vec<f64>| -> Vec<f64> {
            let mut out = vec![0.0f64; n * n];
            for r in 0..n {
                for c in 0..n {
                    out[c * n + (n - 1 - r)] = wgt[r * n + c];
                }
            }
            out
        };

        let w0 = weight;
        let w90 = rotate(&w0);
        let w180 = rotate(&w90);
        let w270 = rotate(&w180);

        [dot(&w0), dot(&w90), dot(&w180), dot(&w270)]
            .into_iter()
            .fold(f64::NEG_INFINITY, f64::max)
    }

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
        let mut empties: Vec<usize> = Vec::new();
        for (idx, &v) in board.iter().enumerate() {
            if v == 0 {
                empties.push(idx);
            }
        }
        if empties.is_empty() {
            return None;
        }
        let mut rng = ChaChaGen::new(key, calls);
        const PROB_4: f64 = 0.1;
        let (spot, value) = if manipulate && empties.len() > 1 {
            let rounds = 5_usize.min(empties.len());
            let mut best_spot = empties[0];
            let mut best_value: u32 = 2;
            let mut best_score = f64::NEG_INFINITY;
            for _ in 0..rounds {
                let cand_spot = empties[(rng.next() * empties.len() as f64) as usize];
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
            let spot = empties[(rng.next() * empties.len() as f64) as usize];
            let value: u32 = if rng.next() < PROB_4 { 4 } else { 2 };
            (spot, value)
        };
        let draws = rng.calls - calls;
        Some((spot, value, draws))
    }

    fn expectimax_max_flat_det(
        board: &mut Vec<u32>,
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
        for &dir in Direction::ALL.iter() {
            let (mut new_board, gained) = Self::slide_flat(board, n, dir);
            if new_board.as_slice() == board {
                continue;
            }
            any_move = true;
            let v = gained as f64
                + Self::expectimax_chance_flat_det(
                    &mut new_board,
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
        board: &mut Vec<u32>,
        n: usize,
        depth: usize,
        budget: &mut u64,
        key: &[u32; 8],
        calls: u64,
        manipulate: bool,
    ) -> f64 {
        if *budget == 0 {
            return Self::heuristic_flat(&*board, n);
        }
        let empties = board.iter().filter(|&&v| v == 0).count();
        if empties == 0 || depth == 0 {
            return Self::heuristic_flat(&*board, n);
        }
        *budget -= 1;
        let (idx, value, draws) =
            Self::predict_spawn_flat(&mut board[..], n, key, calls, manipulate)
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
        for &dir in Direction::ALL.iter() {
            let (mut new_board, gained) = Self::slide_flat(&board, n, dir);
            if new_board == board {
                continue;
            }
            let value = gained as f64
                + Self::expectimax_chance_flat_det(
                    &mut new_board,
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
        let search_depth = Self::endgame_depth(grid, depth.unwrap_or_else(|| Self::auto_depth(grid)));
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

fn sampled_pairs(occ: &[(usize, usize)], max: usize) -> Vec<((usize, usize), (usize, usize))> {
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

fn score_spawn_candidate_flat(board: &[u32], n: usize) -> f64 {
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
                let right = board[r * n + c + 1];
                if right != 0 {
                    smoothness -= (v - log(right)).abs();
                }
            }
            if r + 1 < n {
                let down = board[(r + 1) * n + c];
                if down != 0 {
                    smoothness -= (v - log(down)).abs();
                }
            }
        }
    }
    empty * 4.0 + smoothness
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slide_merges_correctly() {
        let grid = vec![
            vec![2, 2, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
        ];
        let (new_grid, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(new_grid[0], vec![4, 4, 0, 0]);
        assert_eq!(gained, 4);
    }

    #[test]
    fn works_on_all_sizes() {
        for size in [3, 4, 5, 6, 8] {
            let engine = Engine::with_size(size).unwrap();
            assert_eq!(engine.grid().len(), size);
            assert_eq!(engine.grid()[0].len(), size);
            let filled = engine.grid().iter().flatten().filter(|&&v| v != 0).count();
            assert_eq!(filled, 2);
        }
    }

    #[test]
    fn undo_restores_state() {
        let mut engine = Engine::with_size(4).unwrap();
        let before = engine.grid().clone();
        let before_score = engine.score();
        for &dir in Direction::ALL.iter() {
            if engine.make_move(dir).unwrap().moved {
                break;
            }
        }
        assert!(engine.undo_available() > 0);
        engine.undo().unwrap();
        assert_eq!(engine.grid(), &before);
        assert_eq!(engine.score(), before_score);
    }

    #[test]
    fn swap_and_delete_consume_charges() {
        let mut engine = Engine::new(Config {
            size: 4,
            swap_charges: 1,
            delete_charges: 1,
            ..Config::default()
        })
        .unwrap();
        let empties_before = engine.empty_cells().len();
        let mut occupied = vec![];
        for r in 0..4 {
            for c in 0..4 {
                if engine.tile_at(r, c).unwrap() != 0 {
                    occupied.push((r, c));
                }
            }
        }
        assert!(occupied.len() >= 2);
        engine.swap_tiles(occupied[0], occupied[1]).unwrap();
        assert_eq!(engine.swaps_left(), 0);
        assert_eq!(
            engine.swap_tiles(occupied[0], occupied[1]),
            Err(EngineError::NoCharges("swap"))
        );

        engine.delete_tile(occupied[0]).unwrap();
        assert_eq!(engine.deletes_left(), 0);
        assert_eq!(engine.empty_cells().len(), empties_before + 1);
    }

    #[test]
    fn slide_flat_matches_slide_grid() {
        let grids: Vec<Vec<Vec<u32>>> = vec![
            vec![
                vec![2, 2, 4, 0],
                vec![0, 4, 4, 0],
                vec![0, 0, 2, 2],
                vec![8, 0, 0, 8],
            ],
            vec![
                vec![2, 4, 2, 4],
                vec![4, 2, 4, 2],
                vec![2, 4, 2, 4],
                vec![4, 2, 4, 2],
            ],
            vec![
                vec![0, 0, 0, 0],
                vec![0, 2, 0, 0],
                vec![0, 0, 0, 0],
                vec![0, 0, 0, 4],
            ],
            vec![vec![2, 0, 2], vec![0, 4, 0], vec![4, 0, 4]],
        ];
        for grid in grids {
            let n = grid.len();
            let board = Engine::flatten(&grid);
            for &dir in Direction::ALL.iter() {
                let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                let (flat_result, flat_gain) = Engine::slide_flat(&board, n, dir);
                let expected_flat = Engine::flatten(&expected_grid);
                assert_eq!(
                    flat_result, expected_flat,
                    "slide_flat mismatch for dir {:?} on {:?}",
                    dir, grid
                );
                assert_eq!(
                    flat_gain, expected_gain,
                    "slide_flat gain mismatch for dir {:?} on {:?}",
                    dir, grid
                );
            }
        }
    }

    #[test]
    fn ai_suggests_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let dir = engine.suggest_move(Some(2));
        assert!(dir.is_some());
    }

    #[test]
    fn action_uses_delete_to_escape_stuck_board() {
        let grid = vec![
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
        ];
        let action = Engine::suggest_action_for(&grid, 0, 1, None);
        assert!(
            matches!(action, Action::Delete(_, _)),
            "expected a delete to escape, got {:?}",
            action
        );
        assert_eq!(Engine::suggest_action_for(&grid, 0, 0, None), Action::None);
    }

    #[test]
    fn action_moves_on_comfortable_board() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let action = Engine::suggest_action_for(&grid, 2, 2, None);
        assert!(
            matches!(action, Action::Move(_)),
            "expected a move, got {:?}",
            action
        );
    }

    #[test]
    fn score_spawn_candidate_matches_grid_ts() {
        assert_eq!(score_spawn_candidate_flat(&[2, 0, 0, 4], 2), 8.0);
        assert_eq!(score_spawn_candidate_flat(&[2, 2, 0, 4], 2), 3.0);
        assert_eq!(score_spawn_candidate_flat(&[2, 4, 0, 8], 2), 2.0);
    }

    #[test]
    fn predict_spawn_returns_valid_cell_value_and_draws() {
        let grid = vec![
            vec![2, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 4, 0],
            vec![0, 8, 0, 0],
        ];
        let n = grid.len();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        for manipulate in [false, true] {
            let mut board = Engine::flatten(&grid);
            let (idx, value, draws) =
                Engine::predict_spawn_flat(&mut board, n, &key, 0, manipulate).unwrap();
            assert_eq!(board[idx], 0, "predicted cell must be empty after probe");
            assert!(
                value == 2 || value == 4,
                "value must be 2 or 4, got {}",
                value
            );
            let empties = board.iter().filter(|&&v| v == 0).count();
            let expected = if manipulate && empties > 1 {
                2 * 5_usize.min(empties)
            } else {
                2
            };
            assert_eq!(
                draws, expected as u64,
                "draws for manipulate={}",
                manipulate
            );
        }
    }

    #[test]
    fn predict_spawn_none_on_full_board() {
        let grid = vec![vec![2, 4], vec![8, 16]];
        let key = Engine::derive_key(&[0; 8]);
        let mut board = Engine::flatten(&grid);
        assert!(Engine::predict_spawn_flat(&mut board, 2, &key, 0, false).is_none());
        assert!(Engine::predict_spawn_flat(&mut board, 2, &key, 0, true).is_none());
    }

    #[test]
    fn predict_spawn_is_deterministic() {
        let grid = vec![
            vec![2, 0, 0, 0],
            vec![0, 0, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 8, 0, 0],
        ];
        let key = Engine::derive_key(&[42; 8]);
        let mut a = Engine::flatten(&grid);
        let mut b = Engine::flatten(&grid);
        let r1 = Engine::predict_spawn_flat(&mut a, 4, &key, 7, true).unwrap();
        let r2 = Engine::predict_spawn_flat(&mut b, 4, &key, 7, true).unwrap();
        assert_eq!(r1, r2);
    }

    #[test]
    fn predict_spawn_plain_consumes_two_draws_regardless_of_position() {
        let grid = vec![vec![2, 0], vec![4, 8]];
        let key = Engine::derive_key(&[9; 8]);
        let mut board = Engine::flatten(&grid);
        let (_, _, draws) = Engine::predict_spawn_flat(&mut board, 2, &key, 3, false).unwrap();
        assert_eq!(draws, 2);
        let (_, _, draws_m) = Engine::predict_spawn_flat(&mut board, 2, &key, 3, true).unwrap();
        assert_eq!(draws_m, 2);
    }

    #[test]
    fn suggest_move_det_returns_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        let dir = Engine::suggest_move_det_for(&grid, Some(3), &key, 0, true);
        assert!(dir.is_some());
    }

    #[test]
    fn suggest_action_det_moves_on_comfortable_board() {
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let key = Engine::derive_key(&[1, 2, 3, 4, 5, 6, 7, 8]);
        let action = Engine::suggest_action_det_for(&grid, 2, 2, None, &key, 0, true);
        assert!(
            matches!(action, Action::Move(_)),
            "expected a move, got {:?}",
            action
        );
    }

    #[test]
    fn suggest_action_det_uses_delete_to_escape_stuck_board() {
        let grid = vec![
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
        ];
        let key = Engine::derive_key(&[7; 8]);
        let action = Engine::suggest_action_det_for(&grid, 0, 1, None, &key, 0, true);
        assert!(
            matches!(action, Action::Delete(_, _)),
            "expected a delete to escape, got {:?}",
            action
        );
        assert_eq!(
            Engine::suggest_action_det_for(&grid, 0, 0, None, &key, 0, true),
            Action::None
        );
    }

    #[test]
    fn game_over_detected_on_locked_board() {
        let mut engine = Engine::with_size(3).unwrap();
        engine.grid = vec![vec![2, 4, 2], vec![4, 2, 4], vec![2, 4, 8]];
        assert!(engine.is_game_over());
    }

    #[test]
    fn undo_respects_max_history() {
        let mut engine = Engine::new(Config {
            size: 4,
            max_undo_history: 2,
            ..Config::default()
        })
        .unwrap();

        for _ in 0..5 {
            for &dir in Direction::ALL.iter() {
                if engine.make_move(dir).unwrap().moved {
                    break;
                }
            }
        }
        assert_eq!(engine.undo_available(), 2);

        engine.undo().unwrap();
        engine.undo().unwrap();

        assert_eq!(engine.undo(), Err(EngineError::NothingToUndo));
    }

    #[test]
    fn slide_grid_empty_grid() {
        let grid = vec![vec![0; 4]; 4];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(result, grid);
        assert_eq!(gained, 0);
    }

    #[test]
    fn slide_grid_reverse_direction_right() {
        let grid = vec![vec![2, 2, 4, 4], vec![0; 4], vec![0; 4], vec![0; 4]];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Right);
        assert_eq!(result[0], vec![0, 0, 4, 8]);
        assert_eq!(gained, 12);
    }

    #[test]
    fn slide_grid_up_direction() {
        let mut grid = vec![vec![0; 4]; 4];
        grid[1][0] = 2;
        grid[2][0] = 2;
        let (result, gained) = Engine::slide_grid(&grid, Direction::Up);
        assert_eq!(result[0][0], 4);
        assert_eq!(result[1][0], 0);
        assert_eq!(gained, 4);
    }

    #[test]
    fn slide_grid_down_direction() {
        let mut grid = vec![vec![0; 4]; 4];
        grid[1][0] = 2;
        grid[2][0] = 2;
        let (result, gained) = Engine::slide_grid(&grid, Direction::Down);
        assert_eq!(result[3][0], 4);
        assert_eq!(gained, 4);
    }

    #[test]
    fn slide_grid_empty_rows_pass_through() {
        let grid = vec![
            vec![2, 0, 4, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
            vec![0, 0, 0, 0],
        ];
        let (result, gained) = Engine::slide_grid(&grid, Direction::Left);
        assert_eq!(result[0], vec![2, 4, 0, 0]);
        assert_eq!(gained, 0);
        assert_eq!(result[1], vec![0; 4]);
    }

    #[test]
    fn slide_flat_matches_slide_grid_all_sizes() {
        let sizes = [3u32, 4, 5, 6, 8];
        for size in sizes {
            let grid: Vec<Vec<u32>> = (0..size)
                .map(|r| (0..size).map(|c| ((r * size + c + 1) as u32) * 2).collect())
                .collect();
            let board = Engine::flatten(&grid);
            for &dir in Direction::ALL.iter() {
                let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                let (flat_result, flat_gain) = Engine::slide_flat(&board, size as usize, dir);
                let expected_flat = Engine::flatten(&expected_grid);
                assert_eq!(flat_result, expected_flat, "size {} dir {:?}", size, dir);
                assert_eq!(flat_gain, expected_gain, "size {} dir gain {:?}", size, dir);
            }
        }
    }

    #[test]
    fn auto_depth_floor_is_2() {
        let grid = vec![vec![0u32; 4]; 4];
        let depth = Engine::auto_depth(&grid);
        assert!(depth >= 2);
    }

    #[test]
    fn auto_depth_deeper_on_dangerous_board() {
        let mut grid = vec![vec![0u32; 4]; 4];
        for r in 0..4 {
            for c in 0..4 {
                if r != 0 || c != 0 {
                    grid[r][c] = 2;
                }
            }
        }
        let deep = Engine::auto_depth(&grid);
        let empty = Engine::auto_depth(&vec![vec![0u32; 4]; 4]);
        assert!(deep > empty);
    }

    #[test]
    fn auto_depth_different_bases_per_size() {
        let grid3 = vec![vec![0u32; 3]; 3];
        let grid8 = vec![vec![0u32; 8]; 8];
        assert!(Engine::auto_depth(&grid3) > Engine::auto_depth(&grid8));
    }

    #[test]
    fn budget_for_depth_values() {
        assert_eq!(Engine::budget_for_depth(0), 15_000);
        assert_eq!(Engine::budget_for_depth(2), 15_000);
        assert_eq!(Engine::budget_for_depth(3), 40_000);
        assert_eq!(Engine::budget_for_depth(4), 90_000);
        assert_eq!(Engine::budget_for_depth(5), 150_000);
        assert_eq!(Engine::budget_for_depth(6), 150_000);
        assert_eq!(Engine::budget_for_depth(7), 220_000);
        assert_eq!(Engine::budget_for_depth(8), 220_000);
        assert_eq!(Engine::budget_for_depth(10), 320_000);
    }

    #[test]
    fn snake_score_flat_empty_board() {
        let board: Vec<u32> = vec![0; 16];
        assert_eq!(Engine::snake_score_flat(&board, 4), 0.0);
    }

    #[test]
    fn snake_score_flat_single_corner_tile_positive() {
        let mut board = vec![0u32; 16];
        board[0] = 2048;
        let score = Engine::snake_score_flat(&board, 4);
        assert!(score > 0.0);
    }

    #[test]
    fn sampled_pairs_returns_all_when_few() {
        let occ: Vec<(usize, usize)> = vec![(0, 0), (0, 1), (1, 0)];
        let pairs = sampled_pairs(&occ, 100);
        assert_eq!(pairs.len(), 3);
    }

    #[test]
    fn sampled_pairs_caps_at_max() {
        let occ: Vec<(usize, usize)> = (0..20).map(|i| (i, 0)).collect();
        let pairs = sampled_pairs(&occ, 5);
        assert!(pairs.len() <= 5);
    }

    #[test]
    fn sampled_pairs_empty_input() {
        let occ: Vec<(usize, usize)> = vec![];
        assert!(sampled_pairs(&occ, 10).is_empty());
    }

    #[test]
    fn heuristic_flat_empty_board_only_empty_term() {
        let board: Vec<u32> = vec![0; 16];
        let h = Engine::heuristic_flat(&board, 4);
        assert!(h > 0.0);
    }

    #[test]
    fn heuristic_flat_sorted_board_high_score() {
        let mut board = vec![0u32; 16];
        board[0] = 2048;
        board[1] = 1024;
        board[3] = 512;
        board[2] = 256;
        let h = Engine::heuristic_flat(&board, 4);
        assert!(h > 0.0);
    }
}

#[cfg(test)]
mod endgame_checks {
    use super::*;

    #[test]
    fn endgame_boost_applies_when_few_empties() {
        let mut grid = vec![vec![0u32; 4]; 4];
        let mut v = 2u32;
        for r in 0..4 {
            for c in 0..4 {
                if !(r == 3 && c == 3) {
                    grid[r][c] = v;
                    v = if v == 2048 { 2 } else { v * 2 };
                }
            }
        }
        let depth = Engine::endgame_depth(&grid, 6);
        assert!(depth >= 30);
    }

    #[test]
    fn endgame_boost_not_applied_on_open_board() {
        let grid = vec![vec![0u32; 4]; 4];
        let depth = Engine::endgame_depth(&grid, 6);
        assert_eq!(depth, 6);
    }
}
