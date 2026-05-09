/**
 * Resolve the latest Auris release URL from GitHub and point the download
 * buttons at it. Falls back to the GitHub Releases page when the API rate
 * limits or no release exists yet.
 *
 * Edit GITHUB_REPO once you have a public repo; until then the buttons
 * link to the placeholder.
 */
const GITHUB_REPO = ''; // e.g. "yourname/auris" — leave empty for placeholder

const buttons = document.querySelectorAll('a[href="#download-link"]');

async function resolveLatestUrl() {
  if (!GITHUB_REPO) return null;
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const asset = (data.assets || []).find((a) =>
      /Auris-Setup.*\.exe$/i.test(a.name),
    );
    return asset?.browser_download_url ?? data.html_url ?? null;
  } catch {
    return null;
  }
}

(async () => {
  const url = await resolveLatestUrl();
  const fallback = GITHUB_REPO
    ? `https://github.com/${GITHUB_REPO}/releases`
    : '#';

  for (const btn of buttons) {
    btn.setAttribute('href', url || fallback);
    if (!url && !GITHUB_REPO) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        alert(
          'Em breve: o link de download será populado depois que a primeira release for publicada no GitHub.',
        );
      });
    }
  }
})();
