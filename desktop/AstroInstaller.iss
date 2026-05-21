; Build this with Inno Setup after running desktop\build_windows.ps1

#define MyAppName "Astro Assistant"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Astro"
#define MyAppExeName "AstroAssistant.exe"

[Setup]
AppId={{B229FC2A-73B6-42E8-92CF-A4D7F63B9C13}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Astro Assistant
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist\installer
OutputBaseFilename=AstroSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
SetupIconFile=assets\astro.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "..\dist\AstroAssistant\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
