$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path -LiteralPath "dist\AstroAssistant\AstroAssistant.exe")) {
    Write-Host "Desktop build not found. Building Astro Desktop first..."
    & ".\desktop\build_windows.ps1"
    if ($LASTEXITCODE -ne 0) { throw "Desktop build failed." }
}

$iscc = Get-Command ISCC -ErrorAction SilentlyContinue
$isccPath = if ($iscc) { $iscc.Source } else { $null }

if (-not $isccPath) {
    $candidatePaths = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
    )
    foreach ($candidate in $candidatePaths) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $isccPath = $candidate
            break
        }
    }
}

if (-not $isccPath) {
    throw "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup, then rerun desktop\build_installer.ps1."
}

& $isccPath ".\desktop\AstroInstaller.iss"
if ($LASTEXITCODE -ne 0) { throw "Installer build failed." }

Write-Host ""
Write-Host "Installer complete:"
Write-Host "  dist\installer\AstroSetup.exe"
