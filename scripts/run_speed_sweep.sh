#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../engine"

echo "Running speed sweep across board sizes 3,4,5,6 (8x8 skipped)"
for size in 3 4 5 6; do
    cargo run --release --bin bench-speed -- "$size"
done
