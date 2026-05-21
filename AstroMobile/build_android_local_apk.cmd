@echo off
setlocal
cd /d "%~dp0"

echo Checking local Android build requirements...

where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install JDK 17 or newer first.
  exit /b 1
)

if "%ANDROID_HOME%"=="" (
  if exist "%LOCALAPPDATA%\Android\Sdk" (
    set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
  )
)

if "%ANDROID_HOME%"=="" (
  echo ANDROID_HOME is not set.
  echo Install Android Studio, then install Android SDK and set ANDROID_HOME.
  echo Common path: %LOCALAPPDATA%\Android\Sdk
  exit /b 1
)

if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
  echo Android SDK platform-tools were not found in %ANDROID_HOME%.
  echo Open Android Studio SDK Manager and install Android SDK Platform-Tools.
  exit /b 1
)

echo Generating native Android project...
cmd /c npx expo prebuild -p android --clean
if errorlevel 1 exit /b 1

echo Building local debug APK...
cd android
cmd /c gradlew.bat assembleDebug
if errorlevel 1 exit /b 1

echo.
echo APK created at:
echo %CD%\app\build\outputs\apk\debug\app-debug.apk
