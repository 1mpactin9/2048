pub mod bits4;
pub mod wide;

use crate::Direction;
use wide::WideBoard;

pub fn all_powers_of_two(board: &[u32]) -> bool {
    board.iter().all(|&v| v == 0 || v.is_power_of_two())
}

pub fn slide_bits_into(board: &[u32], n: usize, dir: Direction, result: &mut [u32]) -> Option<u64> {
    if !all_powers_of_two(board) || !wide::fits_wide_board(n) {
        return None;
    }
    if n == 4 {
        let bits = bits4::from_flat(board);
        let (new_bits, gained) = bits4::slide(bits, dir);
        let out = bits4::to_flat(new_bits);
        result[..16].copy_from_slice(&out);
        return Some(gained);
    }
    let wb = WideBoard::from_flat(board, n);
    let (new_wb, gained) = wb.slide(dir);
    let flat = new_wb.to_flat();
    result[..n * n].copy_from_slice(&flat);
    Some(gained)
}

#[cfg(test)]
mod fuzz_tests {
    use super::*;
    use crate::Engine;
    use rand::Rng;

    fn random_board(n: usize, rng: &mut impl Rng) -> Vec<Vec<u32>> {
        (0..n)
            .map(|_| {
                (0..n)
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
    fn bitboard_matches_grid_path_on_random_boards_all_sizes() {
        let mut rng = rand::thread_rng();
        for &n in &[3usize, 4, 5, 6, 8] {
            for _ in 0..150 {
                let grid = random_board(n, &mut rng);
                let flat = Engine::flatten(&grid);
                for &dir in Direction::ALL.iter() {
                    let (expected_grid, expected_gain) = Engine::slide_grid(&grid, dir);
                    let mut result = vec![0u32; n * n];
                    let gained = slide_bits_into(&flat, n, dir, &mut result)
                        .expect("bitboard path should handle power-of-two boards");
                    let expected_flat = Engine::flatten(&expected_grid);
                    assert_eq!(result, expected_flat, "n={} dir {:?} grid {:?}", n, dir, grid);
                    assert_eq!(gained, expected_gain, "n={} dir {:?} grid {:?}", n, dir, grid);
                }
            }
        }
    }

    #[test]
    fn bits4_roundtrip_conversion() {
        let mut rng = rand::thread_rng();
        for _ in 0..200 {
            let grid = random_board(4, &mut rng);
            let flat = Engine::flatten(&grid);
            let bits = bits4::from_flat(&flat);
            let back = bits4::to_flat(bits);
            assert_eq!(&back[..], &flat[..]);
        }
    }

    #[test]
    fn wide_board_roundtrip_conversion() {
        let mut rng = rand::thread_rng();
        for &n in &[3usize, 5, 6, 8] {
            for _ in 0..100 {
                let grid = random_board(n, &mut rng);
                let flat = Engine::flatten(&grid);
                let wb = WideBoard::from_flat(&flat, n);
                let back = wb.to_flat();
                assert_eq!(back, flat, "n={}", n);
            }
        }
    }

    #[test]
    fn non_power_of_two_falls_back_to_none() {
        let flat = vec![3u32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let mut result = vec![0u32; 16];
        assert!(slide_bits_into(&flat, 4, Direction::Left, &mut result).is_none());
    }
}
