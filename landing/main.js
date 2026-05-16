/**
 * Point the download buttons directly at the latest Auris .exe hosted on
 * Cloudflare R2. The repo on GitHub is private, so we can't link to GitHub
 * Releases publicly — R2 gives us free egress and a stable public URL.
 *
 * On a new release: upload the new artifacts to the `auris-releases` R2
 * bucket and bump `LATEST_VERSION` below.
 */
const R2_BASE = 'https://pub-ce581fb3ec254955850622d3e9bd589e.r2.dev';
const LATEST_VERSION = '0.4.0-beta';
const DOWNLOAD_URL = `${R2_BASE}/Auris-Setup-${LATEST_VERSION}.exe`;

for (const btn of document.querySelectorAll('a[href="#download-link"]')) {
  btn.setAttribute('href', DOWNLOAD_URL);
}
