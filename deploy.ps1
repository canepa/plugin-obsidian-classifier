# Deploy script for Obsidian plugin
$pluginDir = "C:\Users\a.canepa\Documents\Work\.obsidian\plugins\obsidian-auto-tagger"

# Create plugin directory if it doesn't exist
if (-not (Test-Path $pluginDir)) {
    New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
    Write-Host "Created plugin directory: $pluginDir" -ForegroundColor Green
}

# Check if main.js exists
if (-not (Test-Path "main.js")) {
    Write-Host "Error: main.js not found. Build may have failed." -ForegroundColor Red
    Write-Host "Please check that all source files exist and the build completed successfully." -ForegroundColor Yellow
    exit 1
}

# Copy plugin files
Write-Host "Deploying plugin files..." -ForegroundColor Cyan

Copy-Item "main.js" -Destination $pluginDir -Force
Write-Host "  Copied main.js" -ForegroundColor Green

Copy-Item "manifest.json" -Destination $pluginDir -Force
Write-Host "  Copied manifest.json" -ForegroundColor Green

if (Test-Path "styles.css") {
    Copy-Item "styles.css" -Destination $pluginDir -Force
    Write-Host "  Copied styles.css" -ForegroundColor Green
}

Write-Host ""
Write-Host "Plugin deployed successfully to: $pluginDir" -ForegroundColor Green
Write-Host "Reload Obsidian to see the changes." -ForegroundColor Yellow
