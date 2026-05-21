# Astro Mobile

Astro Mobile was originally created before Astro Desktop existed, and now serves as the Android companion app for Astro Desktop.

It connects to Astro Desktop Phone Mode through a local Wi-Fi/hotspot URL. The app can scan the desktop QR code, save the pairing URL, show recent Astro replies, send typed commands to the PC, and show a protected PC screen preview.

## Run Locally

1. Start Astro Desktop Phone Mode (recommended):

   ```powershell
   cd C:\Users\Karthick P\OneDrive\Documents\Desktop\AstroAssistant
   python -u astro.py --phone-only
   ```

2. Keep that terminal open. Astro prints a URL like:

   ```text
   http://192.168.x.x:8765/?token=...
   ```

3. Start the mobile app:

   ```powershell
   cd mobile\AstroMobile
   npm install
   npm start
   ```

4. Open it with Expo Go or an Android emulator.

5. Paste the full Phone Mode URL including `?token=...`, or scan desktop QR if available.

6. To stop Phone Mode, press `Ctrl + C` in the terminal.

Notes:
- If Astro Phone Mode restarts, token changes. Reconnect in mobile app with the new URL.
- Phone and PC must be on the same reachable network (same Wi-Fi/hotspot).

## Build APK For Testing

This creates an installable Android APK through Expo Application Services.

First install and sign in to EAS:

```powershell
npm install -g eas-cli
cmd /c eas login
```

Then build:

```powershell
cd mobile\AstroMobile
.\build_android_apk.cmd
```

Or run directly:

```powershell
npm run build:android
```

If PowerShell blocks `eas.ps1`, use `cmd /c eas ...` instead of `eas ...`.

One-step login and APK build:

```powershell
cd mobile\AstroMobile
.\login_and_build_apk.cmd
```

## Build APK Without Expo Account

This uses your local computer instead of EAS cloud. It requires Android Studio and Android SDK.

Install Android Studio, then in SDK Manager install:

- Android SDK Platform
- Android SDK Platform-Tools
- Android SDK Build-Tools

Then run:

```powershell
cd mobile\AstroMobile
.\build_android_local_apk.cmd
```

Output:

```text
mobile\AstroMobile\android\app\build\outputs\apk\debug\app-debug.apk
```

## Build AAB For Play Store

Google Play normally uses an Android App Bundle:

```powershell
cd mobile\AstroMobile
.\build_android_store.cmd
```

Or run:

```powershell
npm run build:android-store
```

## Pairing Rules

- Astro Desktop must be running Phone Mode.
- Phone and PC must be on the same reachable network, such as the same Wi-Fi or phone hotspot.
- If connection fails, check IP address, token, firewall, and whether `astro.py --phone-only` is still running.
- PC Screen Preview uses the same pairing token and refreshes screenshots from the PC. If Windows blocks screen capture, the app shows a placeholder explaining why.

## Privacy

See `PRIVACY.md`.
