$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot "dist\AstroAssistant"
$installDir = Join-Path $env:LOCALAPPDATA "AstroAssistant"
$exePath = Join-Path $installDir "AstroAssistant.exe"

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "AstroAssistant.exe"))) {
    throw "AstroAssistant.exe was not found. Run desktop\build_windows.ps1 first."
}

if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $installDir -Recurse -Force

$shell = New-Object -ComObject WScript.Shell
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Astro Assistant.lnk"
$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Astro Assistant"
$startMenuShortcut = Join-Path $startMenuDir "Astro Assistant.lnk"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = $exePath
    $shortcut.Save()
}

Write-Host "Astro Assistant installed to:"
Write-Host "  $installDir"
Write-Host "Shortcuts created on Desktop and Start Menu."
