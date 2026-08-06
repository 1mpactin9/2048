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

$MinGames = 5
$g3 = [Math]::Max($MinGames, $Games + 5)
$g4 = [Math]::Max($MinGames, $Games)
$g5 = [Math]::Max($MinGames, $Games - 2)
$g6 = [Math]::Max($MinGames, $Games - 5)

Write-Host "=== Run 1/2: Quality sweep ==="
Write-Host "  3x3: $g3 games   4x4: $g4 games   5x5: $g5 games   6x6: $g6 games   8x8: skipped"
Set-Location $engineDir
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

cargo run --release --bin bench -- --sweep="$sweep" --log="$qualityLog"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Quality sweep failed (exit code $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== Run 2/2: Speed sweep (3,4,5,6 only, 8x8 skipped) ==="
if (Test-Path $speedLog) { Remove-Item $speedLog }
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
foreach ($size in 3, 4, 5, 6) {
    cargo run --release --bin bench-speed -- $size 2>&1 |
        ForEach-Object { $_.ToString() } |
        Tee-Object -FilePath $speedLog -Append
    if ($LASTEXITCODE -ne 0) {
        $ErrorActionPreference = $prevEap
        Write-Host "Speed sweep failed on size $size (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
$ErrorActionPreference = $prevEap

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Quality log: $(Join-Path $engineDir $qualityLog)"
Write-Host "Speed log:   $speedLog"
