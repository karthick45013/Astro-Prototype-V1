$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Failed to install Python requirements." }
python -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) { throw "Failed to install PyInstaller." }

$generatedPaths = @(
    "build\astro_desktop",
    "dist\AstroAssistant"
)

foreach ($path in $generatedPaths) {
    $resolvedPath = Join-Path (Get-Location) $path
    if (Test-Path -LiteralPath $resolvedPath) {
        Write-Host "Cleaning generated build output: $path"
        Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
}

python -m PyInstaller desktop\astro_desktop.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }

Write-Host ""
Write-Host "Build complete:"
Write-Host "  dist\AstroAssistant\AstroAssistant.exe"
