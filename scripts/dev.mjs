// Wrapper around `electron-vite dev` that strips ELECTRON_RUN_AS_NODE before
// spawning. When inherited from a parent process (e.g., a CI agent or Claude
// Code itself) this var causes Electron to launch as plain Node, which makes
// `require('electron')` return a path string and crashes the main bundle.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');

const child = spawn(process.execPath, [cli, 'dev'], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
