import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Read `.env.production` at build time (if present) and surface its values
 * as compile-time constants in the bundle. This is how a packaged build
 * learns its production proxy URL + Supabase config.
 *
 * The file is gitignored — every developer/CI sets their own. Defaults to
 * empty strings if missing; the runtime falls back to dev .env in that case.
 */
function loadProdEnv(): Record<string, string> {
  const out: Record<string, string> = {
    AURIS_PROD_PROXY_URL: '',
    AURIS_PROD_SUPABASE_URL: '',
    AURIS_PROD_SUPABASE_ANON_KEY: '',
  };
  const envFile = resolve(__dirname, '.env.production');
  if (!existsSync(envFile)) return out;
  const raw = readFileSync(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (key in out) {
      out[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

const prodEnv = loadProdEnv();

const defineGlobals = {
  __AURIS_PROD_PROXY_URL__: JSON.stringify(prodEnv.AURIS_PROD_PROXY_URL),
  __AURIS_PROD_SUPABASE_URL__: JSON.stringify(prodEnv.AURIS_PROD_SUPABASE_URL),
  __AURIS_PROD_SUPABASE_ANON_KEY__: JSON.stringify(prodEnv.AURIS_PROD_SUPABASE_ANON_KEY),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: defineGlobals,
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
      },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    plugins: [react()],
    define: defineGlobals,
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
      outDir: 'out/renderer',
    },
  },
});
