/**
 * Build the Python sidecar into a standalone .exe via PyInstaller.
 *
 * Output: python-sidecar/dist/auris_sidecar.exe
 *
 * Prerequisites (one-time):
 *   cd python-sidecar
 *   .venv\Scripts\pip install -r requirements-build.txt
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sidecarDir = path.join(root, 'python-sidecar');
const venvPython = path.join(sidecarDir, '.venv', 'Scripts', 'python.exe');
const spec = path.join(sidecarDir, 'build.spec');

if (!existsSync(venvPython)) {
  console.error(
    `[build-sidecar] Python venv not found at ${venvPython}.\n` +
      'Run setup first:\n' +
      '  cd python-sidecar\n' +
      '  py -3.11 -m venv .venv\n' +
      '  .venv\\Scripts\\pip install -r requirements.txt -r requirements-build.txt',
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

const outExe = path.join(sidecarDir, 'dist', 'auris_sidecar.exe');
if (!existsSync(outExe)) {
  console.error(`[build-sidecar] expected output missing: ${outExe}`);
  process.exit(1);
}

console.log(`[build-sidecar] ✓ produced ${outExe}`);
