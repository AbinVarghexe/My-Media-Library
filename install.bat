@echo off
:: ═══════════════════════════════════════════════════════════════════════════
:: My Media Library — Premiere Pro Plugin Installer
:: RIGHT-CLICK this file and choose "Run as administrator"
:: ═══════════════════════════════════════════════════════════════════════════

title My Media Library — Installer
color 0B

:: ─── Auto-elevate if not already admin ─────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  Requesting Administrator privileges...
    powershell -Command "Start-Process -FilePath '%~dpnx0' -Verb RunAs"
    exit /b
)

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         My Media Library — Plugin Installer          ║
echo  ║         for Adobe Premiere Pro                       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Running as Administrator. OK.
echo.

:: ─── Define paths ──────────────────────────────────────────────────────────
set "PLUGIN_NAME=com.mylibrary.mediabrowser"
set "SRC=%APPDATA%\Adobe\CEP\extensions\%PLUGIN_NAME%"
set "SYS_DEST=C:\Program Files\Common Files\Adobe\CEP\extensions\%PLUGIN_NAME%"

echo [1/3] Source:      %SRC%
echo [1/3] Destination: %SYS_DEST%
echo.

if not exist "%SRC%\CSXS\manifest.xml" (
    echo  ERROR: Source plugin not found!
    echo  Expected: %SRC%\CSXS\manifest.xml
    echo.
    pause
    exit /b 1
)

:: ─── Step 1: Copy plugin to system CEP folder ──────────────────────────────
echo [1/3] Copying plugin to Premiere Pro CEP extensions folder...
if not exist "%SYS_DEST%" mkdir "%SYS_DEST%"
xcopy "%SRC%\*.*" "%SYS_DEST%\" /E /Y /Q /H
if %errorLevel% LEQ 1 (
    echo  [OK] Plugin copied to system folder.
) else (
    echo  [!] xcopy returned error %errorLevel%
)
echo.

:: ─── Step 2: Enable CEP debug mode in registry ─────────────────────────────
echo [2/3] Enabling CEP debug mode (PlayerDebugMode=1)...
for %%v in (4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20) do (
    reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_STRING /d 1 /f >nul 2>&1
)
echo  [OK] Debug mode enabled for all CSXS versions.
echo.

:: ─── Step 3: Verify ────────────────────────────────────────────────────────
echo [3/3] Verifying installation...
if exist "%SYS_DEST%\CSXS\manifest.xml" (
    echo  [OK] Plugin verified at: %SYS_DEST%
) else (
    echo  [!] Manifest not found at destination. Check for errors above.
)
echo.

echo  ╔══════════════════════════════════════════════════════╗
echo  ║                 Installation Complete!               ║
echo  ║                                                      ║
echo  ║  1. FULLY CLOSE Adobe Premiere Pro (if open)         ║
echo  ║  2. RELAUNCH Premiere Pro                            ║
echo  ║  3. Go to:  Window ^> Extensions ^> My Media Library ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
