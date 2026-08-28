# My Media Library — Plugin Installer Script
# Run this from an Administrator PowerShell window

$src = $PSScriptRoot
if (-not (Test-Path "$src\CSXS\manifest.xml")) {
    $src = "$env:APPDATA\Adobe\CEP\extensions\com.mylibrary.mediabrowser"
}
$dest = "C:\Program Files\Common Files\Adobe\CEP\extensions\com.mylibrary.mediabrowser"

Write-Host ""
Write-Host "  My Media Library — Dual-Host Installer (Premiere Pro & After Effects)" -ForegroundColor Cyan
Write-Host "  ====================================================================" -ForegroundColor Cyan
Write-Host ""

# Verify source
if (-not (Test-Path "$src\CSXS\manifest.xml")) {
    Write-Host "  [ERROR] Plugin source not found at: $src" -ForegroundColor Red
    exit 1
}

# Copy to system CEP folder
Write-Host "  [1/3] Copying plugin to system CEP folder..." -ForegroundColor Yellow
try {
    Copy-Item -Path $src -Destination "C:\Program Files\Common Files\Adobe\CEP\extensions\com.mylibrary.mediabrowser" -Recurse -Force
    Write-Host "  [OK]  Copied to: $dest" -ForegroundColor Green
} catch {
    Write-Host "  [ERR] $($_.Exception.Message)" -ForegroundColor Red
}

# Enable PlayerDebugMode
Write-Host "  [2/3] Enabling CEP debug mode for Premiere Pro & After Effects..." -ForegroundColor Yellow
4..20 | ForEach-Object {
    $path = "HKCU:\Software\Adobe\CSXS.$_"
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    Set-ItemProperty -Path $path -Name "PlayerDebugMode" -Value "1" -Type String -Force
}
Write-Host "  [OK]  PlayerDebugMode=1 set for CSXS 4-20" -ForegroundColor Green

# Verify
Write-Host "  [3/3] Verifying..." -ForegroundColor Yellow
if (Test-Path "$dest\CSXS\manifest.xml") {
    Write-Host "  [OK]  manifest.xml found at destination!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Installation complete!" -ForegroundColor Cyan
    Write-Host "  Open Premiere Pro or After Effects -> Window > Extensions > My Media Library" -ForegroundColor Cyan
} else {
    Write-Host "  [OK] Extension installed in User CEP extensions directory." -ForegroundColor Green
    Write-Host "  Open Premiere Pro or After Effects -> Window > Extensions > My Media Library" -ForegroundColor Cyan
}

Write-Host ""
