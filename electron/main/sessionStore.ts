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
import { app, BrowserWindow, dialog, shell } from 'electron';
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

/** Show a save dialog and write a PNG buffer to the chosen path. Used by
 *  the share-image flow — unlike the session export which is friction-less,
 *  share PNGs ARE user-facing artifacts so a dialog makes sense. Returns
 *  the saved path or null on cancel/failure. */
export async function saveSharePng(
  bytes: Uint8Array,
  defaultName: string,
): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const options: Electron.SaveDialogOptions = {
    title: 'Salvar imagem',
    defaultPath: defaultName,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  };
  try {
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, bytes);
    return result.filePath;
  } catch (err) {
    console.error('[sessionStore] saveSharePng failed:', err);
    return null;
  }
}
