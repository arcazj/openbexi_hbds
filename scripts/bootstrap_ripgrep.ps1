param(
    [string]$RipgrepVersion = "14.1.1"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot ".tools"
$ripgrepDirName = "ripgrep-$RipgrepVersion-x86_64-pc-windows-msvc"
$ripgrepDir = Join-Path $toolsDir $ripgrepDirName

if (Test-Path (Join-Path $ripgrepDir "rg.exe")) {
    Write-Host "ripgrep $RipgrepVersion is already installed at $ripgrepDir"
    exit 0
}

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$zipPath = Join-Path $toolsDir "$ripgrepDirName.zip"
$zipUrl = "https://github.com/BurntSushi/ripgrep/releases/download/$RipgrepVersion/$ripgrepDirName.zip"

Write-Host "Downloading ripgrep $RipgrepVersion..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

Write-Host "Extracting ripgrep..."
Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
Remove-Item -Force $zipPath

if (-not (Test-Path (Join-Path $ripgrepDir "rg.exe"))) {
    throw "ripgrep extraction did not create the expected rg.exe file."
}

Write-Host "ripgrep $RipgrepVersion installed at $ripgrepDir"
