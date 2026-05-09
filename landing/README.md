# auris-landing

Static landing page for Auris. Deploys to Cloudflare Pages.

## Local preview

Open `index.html` directly in a browser, or:

```pwsh
npx wrangler pages dev .
```

## Deploy

One-time:

```pwsh
cd landing
npx wrangler pages project create auris-landing
```

Subsequent:

```pwsh
npx wrangler pages deploy .
```

Cloudflare gives you a `https://auris-landing.pages.dev` URL. Custom domain
later via Cloudflare dashboard → Pages → auris-landing → Custom domains.

## Wiring the download button

Edit `main.js` and set `GITHUB_REPO` to your public repo (e.g. `"yourname/auris"`).
The button automatically resolves the latest release's `Auris-Setup-*.exe`
asset via GitHub's API. Until then, clicks show a "coming soon" alert.

## Release flow

1. `cd ..` (back to repo root)
2. `npm run package` — builds sidecar + installer (~100 MB)
3. Create a GitHub Release tagged `v0.1.0`
4. Upload `release/Auris-Setup-0.1.0.exe` as a release asset
5. Landing page now serves it automatically.
