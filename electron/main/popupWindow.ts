import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { PopupShape } from '../../shared/ipc';

const TOP_MARGIN = 16;

/**
 * Window size for each popup state. The renderer reports its desired shape
 * via `auris:setPopupShape` and we resize+reposition. Width grows with
 * content; idle is a 72×72 floating icon, no card chrome.
 */
const SHAPE_SIZES: Record<PopupShape, { width: number; height: number }> = {
  // Idle window has to be big enough for the sound-wave animation (which
  // expands the button up to 2.4× its size, ~115px from a 48px button) plus
  // shadow padding. The window is fully transparent — the user only sees
  // the icon and ripples; the empty space around them isn't visible.
  idle:     { width: 160, height: 160 },
  compact:  { width: 520, height: 96  },  // status header + 1-line transcript
  expanded: { width: 540, height: 220 },  // header + question banner + response
};

/**
 * Compact popup that floats at top-center of the primary display. The
 * `setPopupShape` helper resizes it on demand so the visual matches what's
 * happening: a tiny floating icon when idle, a card when there's content.
 *
 * Window flags:
 *  - frame:false + transparent:true → custom rounded shape via CSS
 *  - skipTaskbar:true → no taskbar entry
 *  - focusable:false → never steals keyboard from underlying app
 *  - alwaysOnTop "pop-up-menu" → above normal windows but below OS chrome
 */
export function createPopupWindow(): BrowserWindow {
  const initial = SHAPE_SIZES.idle;
  const display = screen.getPrimaryDisplay();
  const x = Math.floor((display.workArea.width - initial.width) / 2);
  const y = display.workArea.y + TOP_MARGIN;

  const win = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    // Was `focusable: false` for "never steal focus" — but Windows treats
    // those windows as WS_EX_NOACTIVATE, which silently swallows mouse
    // wheel events that should be scrolling our transcript pane. Better
    // tradeoff: focusable=true, but always show via `showInactive()` so
    // we don't yank focus from the user's underlying app on appear.
    focusable: true,
    title: 'Auris',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.setAlwaysOnTop(true, 'pop-up-menu');

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#popup`);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'popup',
    });
  }

  return win;
}

/** Resize and re-center the popup based on the current state. */
export function setPopupShape(win: BrowserWindow, shape: PopupShape): void {
  if (!win || win.isDestroyed()) return;
  const size = SHAPE_SIZES[shape];
  const display = screen.getPrimaryDisplay();
  const x = Math.floor((display.workArea.width - size.width) / 2);
  const y = display.workArea.y + TOP_MARGIN;
  // `animate=true` smooths the transition on Windows.
  win.setBounds({ x, y, width: size.width, height: size.height }, true);
}
