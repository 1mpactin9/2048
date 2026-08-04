#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../engine"

GAMES="${1:-15}"
LOG="${2:-sweep_results.log}"

max5() { [ "$1" -lt 5 ] && echo 5 || echo "$1"; }

G3=$(max5 $((GAMES + 5)))
G4=$(max5 $GAMES)
G5=$(max5 $((GAMES - 2)))
G6=$(max5 $((GAMES - 5)))

SWEEP="balanced:standard:3:${G3},balanced:standard:4:${G4},balanced:standard:5:${G5},balanced:standard:6:${G6}"
SWEEP="${SWEEP},max:standard:4:${G4},limit:standard:4:${G4}"
SWEEP="${SWEEP},balanced:guarantee:4:${G4},balanced:guarantee:6:${G6}"
SWEEP="${SWEEP},balanced:deterministic:4:${G4},balanced:deterministic:6:${G6}"
SWEEP="${SWEEP},balanced:det_guarantee:4:${G4},balanced:det_guarantee:6:${G6}"
SWEEP="${SWEEP},max:deterministic:4:${G4}"

echo "3x3: ${G3} games   4x4: ${G4} games   5x5: ${G5} games   6x6: ${G6} games   8x8: skipped"
echo "Running quality sweep, logging to ${LOG}"
cargo run --release --bin bench -- --sweep="${SWEEP}" --log="${LOG}"
