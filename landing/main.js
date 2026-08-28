/**
 * Landing behaviour. No dependencies, no build step — plain ES2020 that
 * Cloudflare Pages serves as-is.
 *
 * Three jobs: point the download buttons at the right artifact for the
 * visitor's OS, inject the price from a single constant, and run one very
 * small reveal-on-scroll.
 *
 * On a new release: upload the artifacts to the `auris-releases` R2 bucket
 * and bump LATEST_VERSION.
 */

/** Price per seat, in BRL. Single source of truth for the page. */
const PRICE_PER_SEAT_BRL = 129;

/**
 * Contact address for the "falar com a gente" CTAs.
 *
 * Left empty on purpose: publishing an address is a decision for a person,
 * not a guess. While it is empty every contact CTA is removed from the page
 * rather than rendered as a broken mailto. Fill it in before deploying.
 */
const CONTACT_EMAIL = '';

const R2_BASE = 'https://pub-ce581fb3ec254955850622d3e9bd589e.r2.dev';
const LATEST_VERSION = '0.5.0-beta';

/**
 * Artifacts in the bucket. `available` is not decoration — flip it to false
 * and the button stops offering a download instead of pointing at a 404 or,
 * worse, at a stale build.
 *
 * Windows is held back right now: the .exe on the bucket predates this
 * version and was compiled against a Groq model that has since been retired,
 * so it installs an app whose suggestions and translation fail. Set
 * `available: true` once a 0.5.0-beta .exe is uploaded.
 */
const BUILDS = {
  windows: {
    label: 'Baixar para Windows',
    file: `Auris-Setup-${LATEST_VERSION}.exe`,
    available: false,
    note:
      'Windows 10 ou 11 · o instalador não é assinado, então o Windows ' +
      'mostra um aviso azul: clique em "Mais informações" e depois em ' +
      '"Executar mesmo assim".',
    pendingNote:
      'A versão para Windows está sendo atualizada e sai em breve. A ' +
      'anterior ficou para trás e não roda mais como deveria.',
    other: 'linux',
  },
  linux: {
    label: 'Baixar para Linux',
    file: `Auris-${LATEST_VERSION}-x86_64.AppImage`,
    available: true,
    note:
      'AppImage x86_64 · 138 MB · precisa de PulseAudio ou PipeWire. Depois ' +
      'de baixar, dê permissão de execução: chmod +x Auris-*.AppImage',
    other: 'windows',
  },
};

function detectPlatform() {
  const ua = navigator.userAgent;
  // Android reports "Linux" in the UA string; neither build runs there, so
  // it falls through to the Windows default like any other unsupported OS.
  if (/Android/i.test(ua)) return 'windows';
  if (/Win/i.test(navigator.platform) || /Windows/i.test(ua)) return 'windows';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'windows';
}

function applyDownloads() {
  const key = detectPlatform();
  const build = BUILDS[key];
  const url = `${R2_BASE}/${build.file}`;
  const otherKey = build.other;
  const other = BUILDS[otherKey];

  // Ends-with, not equals: the changelog once pointed at
  // "./index.html#download-link" and silently escaped this rewrite, so its
  // button offered Windows to everyone regardless of what they were running.
  // Matching the suffix means a relative path can no longer opt out by
  // accident.
  const otherName = otherKey === 'linux' ? 'Linux' : 'Windows';

  for (const el of document.querySelectorAll('a[href$="#download-link"]')) {
    const label = el.querySelector('[data-download-label]');
    if (build.available) {
      el.setAttribute('href', url);
      el.setAttribute('download', '');
      if (label) label.textContent = build.label;
    } else {
      // Nothing to hand over: keep the button visible so the page still
      // reads, but make it inert rather than sending someone to a 404.
      el.removeAttribute('href');
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('is-disabled');
      if (label) label.textContent = `${build.label} — em breve`;
    }
  }

  for (const note of document.querySelectorAll('[data-download-note]')) {
    note.textContent = build.available ? build.note : build.pendingNote;
    // Own line: run into the end of the note and it reads as part of the
    // sentence rather than as a second option.
    const line = document.createElement('span');
    line.className = 'note-alt';
    if (other.available) {
      const link = document.createElement('a');
      link.href = `${R2_BASE}/${other.file}`;
      link.setAttribute('download', '');
      link.textContent = build.available
        ? `Também disponível para ${otherName}.`
        : `Disponível agora para ${otherName}.`;
      line.appendChild(link);
    } else {
      line.textContent = `A versão para ${otherName} sai em breve.`;
    }
    note.appendChild(line);
  }
}

function applyPrice() {
  for (const el of document.querySelectorAll('[data-price]')) {
    el.textContent = String(PRICE_PER_SEAT_BRL);
  }
}

function applyContact() {
  const links = document.querySelectorAll('[data-contact-link]');
  if (!CONTACT_EMAIL) {
    // No address configured — remove the CTAs instead of shipping a mailto
    // that goes nowhere.
    for (const el of links) el.remove();
    return;
  }
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Auris — testar com meu time')}`;
  for (const el of links) el.setAttribute('href', href);
}

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    for (const el of items) el.classList.add('is-visible');
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  for (const el of items) io.observe(el);
}

applyDownloads();
applyPrice();
applyContact();
setupReveal();
