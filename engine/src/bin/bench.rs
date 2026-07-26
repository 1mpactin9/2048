use engine2048::{Config, Engine};
use std::env;
use std::time::Instant;

fn main() {
    let games: usize = env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);

    let mut scores: Vec<u64> = Vec::with_capacity(games);
    let start = Instant::now();

    for i in 0..games {
        let mut engine = Engine::new(Config {
            size: 4,
            swap_charges: 0,
            delete_charges: 0,
            ..Config::default()
        })
        .expect("valid config");

        let game_start = Instant::now();
        loop {
            match engine.auto_play_step(None) {
                Some(Ok(outcome)) => {
                    if outcome.game_over {
                        break;
                    }
                }
                _ => break,
            }
        }

        let max_tile = engine.grid().iter().flatten().copied().max().unwrap_or(0);
        println!(
            "game {:>3}: score = {:>7}  max tile = {:>5}  ({:.1}s)",
            i + 1,
            engine.score(),
            max_tile,
            game_start.elapsed().as_secs_f64()
        );
        scores.push(engine.score());
    }

    scores.sort_unstable();
    let sum: u64 = scores.iter().sum();
    let avg = sum as f64 / scores.len() as f64;
    let min = scores[0];
    let max = scores[scores.len() - 1];
    let median = scores[scores.len() / 2];
    let at_least_100k = scores.iter().filter(|&&s| s >= 100_000).count();
    let at_least_200k = scores.iter().filter(|&&s| s >= 200_000).count();

    println!("\n--- {} games, standard 4x4, no power-ups ---", games);
    println!("min={} median={} avg={:.0} max={}", min, median, avg, max);
    println!(
        ">=100k: {}/{}   >=200k: {}/{}",
        at_least_100k, games, at_least_200k, games
    );
    println!("total wall time: {:.1}s", start.elapsed().as_secs_f64());
}
