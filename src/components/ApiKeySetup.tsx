import { useState } from 'react';
import { AurisLogo } from './logo/AurisLogo';
import { WindowControls } from './WindowControls';
import { auris } from '../lib/ipc';

interface Props {
  onSaved: () => void;
}

/**
 * Legacy "bring your own Groq key" setup screen. Used when no Supabase
 * is configured AND no env vars are set — basically only in unmanaged dev
 * configurations. Kept around for that edge case.
 */
export function ApiKeySetup({ onSaved }: Props) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await auris.setApiKey(key);
      if (result.ok) onSaved();
      else setError(result.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drag relative flex h-full w-full items-center justify-center overflow-hidden bg-bg px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(37,45,56,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(37,45,56,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <WindowControls floating />

      <div className="no-drag relative w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <AurisLogo className="h-[64px] w-[64px]" />
          <div className="text-center">
            <div className="font-sans text-[28px] font-semibold tracking-[-0.015em] text-text leading-none">
              Auris<span className="text-accent">.</span>
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted">
              Configurar acesso
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-soft border border-border bg-surface px-6 py-6">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Chave da API Groq</span>
            <input
              type="password"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="gsk_..."
              disabled={busy}
              className="rounded-sharp border border-border bg-bg px-3 py-2 font-mono text-[12px] text-text placeholder:text-muted transition-colors focus:border-accent/50 focus:outline-none disabled:opacity-50"
            />
            <span className="font-sans text-[11px] leading-relaxed text-subtle">
              Chave gratuita em{' '}
              <span className="text-accent">console.groq.com/keys</span>.
              Tier livre cobre uso casual.
            </span>
          </label>

          {error && (
            <div className="rounded-sharp border border-danger/30 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="mt-1 rounded-sharp bg-accent px-4 py-2.5 font-sans text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted"
          >
            {busy ? 'Validando…' : 'Validar e salvar'}
          </button>

          <p className="font-sans text-[11px] leading-relaxed text-muted">
            Armazenada localmente, criptografada via API segura do sistema
            operacional. Nunca enviada ao renderer ou a terceiros.
          </p>
        </form>
      </div>
    </div>
  );
}
