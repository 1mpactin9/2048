#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
g++ -O3 -std=c++17 -I include src/main.cpp -o engine2048
echo "Built ./engine2048"
g++ -O2 -std=c++17 -I include tests/test_correctness.cpp -o tests/test_correctness
echo "Built ./tests/test_correctness"
./tests/test_correctness
