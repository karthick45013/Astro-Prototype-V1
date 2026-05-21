$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "AstroAssistant"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Astro Assistant.lnk"
$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Astro Assistant"

if (Test-Path -LiteralPath $desktopShortcut) {
    Remove-Item -LiteralPath $desktopShortcut -Force
}

if (Test-Path -LiteralPath $startMenuDir) {
    Remove-Item -LiteralPath $startMenuDir -Recurse -Force
}

if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
}

Write-Host "Astro Assistant was removed from this Windows user account."
