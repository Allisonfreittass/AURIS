import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { PopupShape } from '../../shared/ipc';
import { getPopupCenter, setPopupCenter } from './prefs';

const TOP_MARGIN = 16;
const SAVE_DEBOUNCE_MS = 500;

/**
 * Window size for each popup state. The renderer reports its desired shape
 * via `auris:setPopupShape` and we resize+reposition. Width grows with
 * content; idle is a 72×72 floating icon, no card chrome.
 */
const SHAPE_SIZES: Record<PopupShape, { width: number; height: number }> = {
  // Idle window holds the rounded "pill" with the Auris symbol + a play
  // button. The pill itself is ~74×40 and the sound-wave ripple animation
  // scales it up to 2.4×, so we need ~180×100 of transparent margin.
  idle:     { width: 200, height: 100 },
  // Compact: live transcript stream. Sized to fit ~10 lines of cumulative
  // history comfortably (the renderer caps at 50 entries; older content is
  // still scrollable inside the card).
  compact:  { width: 520, height: 280 },
  // Expanded: question banner + Auris response. Tall enough for medium
  // answers without forcing a scroll on every reply.
  expanded: { width: 540, height: 320 },
};

/** Top-center of the primary display, used as a fallback when there's no
 *  saved position or the saved position is on a display that no longer
 *  exists (e.g. user unplugged the second monitor). */
function defaultCenter(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const idle = SHAPE_SIZES.idle;
  return {
    x: display.workArea.x + Math.floor(display.workArea.width / 2),
    y: display.workArea.y + TOP_MARGIN + Math.floor(idle.height / 2),
  };
}

/** True when `center` falls inside any connected display's work area. */
function isCenterVisible(center: { x: number; y: number }): boolean {
  const wa = screen.getDisplayNearestPoint(center).workArea;
  return (
    center.x >= wa.x &&
    center.x <= wa.x + wa.width &&
    center.y >= wa.y &&
    center.y <= wa.y + wa.height
  );
}

/** Convert a CENTER + size into a top-left position, clamped so the window
 *  stays fully on the nearest display. Prevents shape changes from pushing
 *  the popup off-screen when the user dragged it to an edge. */
function topLeftForCenter(
  center: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const wa = screen.getDisplayNearestPoint(center).workArea;
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - width, center.x - Math.floor(width / 2)));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - height, center.y - Math.floor(height / 2)));
  return { x, y };
}

function currentCenter(win: BrowserWindow): { x: number; y: number } {
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  return { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) };
}

/**
 * Compact popup that floats at top-center of the primary display by
 * default; the user's last drag position is restored across sessions.
 *
 * Window flags:
 *  - frame:false + transparent:true → custom rounded shape via CSS
 *  - skipTaskbar:true → no taskbar entry
 *  - alwaysOnTop "pop-up-menu" → above normal windows but below OS chrome
 */
export function createPopupWindow(): BrowserWindow {
  const initial = SHAPE_SIZES.idle;
  const savedCenter = getPopupCenter();
  const center = savedCenter && isCenterVisible(savedCenter) ? savedCenter : defaultCenter();
  const start = topLeftForCenter(center, initial.width, initial.height);

  const win = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: start.x,
    y: start.y,
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

  // Persist drag position. The 'move' event fires for every pixel on
  // Windows, so we debounce to avoid hammering disk during a drag. Saved
  // value is the CENTER, not top-left, so the position survives shape
  // changes (different shapes have different widths).
  let saveTimer: NodeJS.Timeout | null = null;
  win.on('move', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (win.isDestroyed()) return;
      setPopupCenter(currentCenter(win));
    }, SAVE_DEBOUNCE_MS);
  });
  win.on('closed', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#popup`);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'popup',
    });
  }

  return win;
}

/** Resize the popup, keeping its CENTER anchored where it currently is so
 *  the user's drag position survives shape changes. Clamps to the display
 *  workarea if the new size would push it off-screen. */
export function setPopupShape(win: BrowserWindow, shape: PopupShape): void {
  if (!win || win.isDestroyed()) return;
  const size = SHAPE_SIZES[shape];
  const tl = topLeftForCenter(currentCenter(win), size.width, size.height);
  // `animate=true` smooths the transition on Windows.
  win.setBounds({ x: tl.x, y: tl.y, width: size.width, height: size.height }, true);
}
