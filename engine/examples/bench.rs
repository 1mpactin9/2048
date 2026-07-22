use engine2048::{Config, Engine};
use std::time::Instant;

fn main() {
    for size in [3usize, 4, 5, 6, 8] {
        let games = if size <= 4 { 5 } else { 3 };
        let mut max_tiles = vec![];
        let mut scores = vec![];
        let start = Instant::now();
        for _ in 0..games {
            let mut engine = Engine::new(Config { size, ..Config::default() }).unwrap();
            let mut steps = 0;
            loop {
                match engine.auto_play_step(None) {
                    Some(Ok(o)) => {
                        steps += 1;
                        if o.game_over || steps > 20000 {
                            break;
                        }
                    }
                    _ => break,
                }
            }
            let max_tile = engine.grid().iter().flatten().copied().max().unwrap_or(0);
            max_tiles.push(max_tile);
            scores.push(engine.score());
        }
        let elapsed = start.elapsed();
        println!(
            "size {}x{}: games={} avg_time={:.2}s max_tiles={:?} scores={:?}",
            size, size, games, elapsed.as_secs_f64() / games as f64, max_tiles, scores
        );
    }
}
