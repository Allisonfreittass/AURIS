import { useEffect, useState } from 'react';
import { auris } from '../lib/ipc';
import type { PlanTier, UserProfile } from '../../shared/ipc';

interface Props {
  onSignedOut: () => void;
  appVersion?: string;
}

interface PlanCopy {
  label: string;
  badge: string;
  badgeClass: string;
  description: string;
  dailyLimit: string;
}

const PLAN_INFO: Record<PlanTier, PlanCopy> = {
  free: {
    label: 'Gratuito',
    badge: 'Beta',
    badgeClass: 'bg-live/15 text-live border-live/30',
    description:
      'Plano beta. Use à vontade dentro do limite — perfeito pra testar. Atualize quando precisar de mais cota.',
    dailyLimit: '200 perguntas/dia',
  },
  pro: {
    label: 'Pro',
    badge: 'Ativo',
    badgeClass: 'bg-accent/15 text-accent border-accent/30',
    description:
      'Plano Pro ativo. Cota generosa pra uso intenso, suporte prioritário, integrações.',
    dailyLimit: '5.000 perguntas/dia',
  },
  team: {
    label: 'Team',
    badge: 'Ativo',
    badgeClass: 'bg-accent/15 text-accent border-accent/30',
    description:
      'Plano Team ativo. Acesso compartilhado pra sua equipe, com cota muito maior e logs centralizados.',
    dailyLimit: '25.000 perguntas/dia',
  },
};

export function AccountScreen({ onSignedOut, appVersion = '0.1.0' }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auris
      .getProfile()
      .then((p) => {
        setProfile(p);
        setLoadingProfile(false);
      })
      .catch(() => setLoadingProfile(false));
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await auris.signOut();
      onSignedOut();
    } catch (err) {
      setError((err as Error).message);
      setSigningOut(false);
    }
  }

  const initial =
    (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase();
  const plan = profile?.plan ?? 'free';
  const info = PLAN_INFO[plan];
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="auris-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
      {/* User block */}
      <section className="flex items-center gap-3">
        <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full">
          <span
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #5eead4 0%, #3b82f6 100%)' }}
          />
          <span className="relative font-serif text-[18px] font-medium text-white drop-shadow-sm">
            {initial}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate font-sans text-[13px] font-medium text-text">
            {profile?.full_name || profile?.email || 'Carregando…'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-faint">
            {memberSince ? `Membro desde ${memberSince}` : 'sessão Supabase'}
          </div>
        </div>
      </section>

      {/* Plan card */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Plano</span>
        <div className="relative overflow-hidden rounded-xl bg-elevated/70 p-4">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-to/40 to-transparent" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-[22px] font-light text-text">
              {loadingProfile ? '…' : info.label}
            </span>
            {!loadingProfile && (
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-widest ${info.badgeClass}`}
              >
                {info.badge}
              </span>
            )}
          </div>
          {!loadingProfile && (
            <>
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted">
                {info.description}
              </p>
              <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-faint">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  <path
                    d="M5 3v2l1.4 1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                {info.dailyLimit}
              </div>
            </>
          )}
        </div>
        {plan === 'free' && !loadingProfile && (
          <button
            type="button"
            disabled
            title="Disponível em breve"
            className="no-drag flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/[0.05] px-4 py-2.5 font-sans text-[12px] font-medium text-accent/70 disabled:cursor-not-allowed"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <path
                d="M5.5 1.5l1.7 2.5h2.3l-1.8 1.8.6 2.7-2.8-1.5-2.8 1.5.6-2.7L1.5 4h2.3z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            Fazer upgrade · em breve
          </button>
        )}
      </section>

      {/* Sign out */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Conta</span>
        {error && (
          <div className="rounded-lg border border-danger/25 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] text-danger">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut || !profile}
          className="no-drag flex items-center justify-center gap-2 rounded-lg border border-danger/25 bg-danger/[0.08] px-4 py-2.5 font-sans text-[12px] font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path
              d="M5 8.5h-2a1 1 0 01-1-1v-4a1 1 0 011-1h2M7 4l2 1.5-2 1.5M9 5.5h-5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          {signingOut ? 'Saindo…' : 'Sair desta conta'}
        </button>
      </section>

      <div className="mt-auto flex items-center justify-center gap-2 pt-3 font-mono text-[9px] uppercase tracking-widest text-faint/60">
        <span>Auris</span>
        <span className="text-faint/50">·</span>
        <span>v{appVersion}</span>
      </div>
    </div>
  );
}
