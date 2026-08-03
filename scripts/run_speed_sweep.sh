#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../engine"

echo "Running full speed sweep across all board sizes (3,4,5,6,8)"
cargo run --release --bin bench-speed
