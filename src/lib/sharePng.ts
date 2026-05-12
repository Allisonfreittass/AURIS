/** Renders an Auris response as a 1080×1080 PNG suitable for social
 *  sharing. Uses the runtime canvas directly — no html2canvas or other
 *  dependency. Returns a Blob so callers can either copy it to the
 *  clipboard (via ClipboardItem) or hand it to main for "save as".
 *
 *  Layout (top → bottom):
 *    [EQ-bars logo] Auris.            (brand)
 *    ─────────────
 *    PERGUNTA                          (eyebrow, mono caps)
 *    "context question text…"          (italic light, ≤3 lines)
 *    ─────────────
 *    The actual response text          (sans medium white, wrap)
 *    continues here...
 *    ─────────────
 *                              VIA AURIS  (footer, mono caps, right)
 */
export async function renderShareImage({
  answer,
  question,
}: {
  answer: string;
  question?: string;
}): Promise<Blob> {
  // Ensure Epilogue + JetBrains Mono are loaded before the canvas paints —
  // otherwise the first share falls back to a generic sans.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore — render with fallback fonts */
    }
  }

  const W = 1080;
  const H = 1080;
  const PAD = 88;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // ── Background + subtle grid ───────────────────────────────────────
  ctx.fillStyle = '#0a0c0f';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(37,45,56,0.4)';
  ctx.lineWidth = 1;
  for (let x = 96; x < W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 96; y < H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // ── Top hairline accent ────────────────────────────────────────────
  ctx.fillStyle = '#1a6cf0';
  ctx.fillRect(0, 0, W, 2);

  // ── Brand: EQ-bars logo + "Auris." ─────────────────────────────────
  drawEqMark(ctx, PAD, PAD, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px Epilogue, sans-serif';
  ctx.textBaseline = 'top';
  const brandY = PAD + 6;
  const brandX = PAD + 48 + 14;
  ctx.fillText('Auris', brandX, brandY);
  const brandWidth = ctx.measureText('Auris').width;
  ctx.fillStyle = '#1a6cf0';
  ctx.fillText('.', brandX + brandWidth, brandY);

  let cursorY = PAD + 48 + 56;

  // ── Question (optional) ────────────────────────────────────────────
  const cleanQuestion = question?.trim();
  if (cleanQuestion) {
    ctx.fillStyle = '#5a6880';
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText('PERGUNTA', PAD, cursorY);
    cursorY += 32;

    ctx.fillStyle = '#8a9ab0';
    ctx.font = 'italic 300 28px Epilogue, sans-serif';
    const qLines = wrapText(ctx, `"${cleanQuestion}"`, W - PAD * 2);
    const QUESTION_MAX_LINES = 3;
    const qShown = qLines.slice(0, QUESTION_MAX_LINES);
    if (qLines.length > QUESTION_MAX_LINES && qShown.length > 0) {
      qShown[qShown.length - 1] = truncateToWidth(
        ctx,
        qShown[qShown.length - 1].replace(/"$/, '') + '…"',
        W - PAD * 2,
      );
    }
    for (const line of qShown) {
      ctx.fillText(line, PAD, cursorY);
      cursorY += 40;
    }
    cursorY += 16;
  }

  // ── Hairline divider before answer ─────────────────────────────────
  ctx.fillStyle = '#252d38';
  ctx.fillRect(PAD, cursorY, W - PAD * 2, 1);
  cursorY += 40;

  // ── Main response text ─────────────────────────────────────────────
  // Strip the **bold** markers entirely — the share image stays calm,
  // monoweight. Bold-as-accent is a UI thing, not a sharing thing.
  const cleanAnswer = answer.replace(/\*\*/g, '').trim();
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 38px Epilogue, sans-serif';
  const FOOTER_RESERVED = 110;
  const lineHeight = 54;
  const availableHeight = H - PAD - FOOTER_RESERVED - cursorY;
  const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));

  const aLines = wrapTextRespectingNewlines(ctx, cleanAnswer, W - PAD * 2);
  const aShown = aLines.slice(0, maxLines);
  if (aLines.length > maxLines && aShown.length > 0) {
    aShown[aShown.length - 1] = truncateToWidth(
      ctx,
      aShown[aShown.length - 1] + '…',
      W - PAD * 2,
    );
  }
  for (const line of aShown) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += lineHeight;
  }

  // ── Footer: hairline + "VIA AURIS" right-aligned ───────────────────
  ctx.fillStyle = '#252d38';
  ctx.fillRect(PAD, H - PAD - 28, W - PAD * 2, 1);
  ctx.fillStyle = '#8a9ab0';
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('VIA  AURIS', W - PAD, H - PAD);
  ctx.textAlign = 'left'; // reset

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}

/** Plain-text share blurb. Used by the "copiar como texto" action.
 *  Strips markdown and adds the via-tag at the end. */
export function renderShareText({
  answer,
  question,
}: {
  answer: string;
  question?: string;
}): string {
  const lines: string[] = [];
  const q = question?.trim();
  if (q) {
    lines.push(`Pergunta: ${q}`);
    lines.push('');
  }
  lines.push(answer.replace(/\*\*/g, '').trim());
  lines.push('');
  lines.push('— via Auris');
  return lines.join('\n');
}

// ── helpers ────────────────────────────────────────────────────────────

/** Draws the EQ-bars mark scaled to fit `size`×`size`, anchored at (x, y).
 *  Bar coordinates mirror src/components/logo/AurisIconMark.tsx (viewBox
 *  0–56) so the share image matches the in-app logo. */
function drawEqMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const scale = size / 56;
  const bars: { x: number; y: number; h: number; fill: string; alpha: number }[] = [
    { x: 10, y: 24, h: 20, fill: '#1a6cf0', alpha: 0.4 },
    { x: 17, y: 16, h: 28, fill: '#1a6cf0', alpha: 0.65 },
    { x: 24, y: 10, h: 36, fill: '#1a6cf0', alpha: 1.0 },
    { x: 31, y: 16, h: 28, fill: '#0db8a0', alpha: 0.8 },
    { x: 38, y: 22, h: 22, fill: '#0db8a0', alpha: 0.5 },
  ];
  for (const b of bars) {
    ctx.fillStyle = b.fill;
    ctx.globalAlpha = b.alpha;
    ctx.fillRect(x + b.x * scale, y + b.y * scale, 4 * scale, b.h * scale);
  }
  ctx.globalAlpha = 1;
}

/** Word-wrap respecting hard newlines in the source text. */
function wrapTextRespectingNewlines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    out.push(...wrapText(ctx, paragraph, maxWidth));
  }
  return out;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** Binary-search the longest prefix of `text` that fits with an ellipsis. */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  // Reserve the ellipsis width: trim until the remainder + "…" fits.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}
