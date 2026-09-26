@echo off
setlocal

set "ROOT=%~dp0"
set "RG_EXE=%ROOT%.tools\ripgrep-14.1.1-x86_64-pc-windows-msvc\rg.exe"

if not exist "%RG_EXE%" (
  echo Local ripgrep was not found. 1>&2
  echo Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap_ripgrep.ps1 1>&2
  exit /b 1
)

"%RG_EXE%" %*
