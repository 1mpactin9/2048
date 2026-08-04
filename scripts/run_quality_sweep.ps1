param(
    [int]$Games = 15,
    [string]$LogName = "sweep_results.log"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineDir = Join-Path (Split-Path -Parent $scriptDir) "engine"
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

Write-Host "Running quality sweep: $Games games/config, 14 configs, logging to $LogName"
cargo run --release --bin bench -- --sweep="$sweep" --log="$LogName"
