/**
 * Auto-update via `electron-updater` + GitHub Releases.
 *
 * Wired only in packaged builds — `npm run dev` skips this entirely so we
 * don't accidentally fetch updates while developing. The `publish` block
 * in package.json (provider: github) tells electron-builder to write a
 * `latest.yml` next to the .exe; electron-updater reads that yml from the
 * latest release on github.com/Allisonfreittass/AURIS to know what to do.
 *
 * Update flow:
 *   1. App starts → `checkForUpdatesAndNotify()` polls latest.yml.
 *   2. If a newer version exists, electron-updater downloads the new .exe
 *      to a temp dir in the background.
 *   3. When download finishes we surface a system dialog asking the user
 *      whether to restart now or later. "Later" applies the update on the
 *      next quit (NSIS does the swap automatically).
 *
 * Caveats:
 *   - Without code signing, Windows shows a UAC prompt on each install.
 *     OK for beta; the day we buy a cert this becomes silent.
 *   - electron-updater needs `latest.yml` AND the .exe in the SAME release.
 *     `electron-builder` produces both when `publish: github` is set;
 *     just upload both files to the GitHub release.
 *   - `allowPrerelease: true` because we mark betas as pre-release on GitHub.
 */
import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    console.log('[updater] dev mode — auto-update disabled');
    return;
  }

  // Default electron-updater logger uses `electron-log` if installed; we
  // route to console to keep startup deps minimal.
  autoUpdater.logger = {
    info: (msg) => console.log(`[updater] ${msg}`),
    warn: (msg) => console.warn(`[updater] ${msg}`),
    error: (msg) => console.error(`[updater] ${msg}`),
    debug: () => {},
  };

  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = true;
  // Only auto-install on quit if the user said "later" — restart-now goes
  // through `quitAndInstall` directly.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for update…');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[updater] update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] already on latest');
  });

  autoUpdater.on('download-progress', (p) => {
    console.log(
      `[updater] download progress: ${Math.round(p.percent)}% ` +
        `(${Math.round(p.bytesPerSecond / 1024)} KB/s)`,
    );
  });

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    console.log(`[updater] update downloaded: ${info.version}`);
    const win = getMainWindow();
    const result = await dialog.showMessageBox(win ?? undefined!, {
      type: 'info',
      title: 'Atualização do Auris pronta',
      message: `Auris ${info.version} foi baixado.`,
      detail:
        'Reinicie o app pra aplicar a atualização. ' +
        'Se preferir, ela é aplicada automaticamente na próxima vez que você fechar.',
      buttons: ['Reiniciar agora', 'Mais tarde'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      (globalThis as { __aurisQuitting?: boolean }).__aurisQuitting = true;
      // `isSilent=true` skips the post-install launcher animation; we
      // restart the new build immediately.
      autoUpdater.quitAndInstall(true, true);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message ?? err);
  });

  // Initial check shortly after launch (give the renderer time to settle).
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] initial check failed:', err.message ?? err);
    });
  }, 5_000);

  // Recheck every 4h while the app stays open.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] periodic check failed:', err.message ?? err);
    });
  }, FOUR_HOURS_MS);
}
