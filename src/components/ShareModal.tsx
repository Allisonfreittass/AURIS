import { useEffect, useState } from 'react';
import { auris } from '../lib/ipc';
import { renderShareImage, renderShareText } from '../lib/sharePng';

interface Props {
  answer: string;
  question?: string;
  onClose: () => void;
}

type ActionState = 'idle' | 'busy' | 'done' | 'error';

/** Modal with a preview of the generated share image and three actions:
 *  copy image (clipboard), save PNG (OS dialog), copy text. The image
 *  is generated once on open and reused for all actions. */
export function ShareModal({ answer, question, onClose }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [copyImgState, setCopyImgState] = useState<ActionState>('idle');
  const [savePngState, setSavePngState] = useState<ActionState>('idle');
  const [copyTxtState, setCopyTxtState] = useState<ActionState>('idle');

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    renderShareImage({ answer, question })
      .then((b) => {
        if (cancelled) return;
        setBlob(b);
        createdUrl = URL.createObjectURL(b);
        setPreviewUrl(createdUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message ?? 'Falha ao gerar imagem.');
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [answer, question]);

  // ESC closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleCopyImage() {
    if (!blob) return;
    setCopyImgState('busy');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyImgState('done');
      setTimeout(() => setCopyImgState('idle'), 1800);
    } catch (err) {
      console.warn('[share] copy image failed:', err);
      setCopyImgState('error');
      setTimeout(() => setCopyImgState('idle'), 2400);
    }
  }

  async function handleSavePng() {
    if (!blob) return;
    setSavePngState('busy');
    try {
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const saved = await auris.saveSharePng(buffer, defaultFilename());
      setSavePngState(saved ? 'done' : 'idle');
      if (saved) setTimeout(() => setSavePngState('idle'), 1800);
    } catch (err) {
      console.warn('[share] save png failed:', err);
      setSavePngState('error');
      setTimeout(() => setSavePngState('idle'), 2400);
    }
  }

  async function handleCopyText() {
    setCopyTxtState('busy');
    try {
      await navigator.clipboard.writeText(renderShareText({ answer, question }));
      setCopyTxtState('done');
      setTimeout(() => setCopyTxtState('idle'), 1800);
    } catch (err) {
      console.warn('[share] copy text failed:', err);
      setCopyTxtState('error');
      setTimeout(() => setCopyTxtState('idle'), 2400);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={(e) => {
        // Clicking the backdrop (but not the dialog) closes the modal.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-soft border border-border bg-bg shadow-pop">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/40" />
        <header className="flex items-center justify-between border-b border-border bg-surface px-3.5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            Compartilhar
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="grid h-5 w-5 place-items-center rounded-sharp text-muted transition-colors hover:bg-elevated hover:text-text"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path
                d="M2 2L7 7M7 2L2 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="auris-scroll flex flex-col gap-3 overflow-y-auto p-3.5">
          {/* Preview */}
          <div className="aspect-square w-full overflow-hidden rounded-sharp border border-border bg-elevated">
            {error ? (
              <div className="flex h-full items-center justify-center px-6 text-center font-sans text-[12px] text-danger">
                {error}
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Pré-visualização da imagem"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted">
                Gerando imagem…
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <ActionButton
              state={copyImgState}
              disabled={!blob}
              onClick={handleCopyImage}
              labels={{
                idle: 'Copiar imagem',
                busy: 'Copiando…',
                done: 'Copiado',
                error: 'Falhou — tente salvar como PNG',
              }}
              primary
            />
            <ActionButton
              state={savePngState}
              disabled={!blob}
              onClick={handleSavePng}
              labels={{
                idle: 'Salvar PNG…',
                busy: 'Salvando…',
                done: 'Salvo',
                error: 'Falhou ao salvar',
              }}
            />
            <ActionButton
              state={copyTxtState}
              disabled={false}
              onClick={handleCopyText}
              labels={{
                idle: 'Copiar como texto',
                busy: 'Copiando…',
                done: 'Copiado',
                error: 'Falhou',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `auris-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}.png`
  );
}

interface ActionButtonProps {
  state: ActionState;
  disabled: boolean;
  onClick: () => void;
  labels: Record<ActionState, string>;
  primary?: boolean;
}

function ActionButton({ state, disabled, onClick, labels, primary }: ActionButtonProps) {
  const base =
    'rounded-sharp px-3 py-2 font-sans text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const tone = primary
    ? state === 'done'
      ? 'border border-live/40 bg-live/15 text-live'
      : state === 'error'
        ? 'border border-danger/40 bg-danger/[0.08] text-danger'
        : 'border border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 hover:border-accent/50'
    : state === 'done'
      ? 'border border-live/40 bg-live/10 text-live'
      : state === 'error'
        ? 'border border-danger/30 bg-danger/[0.08] text-danger'
        : 'border border-border bg-elevated text-text hover:border-subtle/40';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === 'busy'}
      className={`${base} ${tone}`}
    >
      {labels[state]}
    </button>
  );
}
