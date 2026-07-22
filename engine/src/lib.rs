//! engine2048 — a standalone 2048 game engine (no UI).
//!
//! Supports arbitrary square board sizes (3x3, 4x4, 5x5, 6x6, 8x8, or any N),
//! undo, a "swap two tiles" power-up, a "delete a tile" power-up, and an
//! expectimax-based AI that can suggest or auto-play moves.

use rand::Rng;
use std::fmt;

// WebAssembly bridge (compiled only for the wasm32 target). Exposes the
// expectimax AI to the browser via wasm-bindgen; see `src/wasm.rs`.
#[cfg(target_arch = "wasm32")]
mod wasm;

/// The four cardinal move directions.
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

/// An action the auto-play AI can take: a directional move or a power-up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Move(Direction),
    /// Delete the tile at (row, col).
    Delete(usize, usize),
    /// Swap the tiles at (row_a, col_a) and (row_b, col_b).
    Swap((usize, usize), (usize, usize)),
    /// No action available (game over with no usable power-up).
    None,
}

/// Errors returned by engine operations.
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

/// Outcome of applying a move.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveOutcome {
    pub moved: bool,
    pub gained_score: u64,
    pub spawned: Option<(usize, usize, u32)>,
    pub game_over: bool,
    pub won: bool,
}

/// A snapshot of engine state used for undo.
#[derive(Clone)]
struct Snapshot {
    grid: Vec<Vec<u32>>,
    score: u64,
    swaps_left: u32,
    delete_left: u32,
    won: bool,
}

/// Configuration used when creating a new engine.
#[derive(Debug, Clone)]
pub struct Config {
    /// Board is `size x size`. Supported/tested: 3, 4, 5, 6, 8 (any >=2 works).
    pub size: usize,
    /// Tile value that counts as "won" (e.g. 2048). Set to `u32::MAX` to disable.
    pub target_tile: u32,
    /// How many undo steps to keep in history.
    pub max_undo_history: usize,
    /// Number of tile-swap power-ups available. 0 disables the feature.
    pub swap_charges: u32,
    /// Number of tile-delete power-ups available. 0 disables the feature.
    pub delete_charges: u32,
    /// Probability of spawning a 4 instead of a 2 (standard 2048 = 0.1).
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

/// The game engine itself.
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
    /// Create a new engine with the given config, spawning two starting tiles.
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

    /// Convenience constructor: standard rules at the given board size.
    pub fn with_size(size: usize) -> Result<Self, EngineError> {
        Engine::new(Config {
            size,
            ..Config::default()
        })
    }

    // ---------- accessors ----------

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

    // ---------- core move logic ----------

    /// Apply a move. Handles compression, merging, scoring, spawning a new tile,
    /// win/game-over detection, and pushes an undo snapshot beforehand.
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

    /// Undo the last mutating action (move, swap, or delete).
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

    /// Swap the values of two tiles (both must be occupied). Consumes one swap charge.
    pub fn swap_tiles(
        &mut self,
        a: (usize, usize),
        b: (usize, usize),
    ) -> Result<(), EngineError> {
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

    /// Delete (clear) a tile. Consumes one delete charge. Does not spawn a replacement.
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

    /// Pure function: slide+merge a grid in `dir`, returning (new_grid, score_gained).
    /// Does not mutate `self`; used both by `make_move` and by the AI search.
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

    // ---------- AI ----------

    /// Suggest the best move using expectimax search with a positional heuristic.
    /// `depth` overrides the default adaptive depth if provided.
    pub fn suggest_move(&self, depth: Option<usize>) -> Option<Direction> {
        Self::suggest_move_for(&self.grid, depth)
    }

    /// Pure AI entry point: suggest the best move for an arbitrary board
    /// (`0` = empty), without needing an `Engine` instance. The WebAssembly
    /// bridge exposes this so a browser can query the AI without constructing
    /// an engine (which would require an entropy source for `Engine::new`).
    pub fn suggest_move_for(grid: &Vec<Vec<u32>>, depth: Option<usize>) -> Option<Direction> {
        let search_depth = depth.unwrap_or_else(|| Self::default_depth(grid.len()));
        Self::best_move(grid, search_depth).0
    }

    /// Best directional move for `grid` and its expectimax value. The value is
    /// a heavy negative sentinel when no move is possible (game over), so it
    /// compares cleanly against power-up outcomes in `suggest_action_for`.
    fn best_move(grid: &Vec<Vec<u32>>, depth: usize) -> (Option<Direction>, f64) {
        let mut best_dir = None;
        let mut best_val = f64::NEG_INFINITY;
        for &dir in Direction::ALL.iter() {
            let (new_grid, gained) = Self::slide_grid(grid, dir);
            if new_grid == *grid {
                continue; // illegal move, skip
            }
            let value =
                gained as f64 + Self::expectimax_chance(&new_grid, depth.saturating_sub(1));
            if value > best_val {
                best_val = value;
                best_dir = Some(dir);
            }
        }
        let val = if best_dir.is_none() { -200_000.0 } else { best_val };
        (best_dir, val)
    }

    /// Suggest a full action (move or power-up) for an arbitrary board.
    ///
    /// Power-ups are scarce, so they are only evaluated when the board is
    /// congested (`is_dangerous`) or no directional move is possible - never in
    /// the comfortable midgame. A power-up is then chosen only if it improves
    /// the position by at least `POWERUP_MARGIN` over the best plain move, so
    /// charges aren't burned on marginal gains. When the board is stuck, the
    /// sentinel move value (`-200_000`) lets any escaping power-up through.
    pub fn suggest_action_for(
        grid: &Vec<Vec<u32>>,
        swaps_left: u32,
        deletes_left: u32,
        depth: Option<usize>,
    ) -> Action {
        let size = grid.len();
        let d = depth.unwrap_or_else(|| Self::default_depth(size));

        let (best_dir, move_val) = Self::best_move(grid, d);

        // Skip power-up evaluation entirely while the board is comfortable.
        let stuck = best_dir.is_none();
        if !stuck && !Self::is_dangerous(grid) {
            return best_dir.map(Action::Move).unwrap_or(Action::None);
        }

        const POWERUP_MARGIN: f64 = 150.0;

        // Deletes: O(n^2) - try every occupied cell.
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
                    let v = Self::best_move(&g, d).1;
                    if v > best_delete_val {
                        best_delete_val = v;
                        best_delete = Some((r, c));
                    }
                }
            }
        }

        // Swaps: O(n^4) pairs - sample to bound the cost on large boards.
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
                let v = Self::best_move(&g, d).1;
                if v > best_swap_val {
                    best_swap_val = v;
                    best_swap = Some((a, b));
                }
            }
        }

        // Pick the highest-value action, gating power-ups behind the margin.
        // When stuck, `move_val` is the sentinel, so any escape qualifies.
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

    /// A board is "dangerous" (worth spending a power-up) when empty cells are
    /// scarce. The threshold scales with board area so large boards aren't
    /// flagged prematurely.
    fn is_dangerous(grid: &Vec<Vec<u32>>) -> bool {
        let n = grid.len();
        let empties = grid.iter().flatten().filter(|&&v| v == 0).count();
        let threshold = (n * n / 8).max(2);
        empties <= threshold
    }

    /// Apply the AI's suggested move (if any) and return its outcome.
    pub fn auto_play_step(
        &mut self,
        depth: Option<usize>,
    ) -> Option<Result<MoveOutcome, EngineError>> {
        self.suggest_move(depth).map(|dir| self.make_move(dir))
    }

    fn default_depth(size: usize) -> usize {
        // Larger boards have a much higher branching factor per ply, so search
        // shallower to keep runtime reasonable; smaller boards can go deeper.
        match size {
            0..=3 => 5,
            4 => 4,
            5 => 3,
            6 => 2,
            _ => 1,
        }
    }

    // Max node: player picks the best of the (up to 4) resulting states.
    fn expectimax_max(grid: &Vec<Vec<u32>>, depth: usize) -> f64 {
        if depth == 0 {
            return Self::heuristic(grid);
        }
        let mut best = f64::NEG_INFINITY;
        let mut any_move = false;
        for &dir in Direction::ALL.iter() {
            let (new_grid, gained) = Self::slide_grid(grid, dir);
            if new_grid == *grid {
                continue;
            }
            any_move = true;
            let v = gained as f64 + Self::expectimax_chance(&new_grid, depth - 1);
            if v > best {
                best = v;
            }
        }
        if !any_move {
            return -200000.0; // game over in this branch: heavy penalty
        }
        best
    }

    // Chance node: environment spawns a 2 (90%) or 4 (10%) in a random empty cell.
    // For performance on large boards we cap how many empty cells we expand over.
    fn expectimax_chance(grid: &Vec<Vec<u32>>, depth: usize) -> f64 {
        let n = grid.len();
        let mut empties: Vec<(usize, usize)> = Vec::new();
        for r in 0..n {
            for c in 0..n {
                if grid[r][c] == 0 {
                    empties.push((r, c));
                }
            }
        }
        if empties.is_empty() || depth == 0 {
            return Self::heuristic(grid);
        }

        // Cap branching: sample at most MAX_CELLS empty cells (evenly strided)
        // to bound the tree size on big boards.
        const MAX_CELLS: usize = 6;
        let sampled: Vec<(usize, usize)> = if empties.len() <= MAX_CELLS {
            empties.clone()
        } else {
            let stride = empties.len() as f64 / MAX_CELLS as f64;
            (0..MAX_CELLS)
                .map(|i| empties[(i as f64 * stride) as usize])
                .collect()
        };

        let mut total = 0.0;
        let weight_each = 1.0 / sampled.len() as f64;
        for &(r, c) in &sampled {
            let mut g2 = grid.clone();
            g2[r][c] = 2;
            let v2 = Self::expectimax_max(&g2, depth - 1);

            let mut g4 = grid.clone();
            g4[r][c] = 4;
            let v4 = Self::expectimax_max(&g4, depth - 1);

            total += weight_each * (0.9 * v2 + 0.1 * v4);
        }
        total
    }

    /// Heuristic board evaluation: rewards empty space, monotonic rows/columns,
    /// smoothness (small differences between neighbours), and keeping the
    /// largest tile anchored in a corner.
    fn heuristic(grid: &Vec<Vec<u32>>) -> f64 {
        let n = grid.len();
        let empty = grid.iter().flatten().filter(|&&v| v == 0).count() as f64;

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
                if grid[r][c] == 0 {
                    continue;
                }
                let v = log(grid[r][c]);
                if c + 1 < n && grid[r][c + 1] != 0 {
                    smoothness -= (v - log(grid[r][c + 1])).abs();
                }
                if r + 1 < n && grid[r + 1][c] != 0 {
                    smoothness -= (v - log(grid[r + 1][c])).abs();
                }
            }
        }

        let mut mono = 0.0;
        for r in 0..n {
            let mut inc = 0.0;
            let mut dec = 0.0;
            for c in 0..n - 1 {
                let a = log(grid[r][c]);
                let b = log(grid[r][c + 1]);
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
                let a = log(grid[r][c]);
                let b = log(grid[r + 1][c]);
                if a > b {
                    dec += a - b;
                } else {
                    inc += b - a;
                }
            }
            mono -= inc.min(dec);
        }

        let max_val = grid.iter().flatten().copied().max().unwrap_or(0);
        let corners = [
            grid[0][0],
            grid[0][n - 1],
            grid[n - 1][0],
            grid[n - 1][n - 1],
        ];
        let corner_bonus = if corners.contains(&max_val) {
            log(max_val)
        } else {
            0.0
        };

        const W_EMPTY: f64 = 270.0;
        const W_MONO: f64 = 47.0;
        const W_SMOOTH: f64 = 11.0;
        const W_CORNER: f64 = 40.0;

        W_EMPTY * (empty + 1.0).log2()
            + W_MONO * mono
            + W_SMOOTH * smoothness
            + W_CORNER * corner_bonus
    }
}

/// Deterministic strided sample of up to `max` unordered pairs from `occ`, so
/// swap evaluation stays bounded on large boards. Returns every pair when there
/// are fewer than `max`.
fn sampled_pairs(occ: &[(usize, usize)], max: usize) -> Vec<((usize, usize), (usize, usize))> {
    let n = occ.len();
    if n < 2 || max == 0 {
        return Vec::new();
    }
    let total: usize = n * (n - 1) / 2;
    let step = if total <= max { 1 } else { (total + max - 1) / max };
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
    fn ai_suggests_legal_move() {
        let engine = Engine::with_size(4).unwrap();
        let dir = engine.suggest_move(Some(2));
        assert!(dir.is_some());
    }

    #[test]
    fn action_uses_delete_to_escape_stuck_board() {
        // Full board, no adjacent equals -> no move possible (game over).
        let grid = vec![
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
            vec![2, 4, 2, 4],
            vec![4, 2, 4, 2],
        ];
        // Stuck with a delete charge: the AI must spend it to escape.
        let action = Engine::suggest_action_for(&grid, 0, 1, None);
        assert!(
            matches!(action, Action::Delete(_, _)),
            "expected a delete to escape, got {:?}",
            action
        );
        // Stuck with no charges at all: nothing can be done.
        assert_eq!(Engine::suggest_action_for(&grid, 0, 0, None), Action::None);
    }

    #[test]
    fn action_moves_on_comfortable_board() {
        // Fresh board with two tiles is comfortable -> just move, save charges.
        let engine = Engine::with_size(4).unwrap();
        let grid = engine.grid().clone();
        let action = Engine::suggest_action_for(&grid, 2, 2, None);
        assert!(
            matches!(action, Action::Move(_)),
            "expected a move, got {:?}",
            action
        );
    }
}
