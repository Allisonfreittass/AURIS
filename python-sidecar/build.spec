# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Auris sidecar (remote-Whisper-only build).

This produces a standalone `auris_sidecar` binary (`.exe` on Windows) that
the packaged Electron app spawns from `process.resourcesPath`. PyInstaller
does not cross-compile, so run it once per target OS. Because we route Whisper through
the Auris proxy + Groq's hosted whisper-large-v3-turbo, we deliberately
EXCLUDE the local Whisper toolchain (faster-whisper / ctranslate2 /
onnxruntime / huggingface-hub) — that drops the bundle from ~700MB to
~50MB and removes the model-download step on first launch.

Build:
    cd python-sidecar
    .venv\\Scripts\\python -m PyInstaller --clean --noconfirm build.spec  # Windows
    .venv/bin/python -m PyInstaller --clean --noconfirm build.spec         # Linux

Output:
    python-sidecar/dist/auris_sidecar[.exe]   ← shipped via electron-builder
"""

block_cipher = None

a = Analysis(
    ['auris_sidecar.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    # soundcard uses cffi at runtime; PyInstaller doesn't always pick this
    # up via static analysis.
    hiddenimports=['_cffi_backend'],
    # Local hooks override the broken `_pyinstaller_hooks_contrib` hook
    # for webrtcvad-wheels (the fork we use).
    hookspath=['pyinstaller-hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Local Whisper stack — not used in remote-only builds.
        'faster_whisper',
        'ctranslate2',
        'onnxruntime',
        'tokenizers',
        'av',
        'huggingface_hub',
        'hf_xet',
        # Heavy ML/typer extras pulled in transitively that we don't need.
        'typer',
        'rich',
        'click',
        # Unused stdlib chunks that bloat the bundle.
        'tkinter',
        'unittest',
        'pydoc',
        'doctest',
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
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='auris_sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    # Sidecar runs headless — no console window flashing on launch.
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
