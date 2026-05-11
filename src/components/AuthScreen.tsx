import { useState } from 'react';
import { AurisLogo } from './logo/AurisLogo';
import { WindowControls } from './WindowControls';
import { auris } from '../lib/ipc';

interface Props {
  onAuthed: () => void;
}

type Mode = 'signin' | 'signup';

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result =
        mode === 'signin'
          ? await auris.signIn(email.trim(), password)
          : await auris.signUp(email.trim(), password);
      if (result.ok) onAuthed();
      else if (result.code === 'email_not_confirmed') setInfo(result.error);
      else setError(result.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="drag relative flex h-full w-full items-center justify-center overflow-hidden bg-bg px-6">
      {/* Faint grid background — corporate-system identity. */}
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
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <AurisLogo className="h-[64px] w-[64px]" />
          <div className="text-center">
            <div className="font-sans text-[28px] font-semibold tracking-[-0.015em] text-text leading-none">
              Auris<span className="text-accent">.</span>
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted">
              {isSignup ? 'Criar conta' : 'Entrar'}
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-3.5 rounded-soft border border-border bg-surface px-6 py-6"
        >
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={setEmail}
            placeholder="voce@email.com"
            disabled={busy}
          />
          <Field
            label="Senha"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            placeholder={isSignup ? 'mínimo 8 caracteres' : '••••••••'}
            disabled={busy}
          />

          {error && (
            <div className="rounded-sharp border border-danger/30 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] leading-relaxed text-danger">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-sharp border border-live/30 bg-live/[0.08] px-3 py-2 font-sans text-[12px] leading-relaxed text-live">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="mt-1 flex items-center justify-center gap-2 rounded-sharp bg-accent px-4 py-2.5 font-sans text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted"
          >
            {busy ? 'Aguarde…' : isSignup ? 'Criar conta' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup');
              setError(null);
              setInfo(null);
            }}
            disabled={busy}
            className="font-sans text-[12px] text-subtle transition-colors hover:text-text disabled:opacity-40"
          >
            {isSignup ? 'Já tenho conta · Entrar' : 'Ainda não tenho conta · Criar uma'}
          </button>
        </form>

        <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-widest text-muted">
          beta · uso sem limites
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sharp border border-border bg-bg px-3 py-2 font-sans text-[13px] text-text placeholder:text-muted transition-colors focus:border-accent/50 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
