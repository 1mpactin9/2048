$ErrorActionPreference = "Stop"
$rootDir = Get-Location

try {
    Get-Command cargo -ErrorAction Stop | Out-Null
} catch {
    exit 1
}

Set-Location "$rootDir/engine"
cargo run --release --bin bench-speed | Tee-Object -FilePath "$rootDir/speed_sweep.log"

$GAMES = "15"
$SWEEP = "balanced:standard:3:${GAMES},balanced:standard:4:${GAMES},balanced:standard:5:${GAMES},balanced:standard:6:${GAMES},balanced:standard:8:${GAMES}," +
         "max:standard:4:${GAMES},limit:standard:4:${GAMES}," +
         "balanced:guarantee:4:${GAMES},balanced:guarantee:6:${GAMES}," +
         "balanced:deterministic:4:${GAMES},balanced:deterministic:6:${GAMES}," +
         "balanced:det_guarantee:4:${GAMES},balanced:det_guarantee:6:${GAMES}," +
         "max:deterministic:4:${GAMES}"

cargo run --release --bin bench -- --sweep="$SWEEP" --log="$rootDir/quality_sweep.log"

Set-Location $rootDir