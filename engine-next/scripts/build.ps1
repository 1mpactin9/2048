$ErrorActionPreference = "Stop"
Set-Location -Path (Join-Path $PSScriptRoot "..")
g++ -O3 -std=c++17 -I include src/main.cpp -o engine2048.exe
Write-Host "Built ./engine2048.exe"
g++ -O2 -std=c++17 -I include tests/test_correctness.cpp -o tests/test_correctness.exe
Write-Host "Built ./tests/test_correctness.exe"
& .\tests\test_correctness.exe
