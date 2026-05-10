/**
 * Resolve the latest Auris release URL from GitHub and point the download
 * buttons at it. Falls back to the GitHub Releases page when the API rate
 * limits or no release exists yet.
 */
const GITHUB_REPO = 'Allisonfreittass/AURIS';

const buttons = document.querySelectorAll('a[href="#download-link"]');

/**
 * Fetch the most recent release (including pre-releases). The official
 * `/releases/latest` endpoint excludes pre-releases, so we use the listing
 * endpoint instead and take the first item — GitHub returns them in
 * created_at desc order by default.
 */
async function resolveLatestUrl() {
  if (!GITHUB_REPO) return null;
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!resp.ok) return null;
    const releases = await resp.json();
    if (!Array.isArray(releases) || releases.length === 0) return null;

    // Prefer the first release with a Windows installer asset.
    for (const r of releases) {
      const asset = (r.assets || []).find((a) =>
        /Auris-Setup.*\.exe$/i.test(a.name),
      );
      if (asset) return asset.browser_download_url;
    }

    // No matching asset — link to the release page itself.
    return releases[0].html_url ?? null;
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
