/**
 * Build the Python sidecar into a standalone binary via PyInstaller.
 *
 * PyInstaller only cross-compiles to the host OS, so this must run once per
 * target platform: on Windows for the .exe, on Linux for the ELF binary.
 *
 * Output: python-sidecar/dist/auris_sidecar[.exe]
 *
 * Prerequisites (one-time):
 *   cd python-sidecar
 *   .venv\Scripts\pip install -r requirements-build.txt   # Windows
 *   .venv/bin/pip install -r requirements-build.txt        # Linux
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sidecarDir = path.join(root, 'python-sidecar');
const isWindows = process.platform === 'win32';
const venvPython = isWindows
  ? path.join(sidecarDir, '.venv', 'Scripts', 'python.exe')
  : path.join(sidecarDir, '.venv', 'bin', 'python');
const outName = isWindows ? 'auris_sidecar.exe' : 'auris_sidecar';
const spec = path.join(sidecarDir, 'build.spec');

if (!existsSync(venvPython)) {
  console.error(
    `[build-sidecar] Python venv not found at ${venvPython}.\n` +
      'Run setup first:\n' +
      '  cd python-sidecar\n' +
      (isWindows
        ? '  py -3.11 -m venv .venv\n' +
          '  .venv\\Scripts\\pip install -r requirements.txt -r requirements-build.txt'
        : '  python3 -m venv .venv\n' +
          '  .venv/bin/pip install -r requirements.txt -r requirements-build.txt'),
  );
  process.exit(1);
}

if (!existsSync(spec)) {
  console.error(`[build-sidecar] PyInstaller spec missing at ${spec}`);
  process.exit(1);
}

console.log('[build-sidecar] running PyInstaller...');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(
  venvPython,
  ['-m', 'PyInstaller', '--clean', '--noconfirm', 'build.spec'],
  { cwd: sidecarDir, stdio: 'inherit', env },
);

if (result.status !== 0) {
  console.error(`[build-sidecar] PyInstaller failed (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

const outExe = path.join(sidecarDir, 'dist', outName);
if (!existsSync(outExe)) {
  console.error(`[build-sidecar] expected output missing: ${outExe}`);
  process.exit(1);
}

console.log(`[build-sidecar] ✓ produced ${outExe}`);
