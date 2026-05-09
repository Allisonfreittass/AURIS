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
      {/* Background atmospherics — subtle blobs of color blurred behind. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-to/10 blur-[80px]"
        />
        <span
          className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-accent/[0.06] blur-[90px]"
        />
      </div>

      <WindowControls floating />

      <div className="no-drag relative w-full max-w-[400px] animate-fade-up">
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <AurisLogo className="h-[68px] w-[68px]" />
          <div className="text-center">
            <div className="font-serif text-[26px] font-light tracking-[0.32em] text-text">
              A<span className="text-accent">U</span>RIS
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-faint">
              {isSignup ? 'Criar conta' : 'Entrar'}
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="panel flex flex-col gap-3.5 px-6 py-6 shadow-card"
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
            <div className="rounded-lg border border-danger/25 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] leading-relaxed text-danger">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-live/25 bg-live/[0.08] px-3 py-2 font-sans text-[12px] leading-relaxed text-live">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-sans text-[13px] font-medium text-accent-ink shadow-accent-glow transition-all hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-faint disabled:shadow-none"
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
            className="font-sans text-[12px] text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            {isSignup ? 'Já tenho conta · Entrar' : 'Ainda não tenho conta · Criar uma'}
          </button>
        </form>

        <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-widest text-faint">
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
        className="rounded-lg border border-white/[0.06] bg-bg/60 px-3 py-2 font-sans text-[13px] text-text placeholder:text-faint transition-all focus:border-accent/40 focus:bg-bg/80 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
      />
    </label>
  );
}
