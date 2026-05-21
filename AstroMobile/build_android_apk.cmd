@echo off
setlocal
cd /d "%~dp0"

where eas >nul 2>nul
if errorlevel 1 (
  echo EAS CLI is not installed.
  echo Install it with: npm install -g eas-cli
  echo Then sign in with: eas login
  exit /b 1
)

eas build -p android --profile preview
