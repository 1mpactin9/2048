param(
    [int]$Games = 15
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$engineDir = Join-Path $rootDir "engine"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$qualityLog = "quality_sweep_$timestamp.log"
$speedLog = Join-Path $rootDir "speed_sweep_$timestamp.log"

Write-Host "=== Run 1/2: Quality sweep ($Games games/config, 14 configs) ==="
Set-Location $engineDir
$sweep = @(
    "balanced:standard:3:$Games",
    "balanced:standard:4:$Games",
    "balanced:standard:5:$Games",
    "balanced:standard:6:$Games",
    "balanced:standard:8:$Games",
    "max:standard:4:$Games",
    "limit:standard:4:$Games",
    "balanced:guarantee:4:$Games",
    "balanced:guarantee:6:$Games",
    "balanced:deterministic:4:$Games",
    "balanced:deterministic:6:$Games",
    "balanced:det_guarantee:4:$Games",
    "balanced:det_guarantee:6:$Games",
    "max:deterministic:4:$Games"
) -join ","

cargo run --release --bin bench -- --sweep="$sweep" --log="$qualityLog"

Write-Host ""
Write-Host "=== Run 2/2: Speed sweep ==="
$speedOutput = cargo run --release --bin bench-speed 2>&1 | Tee-Object -Variable speedCapture
$speedCapture | Out-File -FilePath $speedLog -Encoding utf8

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Quality log: $(Join-Path $engineDir $qualityLog)"
Write-Host "Speed log:   $speedLog"
