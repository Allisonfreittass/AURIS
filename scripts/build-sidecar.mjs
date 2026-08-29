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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sidecarDir = path.join(root, 'python-sidecar');
const isWindows = process.platform === 'win32';

/**
 * PyInstaller's scratch directory, deliberately outside the repo.
 *
 * `--clean` starts by rmtree-ing this directory. When the checkout lives in a
 * synced folder (OneDrive, Dropbox), the sync client holds handles on
 * directories it is indexing, and the removal fails with EPERM on a directory
 * that is already empty — intermittently, so a build that worked yesterday
 * fails today. Keeping the scratch out of the synced tree removes the race.
 *
 * Only the work path moves: `dist/` stays next to the sidecar because
 * electron-builder's extraResources reads it from there.
 */
const workPath = path.join(os.tmpdir(), 'auris-pyinstaller-build');
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
  ['-m', 'PyInstaller', '--clean', '--noconfirm', '--workpath', workPath, 'build.spec'],
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
