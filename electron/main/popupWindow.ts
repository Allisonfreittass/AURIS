import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 140;
const TOP_MARGIN = 16;

/**
 * Compact popup that floats at top-center of the primary display.
 * Used as the "minimized state" UI — visible while the main window is
 * minimized so the user can keep tabs on transcription/response without
 * having a full overlay covering their work.
 *
 * Key window flags:
 *  - frame:false + transparent:true → rounded card via CSS
 *  - skipTaskbar:true → popup itself never appears in taskbar
 *  - focusable:false → clicking it doesn't yank keyboard focus from
 *    whatever the user is actually working in
 *  - alwaysOnTop level 'pop-up-menu' → above normal windows but below OS chrome
 */
export function createPopupWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workArea;
  const x = Math.floor((screenWidth - POPUP_WIDTH) / 2);
  const y = display.workArea.y + TOP_MARGIN;

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
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
    focusable: false,
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
