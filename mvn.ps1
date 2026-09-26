$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mavenHome = Join-Path $root ".tools\apache-maven-3.9.6"
$mavenCmd = Join-Path $mavenHome "bin\mvn.cmd"

if (-not (Test-Path $mavenCmd)) {
    Write-Error "Local Maven was not found at $mavenHome. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_maven.ps1"
    exit 1
}

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        return $env:JAVA_HOME
    }

    $candidates = @(
        "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
    )

    $candidates += Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    $candidates += Get-ChildItem (Join-Path $env:USERPROFILE ".jdks") -Directory -Filter "openjdk-17*" -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "bin\java.exe"))) {
            return $candidate
        }
    }

    return $null
}

$javaHome = Resolve-JavaHome
if (-not $javaHome) {
    Write-Error "Java 17 was not found. Install JDK 17 or set JAVA_HOME to a JDK 17 directory."
    exit 1
}

$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$mavenHome\bin;$env:Path"

& $mavenCmd @args
exit $LASTEXITCODE
