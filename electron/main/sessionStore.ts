/**
 * Save conversation transcripts as Markdown files under
 *   <user>/Documents/Auris/sessions/YYYY-MM-DD_HH-mm.md
 *
 * The renderer renders the conversation into Markdown (it owns the message
 * state), then hands the string to us via IPC so we can write it to disk
 * with safe paths and reveal it in Explorer / Finder afterward.
 *
 * We don't pop a save dialog — beta users want zero friction. They can
 * delete the folder later if they don't want the archive.
 */
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function ensureSessionsDir(): string {
  const dir = path.join(app.getPath('documents'), 'Auris', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampedFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}-${pad(now.getMinutes())}.md`
  );
}

/** Write `content` to a fresh timestamped .md file and reveal it. */
export function saveSessionMarkdown(content: string): string | null {
  if (!content.trim()) return null;
  try {
    const dir = ensureSessionsDir();
    const file = path.join(dir, timestampedFilename());
    fs.writeFileSync(file, content, 'utf8');
    // Reveal so the user knows where it landed. On Windows this opens
    // Explorer with the file selected.
    shell.showItemInFolder(file);
    return file;
  } catch (err) {
    console.error('[sessionStore] save failed:', err);
    return null;
  }
}
