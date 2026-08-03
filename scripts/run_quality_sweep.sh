#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../engine"

GAMES="${1:-15}"
LOG="${2:-sweep_results.log}"

SWEEP="balanced:standard:3:${GAMES},balanced:standard:4:${GAMES},balanced:standard:5:${GAMES},balanced:standard:6:${GAMES},balanced:standard:8:${GAMES}"
SWEEP="${SWEEP},max:standard:4:${GAMES},limit:standard:4:${GAMES}"
SWEEP="${SWEEP},balanced:guarantee:4:${GAMES},balanced:guarantee:6:${GAMES}"
SWEEP="${SWEEP},balanced:deterministic:4:${GAMES},balanced:deterministic:6:${GAMES}"
SWEEP="${SWEEP},balanced:det_guarantee:4:${GAMES},balanced:det_guarantee:6:${GAMES}"
SWEEP="${SWEEP},max:deterministic:4:${GAMES}"

echo "Running quality sweep: ${GAMES} games/config, 13 configs, logging to ${LOG}"
cargo run --release --bin bench -- --sweep="${SWEEP}" --log="${LOG}"
