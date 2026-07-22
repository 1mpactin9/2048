use engine2048::{Config, Direction, Engine};
use std::io::{self, Write};

fn print_grid(engine: &Engine) {
    for row in engine.grid() {
        for &v in row {
            if v == 0 {
                print!("{:>6}", ".");
            } else {
                print!("{:>6}", v);
            }
        }
        println!();
    }
    println!(
        "score: {} | swaps left: {} | deletes left: {} | undo depth: {}",
        engine.score(),
        engine.swaps_left(),
        engine.deletes_left(),
        engine.undo_available()
    );
}

fn main() {
    println!("engine2048 demo — pick a board size (3, 4, 5, 6, 8):");
    let size = read_line().trim().parse::<usize>().unwrap_or(4);

    let mut engine = Engine::new(Config {
        size,
        ..Config::default()
    })
    .expect("valid size");

    println!("Commands: w/a/s/d = move, u = undo, ai = let AI play one move,");
    println!("          swap r1 c1 r2 c2, delete r c, auto N = auto-play N AI moves, q = quit");

    print_grid(&engine);

    loop {
        print!("> ");
        io::stdout().flush().unwrap();
        let line = read_line();
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        match parts[0] {
            "w" => act(engine.make_move(Direction::Up)),
            "s" => act(engine.make_move(Direction::Down)),
            "a" => act(engine.make_move(Direction::Left)),
            "d" => act(engine.make_move(Direction::Right)),
            "u" => match engine.undo() {
                Ok(()) => println!("undone."),
                Err(e) => println!("error: {e}"),
            },
            "ai" => {
                if let Some(res) = engine.auto_play_step(None) {
                    match res {
                        Ok(outcome) => println!("AI played -> {:?}", outcome),
                        Err(e) => println!("error: {e}"),
                    }
                } else {
                    println!("no legal moves (game over?)");
                }
            }
            "auto" => {
                let n: usize = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(10);
                for _ in 0..n {
                    match engine.auto_play_step(None) {
                        Some(Ok(o)) => {
                            if o.game_over {
                                println!("game over.");
                                break;
                            }
                        }
                        _ => break,
                    }
                }
            }
            "swap" if parts.len() == 5 => {
                let r1 = parts[1].parse().unwrap_or(0);
                let c1 = parts[2].parse().unwrap_or(0);
                let r2 = parts[3].parse().unwrap_or(0);
                let c2 = parts[4].parse().unwrap_or(0);
                match engine.swap_tiles((r1, c1), (r2, c2)) {
                    Ok(()) => println!("swapped."),
                    Err(e) => println!("error: {e}"),
                }
            }
            "delete" if parts.len() == 3 => {
                let r = parts[1].parse().unwrap_or(0);
                let c = parts[2].parse().unwrap_or(0);
                match engine.delete_tile((r, c)) {
                    Ok(()) => println!("deleted."),
                    Err(e) => println!("error: {e}"),
                }
            }
            "q" => break,
            _ => println!("unknown command"),
        }

        print_grid(&engine);
        if engine.is_game_over() {
            println!("GAME OVER. Final score: {}", engine.score());
        }
        if engine.has_won() {
            println!("You reached the target tile!");
        }
    }
}

fn act(result: Result<engine2048::MoveOutcome, engine2048::EngineError>) {
    match result {
        Ok(outcome) => {
            if !outcome.moved {
                println!("(no tiles moved)");
            }
        }
        Err(e) => println!("error: {e}"),
    }
}

fn read_line() -> String {
    let mut buf = String::new();
    io::stdin().read_line(&mut buf).expect("stdin read");
    buf
}
