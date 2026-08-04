param(
    [int]$Games = 15,
    [string]$LogName = "sweep_results.log"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineDir = Join-Path (Split-Path -Parent $scriptDir) "engine"
Set-Location $engineDir

$MinGames = 5
$g3 = [Math]::Max($MinGames, $Games + 5)
$g4 = [Math]::Max($MinGames, $Games)
$g5 = [Math]::Max($MinGames, $Games - 2)
$g6 = [Math]::Max($MinGames, $Games - 5)

$sweep = @(
    "balanced:standard:3:$g3",
    "balanced:standard:4:$g4",
    "balanced:standard:5:$g5",
    "balanced:standard:6:$g6",
    "max:standard:4:$g4",
    "limit:standard:4:$g4",
    "balanced:guarantee:4:$g4",
    "balanced:guarantee:6:$g6",
    "balanced:deterministic:4:$g4",
    "balanced:deterministic:6:$g6",
    "balanced:det_guarantee:4:$g4",
    "balanced:det_guarantee:6:$g6",
    "max:deterministic:4:$g4"
) -join ","

Write-Host "3x3: $g3 games   4x4: $g4 games   5x5: $g5 games   6x6: $g6 games   8x8: skipped"
Write-Host "Running quality sweep, logging to $LogName"
cargo run --release --bin bench -- --sweep="$sweep" --log="$LogName"
