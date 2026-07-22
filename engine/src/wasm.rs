//! WebAssembly bindings for the 2048 AI, built with `wasm-pack --target web`.
//!
//! The browser owns all game state (grid, score, powerups, animations) and
//! asks the Rust AI what to do next via [`suggest_move`] (directions only) or
//! [`suggest_action`] (directions + power-ups). Both are pure - no RNG or
//! engine state is needed on this side.

use crate::{Action, Direction, Engine};
use wasm_bindgen::prelude::*;

/// Pack a direction into the integer code the JS side expects.
fn direction_code(dir: Direction) -> u32 {
    match dir {
        Direction::Up => 0,
        Direction::Down => 1,
        Direction::Left => 2,
        Direction::Right => 3,
    }
}

/// Sentinel returned when there is no legal move (game over) or the input is
/// malformed. Any value `> 3` means "no move"; the JS bridge maps that to a
/// stop action.
const NO_MOVE: u32 = u32::MAX;

/// Reconstruct a square grid from a flat row-major slice. `None` if malformed.
fn grid_from_flat(flat: &[u32], size: usize) -> Option<Vec<Vec<u32>>> {
    if size < 2 || flat.len() != size * size {
        return None;
    }
    Some((0..size).map(|r| flat[r * size..(r + 1) * size].to_vec()).collect())
}

/// Suggest the best move for a board given as a flat, row-major `u32` array
/// (`0` = empty). Returns `0 = up, 1 = down, 2 = left, 3 = right`, or
/// `u32::MAX` when no legal move exists. `depth = 0` uses the engine's
/// adaptive default (deeper on small boards, shallower on large ones).
#[wasm_bindgen]
pub fn suggest_move(flat: &[u32], size: usize, depth: u32) -> u32 {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return NO_MOVE,
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    Engine::suggest_move_for(&grid, depth_opt).map_or(NO_MOVE, direction_code)
}

/// Suggest a full action (move or power-up). The result is a flat `u32` array
/// the JS side decodes:
/// - `[0, dir]` - move (dir: 0=up, 1=down, 2=left, 3=right)
/// - `[1, r, c]` - delete the tile at (r, c)
/// - `[2, r1, c1, r2, c2]` - swap tiles at (r1,c1) and (r2,c2)
/// - `[3]` - no action (game over, no usable power-up)
///
/// `depth = 0` uses the adaptive default. `swaps_left` / `deletes_left` are the
/// remaining charges; power-ups are only considered when `> 0` and the board is
/// congested or stuck, so they aren't wasted in the comfortable midgame.
#[wasm_bindgen]
pub fn suggest_action(
    flat: &[u32],
    size: usize,
    swaps_left: u32,
    deletes_left: u32,
    depth: u32,
) -> Vec<u32> {
    let grid = match grid_from_flat(flat, size) {
        Some(g) => g,
        None => return vec![3],
    };
    let depth_opt = if depth == 0 {
        None
    } else {
        Some(depth as usize)
    };
    match Engine::suggest_action_for(&grid, swaps_left, deletes_left, depth_opt) {
        Action::Move(d) => vec![0, direction_code(d)],
        Action::Delete(r, c) => vec![1, r as u32, c as u32],
        Action::Swap(a, b) => vec![2, a.0 as u32, a.1 as u32, b.0 as u32, b.1 as u32],
        Action::None => vec![3],
    }
}
