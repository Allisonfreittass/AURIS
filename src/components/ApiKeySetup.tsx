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
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-to/10 blur-[80px]" />
        <span className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-accent/[0.06] blur-[90px]" />
      </div>

      <WindowControls floating />

      <div className="no-drag relative w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <AurisLogo className="h-[68px] w-[68px]" />
          <div className="text-center">
            <div className="font-serif text-[26px] font-light tracking-[0.32em] text-text">
              A<span className="text-accent">U</span>RIS
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-faint">
              Configurar acesso
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="panel flex flex-col gap-3.5 px-6 py-6 shadow-card">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Chave da API Groq</span>
            <input
              type="password"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="gsk_..."
              disabled={busy}
              className="rounded-lg border border-white/[0.06] bg-bg/60 px-3 py-2 font-mono text-[12px] text-text placeholder:text-faint transition-all focus:border-accent/40 focus:bg-bg/80 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
            />
            <span className="font-sans text-[11px] leading-relaxed text-muted">
              Chave gratuita em{' '}
              <span className="text-accent">console.groq.com/keys</span>.
              Tier livre cobre uso casual.
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-danger/25 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 font-sans text-[13px] font-medium text-accent-ink shadow-accent-glow transition-all hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-faint disabled:shadow-none"
          >
            {busy ? 'Validando…' : 'Validar e salvar'}
          </button>

          <p className="font-sans text-[11px] leading-relaxed text-faint">
            Armazenada localmente, criptografada via API segura do sistema
            operacional. Nunca enviada ao renderer ou a terceiros.
          </p>
        </form>
      </div>
    </div>
  );
}
