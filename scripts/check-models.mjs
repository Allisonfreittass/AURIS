/**
 * Verify that every Groq model id the app depends on still exists.
 *
 * Groq retires models without notice. When `llama-3.3-70b-versatile` went
 * away, every suggestion, translation and post-call started failing with an
 * error that surfaced in the UI as "nothing happened" — the kind of outage
 * that is invisible until a user reports it. This turns that into one
 * command.
 *
 *   GROQ_API_KEY=gsk_... npm run check:models
 *
 * Falls back to the key in server/.dev.vars so it works with no env set.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function resolveKey() {
  if (process.env.GROQ_API_KEY?.trim()) return process.env.GROQ_API_KEY.trim();
  const devVars = path.join(root, 'server', '.dev.vars');
  if (existsSync(devVars)) {
    for (const line of readFileSync(devVars, 'utf8').split(/\r?\n/)) {
      const m = /^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

/** Parse the ids out of electron/main/models.ts without importing TypeScript. */
function configuredModels() {
  const src = readFileSync(path.join(root, 'electron', 'main', 'models.ts'), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/export const (MODEL_\w+)\s*=\s*'([^']+)'/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

const key = resolveKey();
if (!key) {
  console.error('[check-models] no GROQ_API_KEY in env or server/.dev.vars');
  process.exit(2);
}

const resp = await fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${key}` },
});
if (!resp.ok) {
  console.error(`[check-models] Groq returned ${resp.status}: ${await resp.text()}`);
  process.exit(2);
}
const available = new Set((await resp.json()).data.map((m) => m.id));

let failed = false;
for (const [name, id] of configuredModels()) {
  const ok = available.has(id);
  if (!ok) failed = true;
  console.log(`${ok ? '  ok  ' : ' GONE '} ${name.padEnd(18)} ${id}`);
}

if (failed) {
  console.error(
    '\n[check-models] a configured model no longer exists on this account.\n' +
      'Pick a replacement from:\n  ' +
      [...available].sort().join('\n  '),
  );
  process.exit(1);
}
console.log('\n[check-models] all configured models are available');
