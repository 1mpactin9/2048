$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineDir = Join-Path (Split-Path -Parent $scriptDir) "engine"
Set-Location $engineDir

Write-Host "Running speed sweep across board sizes 3,4,5,6 (8x8 skipped)"
foreach ($size in 3, 4, 5, 6) {
    cargo run --release --bin bench-speed -- $size
}
