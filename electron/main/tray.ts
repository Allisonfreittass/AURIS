import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';

let tray: Tray | null = null;

function loadIcon() {
  // Reuse the main app icon. nativeImage only decodes ICO on Windows, so
  // off-Windows the PNG has to come first or we get an empty image.
  const isWindows = process.platform === 'win32';
  const names = isWindows ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  const dir = app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '..', '..', 'resources');
  // Windows' notification area expects 16×16; Linux panels (GNOME/KDE) render
  // status icons at 22×22 and a 16px source looks blurry there.
  const size = isWindows ? 16 : 22;
  for (const name of names) {
    const file = path.join(dir, name);
    if (existsSync(file)) {
      return nativeImage.createFromPath(file).resize({ width: size, height: size });
    }
  }
  return nativeImage.createEmpty();
}

interface Hooks {
  show: () => void;
  toggleRun: () => void;
  quit: () => void;
  isRunning: () => boolean;
}

export function createTray(hooks: Hooks) {
  if (tray) return tray;
  tray = new Tray(loadIcon());
  tray.setToolTip('Auris');

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Mostrar Auris', click: () => hooks.show() },
      {
        label: hooks.isRunning() ? 'Pausar' : 'Iniciar',
        click: () => {
          hooks.toggleRun();
          rebuildMenu();
        },
      },
      { type: 'separator' },
      { label: 'Sair', click: () => hooks.quit() },
    ]);
    if (tray) tray.setContextMenu(menu);
  };
  rebuildMenu();

  tray.on('click', () => hooks.show());

  app.on('before-quit', () => {
    tray?.destroy();
    tray = null;
  });

  return tray;
}
