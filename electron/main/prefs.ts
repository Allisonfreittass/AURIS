import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const PREFS_FILE = 'prefs.json';

export interface Prefs {
  /** Saved CENTER point of the popup window. We store the center (not the
   *  top-left) so the position survives shape changes — different popup
   *  shapes have different sizes, and anchoring to the center keeps the
   *  visual position stable. */
  popupCenter?: { x: number; y: number };
  /** When true, both windows have content protection enabled — they
   *  appear blank in screen captures (OBS, Zoom share, screenshots).
   *  Wired to `BrowserWindow.setContentProtection`, which on Windows
   *  calls `SetWindowDisplayAffinity(WDA_MONITOR)`. */
  incognito?: boolean;
  /** True after the user has finished or skipped the onboarding tour.
   *  Suppresses the modal on subsequent launches. */
  onboardingDone?: boolean;
}

function prefsPath(): string {
  return path.join(app.getPath('userData'), PREFS_FILE);
}

function readAll(): Prefs {
  try {
    if (!fs.existsSync(prefsPath())) return {};
    const raw = fs.readFileSync(prefsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Prefs) : {};
  } catch (err) {
    console.warn('[prefs] failed to read prefs.json:', (err as Error).message);
    return {};
  }
}

function writeAll(prefs: Prefs): void {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn('[prefs] failed to write prefs.json:', (err as Error).message);
  }
}

export function getPopupCenter(): { x: number; y: number } | null {
  const c = readAll().popupCenter;
  if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') return null;
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
  return { x: c.x, y: c.y };
}

export function setPopupCenter(center: { x: number; y: number }): void {
  const prefs = readAll();
  prefs.popupCenter = { x: Math.round(center.x), y: Math.round(center.y) };
  writeAll(prefs);
}

export function getIncognito(): boolean {
  return readAll().incognito === true;
}

export function setIncognito(on: boolean): void {
  const prefs = readAll();
  prefs.incognito = on;
  writeAll(prefs);
}

export function getOnboardingDone(): boolean {
  return readAll().onboardingDone === true;
}

export function setOnboardingDone(done: boolean): void {
  const prefs = readAll();
  prefs.onboardingDone = done;
  writeAll(prefs);
}
