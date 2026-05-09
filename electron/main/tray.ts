import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';

let tray: Tray | null = null;

function loadIcon() {
  // Reuse the main app icon — Windows scales it down for the tray
  // automatically; .ico embeds 16×16 + 32×32 specifically for that.
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
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      // Force a sane tray size on Windows (system tray expects 16×16).
      return img.resize({ width: 16, height: 16 });
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
