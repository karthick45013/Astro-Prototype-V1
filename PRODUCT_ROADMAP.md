# Astro Cross-Device Product Roadmap

Astro is now organized toward two installable products.

## Astro Desktop

Goal: a Windows app users install and launch normally.

Current foundation:
- `astro.py` is the assistant/server.
- `astro_desktop.py` launches dashboard mode by default.
- `desktop/astro_desktop.spec` builds a Windows executable with PyInstaller.
- `desktop/AstroInstaller.iss` packages the executable into an installer with Inno Setup.
- `desktop/build_installer.ps1` builds the installer once Inno Setup is installed.

Build:

```powershell
.\desktop\build_windows.ps1
```

Installer:

```powershell
.\desktop\build_installer.ps1
```

If this fails, install Inno Setup first because it provides `ISCC.exe`.

No-Inno fallback install:

```powershell
.\desktop\install_desktop.ps1
```

This copies the built desktop app into `%LOCALAPPDATA%\AstroAssistant` and creates Desktop/Start Menu shortcuts.

## Astro Mobile

Goal: an Android companion app users install on their phone.

Current foundation:
- `mobile/AstroMobile` is an Expo React Native app.
- It connects to Astro Desktop Phone Mode.
- It can scan the desktop QR code, save pairing, send typed commands, and read status/replies.
- It can show a protected live PC screen preview from Astro Desktop Phone Mode.
- `mobile/AstroMobile/eas.json` defines APK and Play Store AAB build profiles.

Desktop pairing:

```powershell
python astro.py --phone
```

Mobile dev:

```powershell
cd mobile\AstroMobile
npm install
npm start
```

Mobile APK:

```powershell
cd mobile\AstroMobile
.\build_android_apk.cmd
```

EAS requires an Expo account. Run `cmd /c eas login` before building.

Or run `mobile\AstroMobile\login_and_build_apk.cmd` to sign in and build in one flow.

No Expo account path:

```powershell
cd mobile\AstroMobile
.\build_android_local_apk.cmd
```

This requires Android Studio/Android SDK on the PC.

Immediate no-install phone path:

Open Astro Desktop **Pair Phone**, scan the QR code, and use Astro from the phone browser. See `mobile\PHONE_BROWSER_MODE.md`.

## Next Product Steps

- Test QR pairing on a real Android phone.
- Test Live PC Screen on a real desktop session and phone hotspot.
- Build an APK with EAS after signing in.
- Build the Windows installer after installing Inno Setup.
- Add desktop auto-start option.
- Add Android voice input.
