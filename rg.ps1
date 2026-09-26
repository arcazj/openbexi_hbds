$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rgExe = Join-Path $root ".tools\ripgrep-14.1.1-x86_64-pc-windows-msvc\rg.exe"

if (-not (Test-Path $rgExe)) {
    Write-Error "Local ripgrep was not found. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_ripgrep.ps1"
    exit 1
}

& $rgExe @args
exit $LASTEXITCODE
