@echo off
setlocal

set "ROOT=%~dp0"
set "MAVEN_HOME=%ROOT%.tools\apache-maven-3.9.6"

if not exist "%MAVEN_HOME%\bin\mvn.cmd" (
  echo Local Maven was not found at "%MAVEN_HOME%". 1>&2
  echo Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_maven.ps1 1>&2
  exit /b 1
)

if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" goto run_maven

set "JAVA_HOME="
if exist "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe" (
  set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
  goto run_maven
)

for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do (
  if exist "%%~fD\bin\java.exe" (
    set "JAVA_HOME=%%~fD"
    goto run_maven
  )
)

for /d %%D in ("%USERPROFILE%\.jdks\openjdk-17*") do (
  if exist "%%~fD\bin\java.exe" (
    set "JAVA_HOME=%%~fD"
    goto run_maven
  )
)

echo Java 17 was not found. Install JDK 17 or set JAVA_HOME to a JDK 17 directory. 1>&2
exit /b 1

:run_maven
call "%MAVEN_HOME%\bin\mvn.cmd" %*
