# package-release.ps1 — Build clean distribution release package
$ErrorActionPreference = "Stop"

$version = "1.0.0"
$pluginName = "com.mylibrary.mediabrowser"
$rootDir = $PSScriptRoot
$releaseDir = "$rootDir\release"
$stageDir = "$releaseDir\package\$pluginName"
$zipPath = "$releaseDir\MyMediaLibrary-v$version.zip"
$zxpPath = "$releaseDir\$pluginName.zxp"

Write-Host "Creating release package v$version..." -ForegroundColor Cyan

# Prepare directories
if (Test-Path "$releaseDir\package") { Remove-Item -Path "$releaseDir\package" -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

# Files and directories to package
$includeItems = @(
    "CSXS",
    "client",
    "host",
    ".debug",
    "install.bat",
    "install.ps1",
    "README.md",
    "LICENSE"
)

foreach ($item in $includeItems) {
    $srcPath = "$rootDir\$item"
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination "$stageDir\$item" -Recurse -Force
        Write-Host "  [+] Included $item" -ForegroundColor Gray
    }
}

# Create Zip Archive
if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force }
Compress-Archive -Path "$releaseDir\package\*" -DestinationPath $zipPath -Force
Write-Host "✓ Release ZIP created: $zipPath" -ForegroundColor Green

# Create ZXP (ZXP is a zip archive with .zxp extension)
if (Test-Path $zxpPath) { Remove-Item -Path $zxpPath -Force }
Compress-Archive -Path "$stageDir\*" -DestinationPath "$releaseDir\temp.zip" -Force
Rename-Item -Path "$releaseDir\temp.zip" -NewName "$pluginName.zxp" -Force
Write-Host "✓ Release ZXP created: $zxpPath" -ForegroundColor Green

# Cleanup staging
Remove-Item -Path "$releaseDir\package" -Recurse -Force

Write-Host "Release packaging completed successfully!" -ForegroundColor Cyan
