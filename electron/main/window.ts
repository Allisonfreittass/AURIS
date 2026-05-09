import { app, BrowserWindow, nativeImage, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Slimmer + taller for a conversation flow — fits next to a video/browser
// without dominating the screen.
const WINDOW_WIDTH = 460;
const WINDOW_HEIGHT = 680;

/**
 * Resolve the right icon file for the current process state. In packaged
 * builds the ICO sits next to other extra resources; in dev it lives at
 * the repo root under `resources/`.
 */
function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(process.resourcesPath, 'icon.png'),
      ]
    : [
        path.resolve(__dirname, '..', '..', 'resources', 'icon.ico'),
        path.resolve(__dirname, '..', '..', 'resources', 'icon.png'),
      ];
  for (const p of candidates) {
    if (existsSync(p)) return nativeImage.createFromPath(p);
  }
  return undefined;
}

export function createOverlayWindow(): BrowserWindow {
  const icon = resolveAppIcon();

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 480,
    show: false,
    frame: false,
    // Solid window — the rounded panel is drawn inside via CSS. Avoids
    // Windows quirks where transparent + always-on-top windows are invisible
    // until the renderer paints, leaving the user staring at an empty taskbar
    // icon that does nothing on click.
    transparent: false,
    backgroundColor: '#080b10',
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Auris',
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Stay above normal windows but not above OS chrome (start menu / fullscreen
  // exclusive content). Default level keeps Windows' taskbar click semantics
  // working correctly.
  win.setAlwaysOnTop(true);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Show focused on first launch so the user sees the window come up. After
  // that, programmatic re-shows (from tray click) use showInactive() to avoid
  // stealing focus from whatever app the user was in.
  win.once('ready-to-show', () => win.show());

  // Close button → hide instead of quit (we live in the tray). Quitting only
  // happens via tray "Sair" or app.quit().
  win.on('close', (event) => {
    if (!(globalThis as { __aurisQuitting?: boolean }).__aurisQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    // DevTools available on demand via F12 / Ctrl+Shift+I in dev.
    // Uncomment to auto-open while debugging renderer crashes:
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
