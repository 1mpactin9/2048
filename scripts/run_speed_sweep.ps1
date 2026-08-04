$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineDir = Join-Path (Split-Path -Parent $scriptDir) "engine"
Set-Location $engineDir

Write-Host "Running full speed sweep across all board sizes (3,4,5,6,8)"
cargo run --release --bin bench-speed
