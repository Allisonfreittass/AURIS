import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { PostCallReport, SessionSummary, StoredSession } from '../../shared/ipc';

const MAX_SUMMARIES = 100;
const PREVIEW_MAX_CHARS = 120;

/** History directory under userData. Separate from
 *  `Documents/Auris/sessions/` (where manual exports go) so the automatic
 *  history doesn't pollute a folder the user might browse. */
function historyDir(): string {
  const dir = path.join(app.getPath('userData'), 'sessions');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** A session id is also its filename stem. We validate aggressively to
 *  refuse path-traversal attempts via IPC (`../something`). UUIDs and
 *  hex/Base32-ish ids are accepted; anything else is rejected. */
function isSafeId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(id);
}

function sessionPath(id: string): string {
  return path.join(historyDir(), `${id}.json`);
}

function derivePreview(session: StoredSession): string {
  for (const m of session.messages) {
    if ((m.role === 'user' || m.role === 'detected') && m.text.trim()) {
      return truncate(m.text.trim(), PREVIEW_MAX_CHARS);
    }
  }
  const firstTranscript = session.transcripts.find((t) => t.text.trim());
  if (firstTranscript) return truncate(firstTranscript.text.trim(), PREVIEW_MAX_CHARS);
  return '';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function saveSession(session: StoredSession): void {
  if (!isSafeId(session.id)) {
    console.warn('[history] refusing to save session with invalid id:', session.id);
    return;
  }
  // Empty sessions never hit disk — avoids a junk file when the renderer
  // schedules a save before anything actually happened.
  if (session.messages.length === 0 && session.transcripts.length === 0) return;
  try {
    // The renderer owns messages/transcripts but knows nothing about the
    // post-call report, so it sends the session back without one. Writing
    // that verbatim would erase a report on the next autosave tick — carry
    // any existing one forward.
    const existing = getSession(session.id);
    const merged: StoredSession =
      existing?.report && !session.report
        ? { ...session, report: existing.report }
        : session;
    fs.writeFileSync(sessionPath(session.id), JSON.stringify(merged), { mode: 0o600 });
  } catch (err) {
    console.warn('[history] failed to write session:', (err as Error).message);
  }
}

export function getSession(id: string): StoredSession | null {
  if (!isSafeId(id)) return null;
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredSession;
  } catch (err) {
    console.warn(`[history] failed to read session ${id}:`, (err as Error).message);
    return null;
  }
}

/** Attach a generated post-call report to a stored session. Read-modify-write
 *  so the report survives alongside whatever the renderer last saved; the
 *  renderer never sends the report back up, so a plain upsert from its side
 *  would drop it. */
export function saveReport(id: string, report: PostCallReport): boolean {
  const session = getSession(id);
  if (!session) return false;
  session.report = report;
  try {
    fs.writeFileSync(sessionPath(id), JSON.stringify(session), { mode: 0o600 });
    return true;
  } catch (err) {
    console.warn(`[history] failed to write report for ${id}:`, (err as Error).message);
    return false;
  }
}

export function deleteSession(id: string): void {
  if (!isSafeId(id)) return;
  const p = sessionPath(id);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch (err) {
      console.warn(`[history] failed to delete session ${id}:`, (err as Error).message);
    }
  }
}

/** List session summaries sorted newest-first. Reads each file (small) so
 *  we can derive preview + counts; capped at MAX_SUMMARIES. Bad files are
 *  skipped silently so one corrupt entry doesn't break the whole list. */
export function listSessions(): SessionSummary[] {
  const dir = historyDir();
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    console.warn('[history] failed to list sessions:', (err as Error).message);
    return [];
  }

  const summaries: SessionSummary[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
      const s = JSON.parse(raw) as StoredSession;
      if (!s || !s.id) continue;
      summaries.push({
        id: s.id,
        startedAt: s.startedAt,
        updatedAt: s.updatedAt ?? s.startedAt,
        messageCount: s.messages?.length ?? 0,
        transcriptCount: s.transcripts?.length ?? 0,
        preview: derivePreview(s),
        hasReport: Boolean(s.report),
      });
    } catch {
      // skip unreadable / corrupt files
    }
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries.slice(0, MAX_SUMMARIES);
}
