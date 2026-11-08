# Windows installation — v2.7

Download the **x64 installer** for Intel/AMD Windows PCs, or the **ARM64 installer**
for Windows on ARM. Both target Windows 10 and Windows 11. A modern Edge or Chrome
browser with WebGL support is required. Python and the browser libraries are bundled.

Downloads: [v2.7 release](https://github.com/arcazj/openbexi_hbds/releases/tag/v2.7).
The installer filenames are `openbexi-hbds-2.7-windows-x64-setup.exe` and
`openbexi-hbds-2.7-windows-arm64-setup.exe`. Matching portable ZIPs are also available.
GitHub's **Source code** ZIP and tar.gz downloads are source distributions; they
require a separately installed Python to run `server.py`.

## Install and launch

1. Download the installer matching the machine's native architecture.
2. Review the Commercial and Exempt Use License and choose an installation folder.
3. Start **OpenBEXI HBDS** from the Start menu. The launcher starts a local server
   and opens the application in the default browser.

Installation is for the current user and normally needs no administrator rights.
The default application directory is `%LOCALAPPDATA%\Programs\OpenBEXI HBDS`.
These installers are **unsigned**: no publisher signing certificate was available.
Check that the download is from the project's GitHub release and compare its SHA-256
with `SHA256SUMS.txt`. Windows may display an unknown-publisher warning; organizational
security policies can prevent unsigned software from running.

Core viewing, editing, Query and saving work without an internet connection.
External AI providers, remote links, and any externally referenced model images
still require network access. Optional AI uses your own configured provider keys.

## User data, upgrades and removal

Models, test models, backups and logs live under `%LOCALAPPDATA%\OpenBEXI\HBDS`.
The first launch copies example models there. Later launches and upgrades add newly
introduced examples without overwriting edited files or restoring deleted examples.
The installer stops the running desktop server before updating application files.

Use **Stop OpenBEXI HBDS** from the Start menu to stop the local server. Closing a
browser tab leaves it running so other open tabs can continue using the model.
Launching the shortcut again opens the existing session. The server uses loopback
port 8010, or an available loopback port if 8010 is occupied.

Uninstall through Windows Settings or the Start menu. Uninstallation stops the server
and removes installed program files and shortcuts. It preserves your data folder.
Back up that folder before changing computers; remove it separately only when you
intend to delete your saved work. `HBDS_DATA_DIR` can select a different data folder.

For a portable ZIP, extract it to a folder and open `OpenBEXI HBDS.cmd`.
`Stop OpenBEXI HBDS.cmd` stops the server. Portable means no installer registration;
user data still uses the separate folder described above.

## Licensing and support

Business use requires a paid commercial agreement unless an existing free-use
exemption applies. Personal noncommercial use, student/educator activities,
noncommercial research and qualifying nonprofit use retain the exemptions in
`LICENSE.txt`. Contact **openbexi@gmail.com** for commercial agreements.
Third-party and earlier license notices remain included.

If startup fails, inspect `launcher-error.log` in the data folder. Include the
architecture, Windows version and application version when reporting a problem.

## Building and checking a release

On Windows, with Python 3.9+ and Git installed:

```powershell
py -B scripts/build_windows.py --arch all
py -B scripts/windows_package_test.py --arch x64
```

The build downloads checksum-pinned official CPython 3.14.10 embedded runtimes and
NSIS 3.13. It does not install a global Python runtime or change PATH. Rebuild browser
libraries with `py -B scripts/vendor_browser_dependencies.py`; the npm integrity
values are pinned in `packaging/browser-dependencies.json`.

The release workflow builds and runs the package checks natively on x64 and ARM64.
The package tests cover launch, local APIs and bundled assets, repeat launch,
upgrade preservation, deletion preservation and uninstall preservation. Windows 10
compatibility is targeted; hosted runner checks do not substitute for a separate
Windows 10 desktop acceptance test.
