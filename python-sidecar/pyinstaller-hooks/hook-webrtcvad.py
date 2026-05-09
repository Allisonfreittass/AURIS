# Local hook that overrides the broken `_pyinstaller_hooks_contrib` hook.
# The fork we use (webrtcvad-wheels) ships as a regular C-extension wheel,
# so PyInstaller's automatic discovery handles it correctly — we only need
# to ensure the native .pyd is collected.
from PyInstaller.utils.hooks import collect_dynamic_libs

binaries = collect_dynamic_libs('webrtcvad')
