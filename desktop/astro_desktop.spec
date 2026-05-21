# Build with:
#   pyinstaller desktop/astro_desktop.spec

block_cipher = None


a = Analysis(
    ["../astro_desktop.py"],
    pathex=[".."],
    binaries=[],
    datas=[],
    hiddenimports=[
        "pyttsx3.drivers",
        "pyttsx3.drivers.sapi5",
        "speech_recognition",
        "pyaudio",
        "PyPDF2",
        "docx",
        "qrcode",
        "PIL",
        "PIL.ImageTk",
        "PIL.ImageGrab",
        "mss",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "argostranslate",
        "transformers",
        "torch",
        "tensorflow",
        "keras",
        "pandas",
        "matplotlib",
        "scipy",
        "sklearn",
        "spacy",
        "stanza",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AstroAssistant",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="assets/astro.ico",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="AstroAssistant",
)
