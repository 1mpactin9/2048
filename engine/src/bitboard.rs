use crate::Direction;
use std::sync::OnceLock;

pub type Board64 = u64;

fn get_row(board: Board64, row: usize) -> u16 {
    ((board >> (row * 16)) & 0xFFFF) as u16
}

fn set_row(board: Board64, row: usize, value: u16) -> Board64 {
    (board & !(0xFFFFu64 << (row * 16))) | ((value as u64) << (row * 16))
}

fn get_nibble(row: u16, col: usize) -> u16 {
    (row >> (col * 4)) & 0xF
}

fn row_reverse(row: u16) -> u16 {
    let c0 = get_nibble(row, 0);
    let c1 = get_nibble(row, 1);
    let c2 = get_nibble(row, 2);
    let c3 = get_nibble(row, 3);
    c3 | (c2 << 4) | (c1 << 8) | (c0 << 12)
}

fn compute_row_left(row: u16) -> (u16, u32) {
    let vals: Vec<u16> = (0..4)
        .map(|c| get_nibble(row, c))
        .filter(|&v| v != 0)
        .collect();
    let mut merged: Vec<u16> = Vec::with_capacity(4);
    let mut gained: u32 = 0;
    let mut i = 0;
    while i < vals.len() {
        if i + 1 < vals.len() && vals[i] == vals[i + 1] && vals[i] < 15 {
            let nv = vals[i] + 1;
            merged.push(nv);
            gained += 1u32 << nv;
            i += 2;
        } else {
            merged.push(vals[i]);
            i += 1;
        }
    }
    while merged.len() < 4 {
        merged.push(0);
    }
    let mut out: u16 = 0;
    for (c, &nib) in merged.iter().enumerate() {
        out |= nib << (c * 4);
    }
    (out, gained)
}

fn left_table() -> &'static Vec<(u16, u32)> {
    static TABLE: OnceLock<Vec<(u16, u32)>> = OnceLock::new();
    TABLE.get_or_init(|| (0..=u16::MAX).map(compute_row_left).collect())
}

fn apply_rows(board: Board64, reversed: bool) -> (Board64, u64) {
    let table = left_table();
    let mut out: Board64 = 0;
    let mut gained: u64 = 0;
    for r in 0..4 {
        let row = get_row(board, r);
        let (new_row, g) = if reversed {
            let rev = row_reverse(row);
            let (nr, g) = table[rev as usize];
            (row_reverse(nr), g)
        } else {
            table[row as usize]
        };
        out = set_row(out, r, new_row);
        gained += g as u64;
    }
    (out, gained)
}

fn transpose(board: Board64) -> Board64 {
    let mut out: Board64 = 0;
    for r in 0..4 {
        for c in 0..4 {
            let shift_in = 16 * r + 4 * c;
            let nib = (board >> shift_in) & 0xF;
            let shift_out = 16 * c + 4 * r;
            out |= nib << shift_out;
        }
    }
    out
}

pub fn bitboard_move(board: Board64, dir: Direction) -> (Board64, u64) {
    match dir {
        Direction::Left => apply_rows(board, false),
        Direction::Right => apply_rows(board, true),
        Direction::Up => {
            let t = transpose(board);
            let (nt, g) = apply_rows(t, false);
            (transpose(nt), g)
        }
        Direction::Down => {
            let t = transpose(board);
            let (nt, g) = apply_rows(t, true);
            (transpose(nt), g)
        }
    }
}

pub fn board_to_bits(board: &[u32]) -> Board64 {
    let mut out: Board64 = 0;
    for (i, &v) in board.iter().enumerate().take(16) {
        let nib = if v == 0 {
            0
        } else {
            (v.trailing_zeros() as u64).min(15)
        };
        out |= nib << (i * 4);
    }
    out
}

pub fn bits_to_board(bits: Board64) -> [u32; 16] {
    let mut out = [0u32; 16];
    for (i, cell) in out.iter_mut().enumerate() {
        let nib = (bits >> (i * 4)) & 0xF;
        *cell = if nib == 0 { 0 } else { 1u32 << nib };
    }
    out
}

#[cfg(test)]
mod fuzz_tests {
    use super::*;
    use crate::Engine;
    use rand::Rng;

    fn random_board(rng: &mut impl Rng) -> Vec<Vec<u32>> {
        (0..4)
            .map(|_| {
                (0..4)
                    .map(|_| {
                        if rng.gen_bool(0.35) {
                            0
                        } else {
                            1u32 << rng.gen_range(1..12)
                        }
                    })
                    .collect()
            })
            .collect()
    }

    #[test]
    fn bitboard_matches_grid_path_on_random_boards() {
        let mut rng = rand::thread_rng();
        for _ in 0..500 {
            let grid = random_board(&mut rng);
            let flat = Engine::flatten(&grid);
            let bits = board_to_bits(&flat);
            for &dir in Direction::ALL.iter() {
                let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                let (new_bits, gained) = bitboard_move(bits, dir);
                let result = bits_to_board(new_bits);
                let expected_flat = Engine::flatten(&expected_grid);
                assert_eq!(&result[..], &expected_flat[..], "dir {:?} grid {:?}", dir, grid);
                assert_eq!(gained, expected_gain, "dir {:?} grid {:?}", dir, grid);
            }
        }
    }

    #[test]
    fn bitboard_roundtrip_conversion() {
        let mut rng = rand::thread_rng();
        for _ in 0..200 {
            let grid = random_board(&mut rng);
            let flat = Engine::flatten(&grid);
            let bits = board_to_bits(&flat);
            let back = bits_to_board(bits);
            assert_eq!(&back[..], &flat[..]);
        }
    }
}
