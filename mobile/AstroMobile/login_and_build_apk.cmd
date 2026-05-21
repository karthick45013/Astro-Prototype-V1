@echo off
setlocal
cd /d "%~dp0"

where eas >nul 2>nul
if errorlevel 1 (
  echo EAS CLI is not installed.
  echo Install it with: npm install -g eas-cli
  exit /b 1
)

echo Signing in to Expo/EAS...
cmd /c eas login
if errorlevel 1 exit /b 1

echo Building Astro Mobile APK...
cmd /c eas build -p android --profile preview
