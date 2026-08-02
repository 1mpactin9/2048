use engine2048::{Config, Engine, UsageMode};
use std::env;
use std::time::Instant;

fn parse_usage(raw: &str) -> Option<UsageMode> {
    match raw.to_ascii_lowercase().as_str() {
        "max" => Some(UsageMode::Max),
        "balanced" => Some(UsageMode::Balanced),
        "limit" => Some(UsageMode::Limit),
        _ => None,
    }
}

struct Args {
    games: usize,
    size: usize,
    usage: UsageMode,
}

fn parse_args() -> Args {
    let mut games = 20usize;
    let mut size = 4usize;
    let mut usage = UsageMode::Balanced;
    let mut positional_seen = false;

    for arg in env::args().skip(1) {
        if let Some(rest) = arg.strip_prefix("--usage=") {
            if let Some(u) = parse_usage(rest) {
                usage = u;
            }
        } else if let Some(rest) = arg.strip_prefix("--size=") {
            if let Ok(s) = rest.parse() {
                size = s;
            }
        } else if !positional_seen {
            if let Ok(g) = arg.parse() {
                games = g;
                positional_seen = true;
            }
        }
    }
    Args { games, size, usage }
}

fn main() {
    let args = parse_args();
    let games = args.games;
    let size = args.size;
    let usage = args.usage;

    let mut scores: Vec<u64> = Vec::with_capacity(games);
    let mut max_tiles: Vec<u32> = Vec::with_capacity(games);
    let start = Instant::now();

    for i in 0..games {
        let mut engine = Engine::new(Config {
            size,
            swap_charges: 0,
            delete_charges: 0,
            ..Config::default()
        })
        .expect("valid config");

        let game_start = Instant::now();
        loop {
            match engine.auto_play_step_with_usage(None, usage) {
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
            "game {:>3}: score = {:>7}  max tile = {:>6}  ({:.1}s)",
            i + 1,
            engine.score(),
            max_tile,
            game_start.elapsed().as_secs_f64()
        );
        scores.push(engine.score());
        max_tiles.push(max_tile);
    }

    scores.sort_unstable();
    let sum: u64 = scores.iter().sum();
    let avg = sum as f64 / scores.len() as f64;
    let min = scores[0];
    let max = scores[scores.len() - 1];
    let median = scores[scores.len() / 2];
    let at_least_100k = scores.iter().filter(|&&s| s >= 100_000).count();
    let at_least_200k = scores.iter().filter(|&&s| s >= 200_000).count();
    let at_least_2048 = max_tiles.iter().filter(|&&t| t >= 2048).count();
    let at_least_4096 = max_tiles.iter().filter(|&&t| t >= 4096).count();

    println!(
        "\n--- {} games, {}x{}, usage={:?}, no power-ups ---",
        games, size, size, usage
    );
    println!("min={} median={} avg={:.0} max={}", min, median, avg, max);
    println!(
        ">=2048: {}/{}   >=4096: {}/{}   >=100k: {}/{}   >=200k: {}/{}",
        at_least_2048, games, at_least_4096, games, at_least_100k, games, at_least_200k, games
    );
    println!("total wall time: {:.1}s", start.elapsed().as_secs_f64());
}
