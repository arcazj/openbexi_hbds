param(
    [string]$MavenVersion = "3.9.6"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot ".tools"
$mavenDir = Join-Path $toolsDir "apache-maven-$MavenVersion"

if (Test-Path (Join-Path $mavenDir "bin\mvn.cmd")) {
    Write-Host "Maven $MavenVersion is already installed at $mavenDir"
    exit 0
}

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$zipPath = Join-Path $toolsDir "apache-maven-$MavenVersion-bin.zip"
$shaPath = "$zipPath.sha512"
$baseUrl = "https://archive.apache.org/dist/maven/maven-3/$MavenVersion/binaries"
$zipUrl = "$baseUrl/apache-maven-$MavenVersion-bin.zip"
$shaUrl = "$zipUrl.sha512"

Write-Host "Downloading Apache Maven $MavenVersion..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
Invoke-WebRequest -Uri $shaUrl -OutFile $shaPath

$expectedHash = [regex]::Match((Get-Content -Raw $shaPath), "[a-fA-F0-9]{128}").Value.ToUpperInvariant()
$actualHash = (Get-FileHash -Algorithm SHA512 $zipPath).Hash.ToUpperInvariant()

if ($expectedHash -ne $actualHash) {
    throw "Downloaded Maven archive failed SHA512 verification."
}

Write-Host "Extracting Maven..."
Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force

Remove-Item -Force $zipPath, $shaPath

if (-not (Test-Path (Join-Path $mavenDir "bin\mvn.cmd"))) {
    throw "Maven extraction did not create the expected mvn.cmd file."
}

Write-Host "Maven $MavenVersion installed at $mavenDir"
