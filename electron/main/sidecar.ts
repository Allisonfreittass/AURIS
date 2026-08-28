import { app } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { TranscriptEvent, TranscriptChannel, AudioErrorEvent } from '../../shared/ipc';
import { normalizeLangCode } from '../../shared/lang';
import { toMillis } from '../../shared/time';

interface SidecarEvents {
  onReady?: () => void;
  onTranscript: (e: TranscriptEvent) => void;
  onError: (e: AudioErrorEvent) => void;
  onStopped: () => void;
}

const RESTART_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

export type AudioSource = 'loopback' | 'mic' | 'both' | 'dual';

/**
 * Map the sidecar's raw stream name onto a speaker.
 *
 * The sidecar stays deliberately neutral — it knows `mic` and `loopback`,
 * not roles. The assumption that turns one into the other lives here: the
 * person running Auris is the seller, so their microphone is the seller and
 * their speaker output is the client. Legacy `mixed` carries no attribution.
 */
function toChannel(raw: unknown): TranscriptChannel | undefined {
  if (raw === 'mic') return 'vendedor';
  if (raw === 'loopback') return 'cliente';
  if (raw === 'mixed') return 'mixed';
  return undefined;
}

export interface SidecarLaunchConfig {
  source: AudioSource;
  /** When set, sidecar uses Groq hosted Whisper via the proxy instead of local. */
  proxyUrl?: string | null;
  /** Initial auth token for the proxy. May be rotated later via setToken(). */
  authToken?: string | null;
}

const IS_WINDOWS = process.platform === 'win32';

// PyInstaller keeps the spec's `name` and appends `.exe` only on Windows.
const SIDECAR_BIN = IS_WINDOWS ? 'auris_sidecar.exe' : 'auris_sidecar';

// venv layout differs: `Scripts/python.exe` on Windows, `bin/python` elsewhere.
const VENV_PYTHON = IS_WINDOWS
  ? ['.venv', 'Scripts', 'python.exe']
  : ['.venv', 'bin', 'python'];

const VENV_SETUP_HINT = IS_WINDOWS
  ? 'Run setup: cd python-sidecar && py -3.11 -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt'
  : 'Run setup: cd python-sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt';

function resolveSidecarLaunch(config: SidecarLaunchConfig): { cmd: string; args: string[] } {
  const args: string[] = ['--source', config.source];
  if (config.proxyUrl && config.authToken) {
    args.push('--proxy-url', config.proxyUrl, '--auth-token', config.authToken);
  }

  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, SIDECAR_BIN);
    if (!existsSync(exe)) {
      throw new Error(`Sidecar binary not found at ${exe}`);
    }
    return { cmd: exe, args };
  }

  const root = path.resolve(__dirname, '..', '..');
  const pythonExe = path.join(root, 'python-sidecar', ...VENV_PYTHON);
  const script = path.join(root, 'python-sidecar', 'auris_sidecar.py');
  if (!existsSync(pythonExe)) {
    throw new Error(`Python venv not found at ${pythonExe}. ${VENV_SETUP_HINT}`);
  }
  return { cmd: pythonExe, args: [script, ...args] };
}

export class SidecarSupervisor {
  private child: ChildProcess | null = null;
  private buffer = '';
  private restartIndex = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private wantRunning = false;
  private launchConfig: SidecarLaunchConfig = { source: 'loopback' };

  constructor(private events: SidecarEvents) {}

  start(config: SidecarLaunchConfig): void {
    this.launchConfig = config;
    this.wantRunning = true;
    this.spawn();
  }

  stop(): void {
    this.wantRunning = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }

  /**
   * Push a fresh auth token to the running sidecar via stdin without
   * restarting it. Called by main when Supabase rotates the access token
   * (every ~50 minutes). No-op if the sidecar is not running or not in
   * remote-Whisper mode.
   */
  setToken(token: string): void {
    this.launchConfig = { ...this.launchConfig, authToken: token };
    if (!this.child || this.child.killed) return;
    if (!this.child.stdin || this.child.stdin.destroyed) return;
    try {
      this.child.stdin.write(JSON.stringify({ type: 'set_token', token }) + '\n');
    } catch (err) {
      console.warn('failed to push token to sidecar stdin', err);
    }
  }

  private spawn(): void {
    let launch: { cmd: string; args: string[] };
    try {
      launch = resolveSidecarLaunch(this.launchConfig);
    } catch (err) {
      this.events.onError({ code: 'sidecar_missing', message: (err as Error).message });
      return;
    }

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    this.child = spawn(launch.cmd, launch.args, {
      shell: false,
      // stdin needs to be a pipe so we can push token rotations.
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });

    this.buffer = '';
    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk));
    this.child.stderr?.setEncoding('utf8');
    this.child.stderr?.on('data', (chunk: string) => {
      process.stderr.write(`[sidecar stderr] ${chunk}`);
    });

    this.child.on('exit', (code, signal) => {
      console.log(`sidecar exited code=${code} signal=${signal}`);
      this.events.onStopped();
      if (this.wantRunning) {
        const wait = RESTART_BACKOFF_MS[Math.min(this.restartIndex, RESTART_BACKOFF_MS.length - 1)];
        this.restartIndex++;
        console.log(`scheduling sidecar restart in ${wait}ms`);
        this.restartTimer = setTimeout(() => this.spawn(), wait);
      }
    });

    this.child.on('error', (err) => {
      console.error('sidecar spawn error', err);
      this.events.onError({ code: 'sidecar_spawn_error', message: err.message });
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        this.dispatch(obj);
      } catch {
        console.warn('sidecar non-JSON line:', line);
      }
    }
  }

  private dispatch(msg: { type: string; [k: string]: unknown }): void {
    switch (msg.type) {
      case 'ready':
        this.restartIndex = 0;
        this.events.onReady?.();
        break;
      case 'transcript':
        this.events.onTranscript({
          text: String(msg.text ?? ''),
          final: Boolean(msg.final),
          // Two unit conversions happen here, and this is the only place
          // they should: the sidecar protocol becomes app types at this
          // boundary, so nothing downstream — storage included — has to
          // remember to do it.
          ts: toMillis(msg.ts),
          // Whisper's language field is not a stable format: faster-whisper
          // gives ISO codes, Groq gives full names ("portuguese"). Storing
          // the raw value meant every consumer had to normalize, and the one
          // that forgot compared "Portuguese" against "pt".
          lang: typeof msg.lang === 'string'
            ? normalizeLangCode(msg.lang) || undefined
            : undefined,
          channel: toChannel(msg.channel),
        });
        break;
      case 'error':
        this.events.onError({
          code: String(msg.code ?? 'unknown'),
          message: String(msg.message ?? 'Erro desconhecido no sidecar.'),
        });
        break;
      case 'stopped':
        break;
      default:
        console.log('sidecar event:', msg);
    }
  }
}
