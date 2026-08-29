/**
 * Landing behaviour. No dependencies, no build step — plain ES2020 that
 * Cloudflare Pages serves as-is.
 *
 * Three jobs: point the download buttons at the right artifact for the
 * visitor's OS, inject the price from a single constant, and drive the hero
 * console — the one animated thing on the page.
 *
 * On a new release: upload the artifacts to the `auris-releases` R2 bucket
 * and bump that platform's entry in VERSIONS.
 */

/**
 * Price per seat, in BRL. Nothing reads it while the beta is free — the page
 * says "grátis" in words instead of showing a zero, because a price of R$ 0
 * reads as a broken number rather than as an offer. Set it back and restore
 * the `data-price` span when the beta ends.
 */
const PRICE_PER_SEAT_BRL = 0;

/**
 * Contact address for the "falar com a gente" CTAs. When empty, those CTAs
 * are removed from the page rather than rendered as a broken mailto.
 */
const CONTACT_EMAIL = 'allisonfreittass@gmail.com';

const R2_BASE = 'https://pub-ce581fb3ec254955850622d3e9bd589e.r2.dev';

/**
 * Version per platform, not one shared constant.
 *
 * The two builds are produced on different machines — PyInstaller does not
 * cross-compile — so they drift apart in practice. A single constant papered
 * over that and produced two artifacts with the same number and different
 * contents, which is the one thing a version is supposed to prevent.
 */
const VERSIONS = {
  windows: '0.5.0-beta',
  linux: '0.5.1-beta',
};

/**
 * Artifacts in the bucket. `available` is not decoration — flip it to false
 * and the button stops offering a download instead of pointing at a 404 or,
 * worse, at a stale build. Each entry was checked against the bucket (size
 * and sha512) at the version named in VERSIONS before being turned on.
 *
 * `pendingNote` is what the note says when `available` is false. It is not
 * optional: leave it out and flipping the flag renders the string
 * "undefined" where the download instructions used to be.
 */
const BUILDS = {
  windows: {
    label: 'Baixar para Windows',
    file: `Auris-Setup-${VERSIONS.windows}.exe`,
    available: true,
    note:
      'Windows 10 ou 11 · 106 MB · o instalador não é assinado, então o ' +
      'Windows mostra um aviso azul: clique em "Mais informações" e depois ' +
      'em "Executar mesmo assim".',
    pendingNote:
      'A build para Windows está sendo preparada. Assim que sair, o botão ' +
      'passa a baixar o instalador.',
    other: 'linux',
  },
  linux: {
    label: 'Baixar para Linux',
    file: `Auris-${VERSIONS.linux}-x86_64.AppImage`,
    available: true,
    note:
      'AppImage x86_64 · 138 MB · precisa de PulseAudio ou PipeWire. Depois ' +
      'de baixar, dê permissão de execução: chmod +x Auris-*.AppImage',
    pendingNote:
      'A build para Linux está sendo preparada. Assim que sair, o botão ' +
      'passa a baixar o AppImage.',
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

/* ══════════════════════════════════════════════════════════════════════
   Hero console
   ══════════════════════════════════════════════════════════════════════

   A real call played back on two lanes, one per audio channel, with the
   record assembling underneath as the objections and the commitments go by.

   The transcript is the demo call that ships with the app — the same one in
   screenshot-transcricao.png — trimmed to the turns that carry an objection
   or a commitment. Inventing dialogue here would have been easier and would
   have shown a product that does not exist. */

/** Length of the call, in seconds. Matches the "12 MIN" in the app shot. */
const CALL_SECONDS = 720;
/** How long the whole call takes to play back on screen, in seconds. */
const PLAY_SECONDS = 22;
/** Seconds of call visible in the lanes at once. Sets how wide a block gets. */
const WINDOW_SECONDS = 90;
/** Where the playhead sits in the track, as a fraction. Mirrors --pos. */
const PLAYHEAD = 0.76;

/** `s` is the channel: 'c' for cliente, 'v' for vendedor. */
const SEGMENTS = [
  { t: 10, d: 7, s: 'v', text: 'Bom dia, Renata. Aqui é o Marcelo, da Meridian.' },
  { t: 22, d: 4, s: 'c', text: 'Ouço sim, Marcelo. Bom dia.' },
  {
    t: 48,
    d: 9,
    s: 'v',
    text: 'Vocês estão com dificuldade de acompanhar as propostas depois que saem, é isso?',
  },
  {
    t: 64,
    d: 13,
    s: 'c',
    text: 'É exatamente isso. A gente manda a proposta e ela some. Ninguém sabe se o cliente abriu, se respondeu, se alguém retomou.',
  },
  { t: 120, d: 7, s: 'v', text: 'E quantas propostas por mês, mais ou menos, saem do time?' },
  { t: 134, d: 6, s: 'c', text: 'Umas sessenta, setenta. No mês bom passa de oitenta.' },
  { t: 150, d: 6, s: 'v', text: 'E dessas, vocês conseguem dizer quantas viraram visita?' },
  { t: 162, d: 9, s: 'c', text: 'Não. Eu sei o que fechou, não sei o que perdi no caminho.' },
  {
    t: 210,
    d: 13,
    s: 'v',
    text: 'É esse buraco que a implantação do Vetor resolve primeiro. Cada proposta passa a ter dono e prazo.',
  },
  { t: 248, d: 5, s: 'c', text: 'E quanto tempo leva pra isso estar rodando?' },
  {
    t: 262,
    d: 11,
    s: 'v',
    text: 'A implantação padrão são seis semanas. Duas de levantamento, três de configuração, uma de treinamento.',
  },
  {
    t: 300,
    d: 8,
    s: 'c',
    text: 'Seis semanas é bastante. A gente entra em alta temporada em outubro.',
    out: { list: 'objecoes', text: 'Prazo', meta: 'seis semanas caem na alta temporada' },
  },
  {
    t: 330,
    d: 11,
    s: 'v',
    text: 'Dá pra iniciar o levantamento ainda este mês e deixar o funil rodando em outubro.',
  },
  {
    t: 396,
    d: 10,
    s: 'c',
    text: 'Vinte e oito mil de implantação mais a mensalidade ficou acima do que a gente esperava.',
    out: { list: 'objecoes', text: 'Preço', meta: 'implantação e mensalidade acima do esperado' },
  },
  {
    t: 428,
    d: 12,
    s: 'v',
    text: 'Mesmo com três visitas por mês, o projeto se paga no primeiro trimestre.',
  },
  {
    t: 486,
    d: 7,
    s: 'c',
    text: 'Quem decide o valor é meu sócio financeiro.',
    out: { list: 'objecoes', text: 'Autoridade', meta: 'a decisão depende do sócio financeiro' },
  },
  {
    t: 505,
    d: 10,
    s: 'v',
    text: 'Te mando uma proposta de uma página pra você levar pro seu sócio.',
    out: {
      list: 'passos',
      text: 'Enviar proposta de uma página com escopo, prazo e valores',
      meta: 'nosso · quinta-feira',
    },
  },
  {
    t: 560,
    d: 6,
    s: 'c',
    text: 'Fecho com ele e te retorno.',
    out: { list: 'passos', text: 'Alinhar proposta com o sócio financeiro', meta: 'cliente' },
  },
  {
    t: 640,
    d: 9,
    s: 'v',
    text: 'Quinta na sua mão. Ligo segunda antes das 10h pra definir o levantamento.',
    out: {
      list: 'passos',
      text: 'Ligar para definir data do levantamento',
      meta: 'nosso · segunda antes das 10h',
    },
  },
  { t: 690, d: 4, s: 'c', text: 'Combinado. Obrigada, Marcelo.' },
];

const LANE_OF = { c: 'cliente', v: 'vendedor' };

function clock(seconds) {
  const s = Math.max(0, Math.min(CALL_SECONDS, Math.round(seconds)));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Bar heights for one block's waveform. Seeded off the segment's own start
 * time so a block looks the same on every replay — a waveform that reshuffles
 * is a waveform nobody believes.
 */
function bars(seg) {
  const count = Math.max(4, Math.min(28, Math.round(seg.d * 1.4)));
  let seed = seg.t * 2654435761;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out.push(28 + ((seed >> 8) % 72));
  }
  return out;
}

function setupConsole() {
  const root = document.querySelector('[data-console]');
  if (!root) return;

  root.classList.remove('no-js');

  const tracks = {
    cliente: root.querySelector('[data-lane="cliente"]'),
    vendedor: root.querySelector('[data-lane="vendedor"]'),
  };
  const lists = {
    objecoes: root.querySelector('[data-out="objecoes"]'),
    passos: root.querySelector('[data-out="passos"]'),
  };
  const clockEl = root.querySelector('[data-console-clock]');
  const stateEl = root.querySelector('[data-console-state-text]');
  const lineEl = root.querySelector('[data-console-line]');
  const replayBtn = root.querySelector('[data-console-replay]');

  function addOut(seg) {
    const list = lists[seg.out.list];
    if (!list || list.querySelector(`[data-at="${seg.t}"]`)) return;
    const li = document.createElement('li');
    li.dataset.at = String(seg.t);
    li.textContent = seg.out.text;
    const meta = document.createElement('span');
    meta.textContent = seg.out.meta;
    li.appendChild(meta);
    list.appendChild(li);
  }

  // The record is in the HTML so the page still makes its claim with the
  // script blocked. With the script running it is rebuilt in call order.
  function clearOut() {
    for (const list of Object.values(lists)) if (list) list.replaceChildren();
  }

  // Blocks are laid out once; playback only moves the strip and flips classes.
  const blocks = SEGMENTS.map((seg) => {
    const el = document.createElement('div');
    el.className = 'blk';
    el.style.left = `${(seg.t / CALL_SECONDS) * 100}%`;
    el.style.width = `${(seg.d / CALL_SECONDS) * 100}%`;
    for (const h of bars(seg)) {
      const bar = document.createElement('i');
      bar.style.setProperty('--h', `${h}%`);
      el.appendChild(bar);
    }
    tracks[LANE_OF[seg.s]].appendChild(el);
    return { seg, el };
  });

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** End state: everything happened, nothing is moving. */
  function settle() {
    clearOut();
    for (const seg of SEGMENTS) if (seg.out) addOut(seg);
    for (const { el } of blocks) el.classList.add('is-past');
    clockEl.textContent = clock(CALL_SECONDS);
    stateEl.textContent = 'registro gerado';
    lineEl.textContent = '';
    lineEl.removeAttribute('data-speaker');
  }

  let frame = 0;
  let startedAt = 0;

  function shift(now) {
    // The strip is CALL/WINDOW track-widths wide, so one track-width is
    // WINDOW/CALL of it — that is what the playhead offset is measured in.
    const travelled = (now / CALL_SECONDS) * 100;
    const offset = PLAYHEAD * (WINDOW_SECONDS / CALL_SECONDS) * 100;
    const x = `translateX(${(offset - travelled).toFixed(3)}%)`;
    tracks.cliente.style.transform = x;
    tracks.vendedor.style.transform = x;
  }

  function tick(ts) {
    if (!startedAt) startedAt = ts;
    const elapsed = (ts - startedAt) / 1000;
    const now = (elapsed / PLAY_SECONDS) * CALL_SECONDS;

    shift(now);
    clockEl.textContent = clock(now);

    let live = null;
    for (const { seg, el } of blocks) {
      const done = now >= seg.t + seg.d;
      el.classList.toggle('is-past', done);
      const isLive = now >= seg.t && !done;
      el.classList.toggle('is-live', isLive);
      if (isLive) live = seg;
      if (done && seg.out) addOut(seg);
    }

    if (live) {
      lineEl.dataset.speaker = LANE_OF[live.s];
      lineEl.innerHTML = '';
      const who = document.createElement('b');
      who.textContent = LANE_OF[live.s];
      lineEl.append(who, document.createTextNode(live.text));
    }

    if (now >= CALL_SECONDS) {
      root.dataset.state = 'done';
      settle();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function play() {
    cancelAnimationFrame(frame);
    if (reduced.matches) {
      root.dataset.state = 'static';
      settle();
      return;
    }
    clearOut();
    for (const { el } of blocks) el.classList.remove('is-past', 'is-live');
    lineEl.textContent = '';
    stateEl.textContent = 'ouvindo';
    root.dataset.state = 'listening';
    startedAt = 0;
    frame = requestAnimationFrame(tick);
  }

  replayBtn.addEventListener('click', play);
  reduced.addEventListener('change', play);

  // The console is above the fold, so there is nothing to wait for — but a
  // visitor who arrives on a background tab should still see it run, not
  // find it already over.
  if (document.hidden) {
    document.addEventListener('visibilitychange', function once() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', once);
      play();
    });
    settle();
  } else {
    play();
  }
}

applyDownloads();
applyPrice();
applyContact();
setupConsole();
