#!/usr/bin/env bash
set -euo pipefail

BASELINE_DIR="${1:?usage: compare_before_after.sh <baseline_repo_dir> [games]}"
GAMES="${2:-15}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Baseline sweep ==="
(cd "$BASELINE_DIR" && bash scripts/run_quality_sweep.sh "$GAMES" baseline_results.log) || {
  echo "baseline repo missing scripts/run_quality_sweep.sh; running bench directly"
  (cd "$BASELINE_DIR/engine" && cargo run --release --bin bench -- \
    --sweep="balanced:standard:3:${GAMES},balanced:standard:4:${GAMES},balanced:standard:5:${GAMES},balanced:standard:6:${GAMES},balanced:standard:8:${GAMES},balanced:deterministic:4:${GAMES},balanced:det_guarantee:4:${GAMES}" \
    --log="../baseline_results.log")
}

echo "=== Updated sweep ==="
(cd "$HERE" && bash scripts/run_quality_sweep.sh "$GAMES" updated_results.log)

echo ""
echo "=== DIFF (baseline vs updated) ==="
diff -y --suppress-common-lines "$BASELINE_DIR/baseline_results.log" "$HERE/updated_results.log" || true
echo ""
echo "Full logs: $BASELINE_DIR/baseline_results.log  vs  $HERE/updated_results.log"
