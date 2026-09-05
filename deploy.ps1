# deploy.ps1 — Deploy My Media Library to user and system CEP folders
$ErrorActionPreference = "Continue"

$currentDir = $PSScriptRoot
if (-not (Test-Path "$currentDir\CSXS\manifest.xml")) {
    $currentDir = "$env:APPDATA\Adobe\CEP\extensions\com.mylibrary.mediabrowser"
}

$destUser = "$env:APPDATA\Adobe\CEP\extensions\com.mylibrary.mediabrowser"
$dest64   = "C:\Program Files\Common Files\Adobe\CEP\extensions\com.mylibrary.mediabrowser"
$dest32   = "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.mylibrary.mediabrowser"

Write-Host "Deploying My Media Library..." -ForegroundColor Cyan
Write-Host "Source: $currentDir" -ForegroundColor Gray

# Check if Adobe Apps are running
$apps = Get-Process | Where-Object { $_.Name -like "*premiere*" -or $_.Name -like "*afterfx*" -or $_.Name -like "*after effects*" -or $_.Name -eq "CEPHtmlEngine" }
if ($apps) {
    Write-Host "WARNING: Premiere Pro, After Effects, or CEPHtmlEngine is running." -ForegroundColor Yellow
    Write-Host "If files fail to copy, please close the host apps and re-run deploy." -ForegroundColor Yellow
}

$deployItems = @("CSXS", "client", "host", "assets", ".debug", "README.md", "LICENSE", "install.bat", "install.ps1")

function Copy-Extension($srcPath, $destPath) {
    if ($srcPath -eq $destPath) { return }
    Write-Host "Syncing to $destPath..." -ForegroundColor Yellow
    if (!(Test-Path $destPath)) {
        New-Item -ItemType Directory -Force -Path $destPath | Out-Null
    }
    foreach ($item in $deployItems) {
        $srcItem = "$srcPath\$item"
        if (Test-Path $srcItem) {
            Copy-Item -Path $srcItem -Destination "$destPath\$item" -Recurse -Force
        }
    }
    if (Test-Path "$destPath\CSXS\manifest.xml") {
        Write-Host "Successfully deployed to $destPath" -ForegroundColor Green
    } else {
        Write-Host "Could not verify $destPath" -ForegroundColor Red
    }
}

Copy-Extension $currentDir $destUser
Copy-Extension $currentDir $dest64
Copy-Extension $currentDir $dest32

Write-Host "Deployment finished!" -ForegroundColor Green


