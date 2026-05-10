import { useEffect, useState } from 'react';
import { auris } from '../lib/ipc';
import type { PlanTier, QuotaInfo, UserProfile } from '../../shared/ipc';

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
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackEmail, setFallbackEmail] = useState<string | null>(null);

  // Editable user-context state — separate from `profile` so the user can
  // edit without the field flickering as the profile re-fetches.
  const [contextDraft, setContextDraft] = useState('');
  const [contextSaving, setContextSaving] = useState(false);
  const [contextStatus, setContextStatus] = useState<string | null>(null);

  const [preferredLang, setPreferredLang] = useState('pt');

  useEffect(() => {
    // Three parallel fetches so we always have *something* to show (and a
    // way to log out) even when the profile is gone — e.g. account was
    // deleted server-side but our session is still cached locally.
    auris
      .getProfile()
      .then((p) => {
        setProfile(p);
        setContextDraft(p?.user_context ?? '');
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    auris
      .currentUser()
      .then((u) => setFallbackEmail(u?.email ?? null))
      .catch(() => {});

    auris
      .getQuota()
      .then((q) => setQuota(q))
      .catch(() => {});

    auris
      .getPreferredLang()
      .then((l) => setPreferredLang(l ?? 'pt'))
      .catch(() => {});
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

  async function handleSaveContext() {
    setContextSaving(true);
    setContextStatus(null);
    const trimmed = contextDraft.trim();
    const result = await auris.updateUserContext(trimmed.length > 0 ? trimmed : null);
    setContextSaving(false);
    if (result.ok) {
      setContextStatus('Salvo.');
      setProfile((p) => (p ? { ...p, user_context: trimmed.length > 0 ? trimmed : null } : p));
      setTimeout(() => setContextStatus(null), 2500);
    } else {
      setContextStatus(result.error ?? 'Erro ao salvar.');
    }
  }

  const contextDirty = (profile?.user_context ?? '') !== contextDraft;

  const displayEmail = profile?.email ?? fallbackEmail ?? null;
  const initial =
    (profile?.full_name?.[0] ?? displayEmail?.[0] ?? '?').toUpperCase();
  const plan = profile?.plan ?? 'free';
  const info = PLAN_INFO[plan];
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  // Local session exists but Supabase has no profile row → account was
  // deleted server-side. Show a banner + keep sign-out available so the
  // user can recover.
  const orphanSession = !loadingProfile && !profile && fallbackEmail !== null;

  return (
    <div className="auris-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
      {/* Orphan-session banner — shown when local session survived a
          server-side account delete. Always-on sign-out below recovers. */}
      {orphanSession && (
        <div className="rounded-lg border border-danger/30 bg-danger/[0.08] px-3.5 py-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-danger/85">
            Sessão sem conta
          </div>
          <div className="font-sans text-[12.5px] leading-relaxed text-danger">
            Sua conta não está mais no servidor (foi deletada ou desativada).
            Saia desta sessão pra criar uma conta nova.
          </div>
        </div>
      )}

      {/* User block */}
      <section className="flex items-center gap-3">
        <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full">
          <span
            className="absolute inset-0"
            style={{
              background: orphanSession
                ? 'linear-gradient(135deg, #4a4f60 0%, #2a3142 100%)'
                : 'linear-gradient(135deg, #5eead4 0%, #3b82f6 100%)',
            }}
          />
          <span className="relative font-serif text-[18px] font-medium text-white drop-shadow-sm">
            {initial}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate font-sans text-[13px] font-medium text-text">
            {profile?.full_name || displayEmail || (loadingProfile ? 'Carregando…' : 'Conta sem dados')}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-faint">
            {orphanSession
              ? 'sessão local órfã'
              : memberSince
                ? `Membro desde ${memberSince}`
                : 'sessão Supabase'}
          </div>
        </div>
      </section>

      {/* User context — free-text field that gets injected into every ask
          so Auris adapts to the user's profession / focus / audience. */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Sobre você</span>
          {contextStatus && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-accent2">
              {contextStatus}
            </span>
          )}
        </div>
        <textarea
          value={contextDraft}
          onChange={(e) => setContextDraft(e.target.value)}
          placeholder='ex.: "sou advogado tributarista, foco em planejamento de holdings"'
          rows={3}
          maxLength={500}
          disabled={contextSaving}
          className="auris-scroll resize-none rounded-lg border border-white/[0.06] bg-bg/60 px-3 py-2.5 font-sans text-[12.5px] leading-[1.5] text-text placeholder:text-faint focus:border-accent/40 focus:bg-bg/80 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-widest text-faint">
            Auris usa esse contexto pra ajustar tom e foco das respostas
          </span>
          <button
            type="button"
            onClick={handleSaveContext}
            disabled={!contextDirty || contextSaving}
            className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-transparent disabled:text-faint"
          >
            {contextSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </section>

      {/* Preferred language for transcription display */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Idioma preferido</span>
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-bg/40 px-3 py-2.5">
          <select
            value={preferredLang}
            onChange={async (e) => {
              const next = e.target.value;
              setPreferredLang(next);
              await auris.setPreferredLang(next);
            }}
            className="flex-1 cursor-pointer appearance-none border-none bg-transparent font-sans text-[13px] text-text focus:outline-none"
          >
            <option value="pt">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="de">Deutsch</option>
          </select>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" className="text-faint">
            <path d="M2 4l3.5 3L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <p className="font-sans text-[11px] leading-relaxed text-faint">
          Transcrições em outros idiomas são traduzidas automaticamente
          pra esse antes de aparecerem.
        </p>
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
              <QuotaBar quota={quota} fallback={info.dailyLimit} />
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
          disabled={signingOut}
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
          {signingOut
            ? 'Saindo…'
            : orphanSession
              ? 'Sair (recuperar sessão)'
              : 'Sair desta conta'}
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

/** Compact daily-quota progress bar inside the plan card. Falls back to
 *  the static "X perguntas/dia" label when /quota isn't reachable (proxy
 *  not configured, network down, etc.). */
function QuotaBar({
  quota,
  fallback,
}: {
  quota: QuotaInfo | null;
  fallback: string;
}) {
  if (!quota) {
    return (
      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-faint">
        <ClockIcon />
        {fallback}
      </div>
    );
  }

  const pct = Math.min((quota.used / quota.limit) * 100, 100);
  const tone =
    pct >= 90 ? 'bg-danger'
    : pct >= 70 ? 'bg-accent-deep'
    : 'bg-accent';

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-faint">
        <span className="flex items-center gap-1.5">
          <ClockIcon />
          uso hoje
        </span>
        <span>
          <span className="text-text/85">{quota.used}</span>
          <span className="text-faint/60"> / {quota.limit}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className={`h-full ${tone} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M5 3v2l1.4 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
