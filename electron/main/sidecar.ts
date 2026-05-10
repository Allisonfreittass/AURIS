import { app } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { TranscriptEvent, AudioErrorEvent } from '../../shared/ipc';

interface SidecarEvents {
  onReady?: () => void;
  onTranscript: (e: TranscriptEvent) => void;
  onError: (e: AudioErrorEvent) => void;
  onStopped: () => void;
}

const RESTART_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

export type AudioSource = 'loopback' | 'mic' | 'both';

export interface SidecarLaunchConfig {
  source: AudioSource;
  /** When set, sidecar uses Groq hosted Whisper via the proxy instead of local. */
  proxyUrl?: string | null;
  /** Initial auth token for the proxy. May be rotated later via setToken(). */
  authToken?: string | null;
}

function resolveSidecarLaunch(config: SidecarLaunchConfig): { cmd: string; args: string[] } {
  const args: string[] = ['--source', config.source];
  if (config.proxyUrl && config.authToken) {
    args.push('--proxy-url', config.proxyUrl, '--auth-token', config.authToken);
  }

  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, 'auris_sidecar.exe');
    if (!existsSync(exe)) {
      throw new Error(`Sidecar binary not found at ${exe}`);
    }
    return { cmd: exe, args };
  }

  const root = path.resolve(__dirname, '..', '..');
  const pythonExe = path.join(root, 'python-sidecar', '.venv', 'Scripts', 'python.exe');
  const script = path.join(root, 'python-sidecar', 'auris_sidecar.py');
  if (!existsSync(pythonExe)) {
    throw new Error(
      `Python venv not found at ${pythonExe}. ` +
        'Run setup: cd python-sidecar && py -3.11 -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt',
    );
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
          ts: Number(msg.ts ?? Date.now() / 1000),
          // Whisper auto-detect emits an ISO 639-1 code here. Without
          // forwarding it, main process can't decide whether to translate.
          lang: typeof msg.lang === 'string' ? msg.lang : undefined,
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
