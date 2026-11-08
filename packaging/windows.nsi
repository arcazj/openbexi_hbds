Unicode true
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
!include MUI2.nsh
!include LogicLib.nsh
!include WinVer.nsh
!include x64.nsh
Name "OpenBEXI HBDS ${VERSION} (${ARCH})"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\OpenBEXI HBDS"
InstallDirRegKey HKCU "Software\OpenBEXI\HBDS" "InstallDir"
VIProductVersion "${VERSION}.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "OpenBEXI HBDS"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}.0.0"
VIAddVersionKey /LANG=1033 "FileDescription" "OpenBEXI HBDS ${ARCH} Installer (unsigned)"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright 2026 Jean-Christophe Arcaz and contributors"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PAYLOAD}\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "OpenBEXI HBDS requires Windows 10 or Windows 11."
    Abort
  ${EndIf}
!if "${ARCH}" == "arm64"
  ${IfNot} ${IsNativeARM64}
    MessageBox MB_ICONSTOP "This installer requires Windows ARM64. Use the x64 download on an Intel or AMD computer."
    Abort
  ${EndIf}
!else
  ${IfNot} ${IsNativeAMD64}
    MessageBox MB_ICONSTOP "This installer requires Windows x64. Use the ARM64 download on an ARM computer."
    Abort
  ${EndIf}
!endif
FunctionEnd

Section "OpenBEXI HBDS" Main
  SetShellVarContext current
  IfFileExists "$INSTDIR\runtime\pythonw.exe" 0 fresh
  ExecWait '"$INSTDIR\runtime\pythonw.exe" "$INSTDIR\launcher.py" --stop' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "OpenBEXI HBDS could not stop. Close the application and try again."
    Abort
  ${EndIf}
  fresh:
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\OpenBEXI\HBDS" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "DisplayName" "OpenBEXI HBDS ${VERSION} (${ARCH})"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "Publisher" "Jean-Christophe Arcaz"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "URLInfoAbout" "https://github.com/arcazj/openbexi_hbds"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\OpenBEXI HBDS"
  CreateShortcut "$SMPROGRAMS\OpenBEXI HBDS\OpenBEXI HBDS.lnk" "$INSTDIR\runtime\pythonw.exe" '$\"$INSTDIR\launcher.py$\"'
  CreateShortcut "$SMPROGRAMS\OpenBEXI HBDS\Stop OpenBEXI HBDS.lnk" "$INSTDIR\runtime\pythonw.exe" '$\"$INSTDIR\launcher.py$\" --stop'
  CreateShortcut "$SMPROGRAMS\OpenBEXI HBDS\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ExecWait '"$INSTDIR\runtime\pythonw.exe" "$INSTDIR\launcher.py" --stop' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "OpenBEXI HBDS could not stop. Close the application and try again."
    Abort
  ${EndIf}
  ; Delete only files shipped by this installer. Never recursively remove the
  ; installation directory or the separate user workspace.
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\OpenBEXI HBDS\OpenBEXI HBDS.lnk"
  Delete "$SMPROGRAMS\OpenBEXI HBDS\Stop OpenBEXI HBDS.lnk"
  Delete "$SMPROGRAMS\OpenBEXI HBDS\Uninstall.lnk"
  RMDir "$SMPROGRAMS\OpenBEXI HBDS"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBEXIHBDS"
  DeleteRegKey HKCU "Software\OpenBEXI\HBDS"
SectionEnd
