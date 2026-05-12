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

export function AccountScreen({ onSignedOut, appVersion = '0.3.0-beta' }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackEmail, setFallbackEmail] = useState<string | null>(null);

  const [contextDraft, setContextDraft] = useState('');
  const [contextSaving, setContextSaving] = useState(false);
  const [contextStatus, setContextStatus] = useState<string | null>(null);

  const [preferredLang, setPreferredLang] = useState('pt');
  const [incognito, setIncognito] = useState(false);

  useEffect(() => {
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

    auris
      .getIncognito()
      .then(setIncognito)
      .catch(() => {});

    // Stay in sync if incognito is toggled from another surface (e.g.
    // a future popup control or system-wide hotkey).
    const offIncog = auris.onIncognitoChange(setIncognito);
    return () => offIncog();
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

  const orphanSession = !loadingProfile && !profile && fallbackEmail !== null;

  return (
    <div className="auris-scroll flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
      {orphanSession && (
        <div className="rounded-sharp border border-danger/30 bg-danger/[0.08] px-3.5 py-3">
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
        <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-sharp">
          <span
            className="absolute inset-0"
            style={{
              background: orphanSession
                ? '#252d38'
                : 'linear-gradient(135deg, #1a6cf0 0%, #0db8a0 100%)',
            }}
          />
          <span className="relative font-sans text-[18px] font-semibold text-white">
            {initial}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate font-sans text-[13px] font-medium text-text">
            {profile?.full_name || displayEmail || (loadingProfile ? 'Carregando…' : 'Conta sem dados')}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted">
            {orphanSession
              ? 'sessão local órfã'
              : memberSince
                ? `Membro desde ${memberSince}`
                : 'sessão Supabase'}
          </div>
        </div>
      </section>

      {/* User context */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Sobre você</span>
          {contextStatus && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-live">
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
          className="auris-scroll resize-none rounded-sharp border border-border bg-bg px-3 py-2.5 font-sans text-[12.5px] leading-[1.5] text-text placeholder:text-muted transition-colors focus:border-accent/50 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-widest text-muted">
            Auris usa esse contexto pra ajustar tom e foco das respostas
          </span>
          <button
            type="button"
            onClick={handleSaveContext}
            disabled={!contextDirty || contextSaving}
            className="rounded-sharp border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted"
          >
            {contextSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </section>

      {/* Preferred language */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Idioma preferido</span>
        <div className="flex items-center gap-3 rounded-sharp border border-border bg-bg px-3 py-2.5">
          <select
            value={preferredLang}
            onChange={async (e) => {
              const next = e.target.value;
              setPreferredLang(next);
              await auris.setPreferredLang(next);
            }}
            className="flex-1 px-3 cursor-pointer appearance-none border-none bg-transparent font-sans text-[13px] text-text focus:outline-none"
          >
            <option value="pt">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="de">Deutsch</option>
          </select>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" className="text-muted">
            <path d="M2 4l3.5 3L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <p className="font-sans text-[11px] leading-relaxed text-muted">
          Transcrições em outros idiomas são traduzidas automaticamente
          pra esse antes de aparecerem.
        </p>
      </section>

      {/* Privacy */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Privacidade</span>
        <button
          type="button"
          onClick={async () => {
            const next = !incognito;
            setIncognito(next);
            try {
              await auris.setIncognito(next);
            } catch (err) {
              console.error('failed to toggle incognito', err);
              setIncognito(!next);
            }
          }}
          className={`group flex items-center gap-3 rounded-sharp border bg-bg px-3 py-2.5 text-left transition-colors ${
            incognito
              ? 'border-accent/40 hover:border-accent/60'
              : 'border-border hover:border-subtle/50'
          }`}
        >
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="font-sans text-[13px] text-text">
              Modo incógnito
            </div>
            <div className="font-sans text-[11px] leading-relaxed text-muted">
              Esconde a janela de gravadores e screen share (OBS, Zoom,
              screenshots).
            </div>
          </div>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
              incognito
                ? 'border-accent/60 bg-accent/30'
                : 'border-border bg-elevated'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                incognito
                  ? 'translate-x-[18px] bg-accent'
                  : 'translate-x-[2px] bg-muted'
              }`}
            />
          </span>
        </button>
      </section>

      {/* Plan card */}
      <section className="flex flex-col gap-2.5">
        <span className="eyebrow">Plano</span>
        <div className="relative overflow-hidden rounded-soft border border-border bg-surface p-4">
          {/* Top hairline accent — single blue line, signature of the system. */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/40" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-sans text-[20px] font-semibold tracking-[-0.01em] text-text">
              {loadingProfile ? '…' : info.label}
            </span>
            {!loadingProfile && (
              <span
                className={`rounded-sharp border px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-widest ${info.badgeClass}`}
              >
                {info.badge}
              </span>
            )}
          </div>
          {!loadingProfile && (
            <>
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-subtle">
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
            className="no-drag flex items-center justify-center gap-2 rounded-sharp border border-accent/30 bg-accent/[0.05] px-4 py-2.5 font-sans text-[12px] font-medium text-accent/70 disabled:cursor-not-allowed"
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
          <div className="rounded-sharp border border-danger/30 bg-danger/[0.08] px-3 py-2 font-sans text-[12px] text-danger">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="no-drag flex items-center justify-center gap-2 rounded-sharp border border-danger/30 bg-danger/[0.08] px-4 py-2.5 font-sans text-[12px] font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="mt-auto flex items-center justify-center gap-2 pt-3 font-mono text-[9px] uppercase tracking-widest text-muted">
        <span>Auris</span>
        <span className="opacity-60">·</span>
        <span>v{appVersion}</span>
      </div>
    </div>
  );
}

/** Compact daily-quota progress bar inside the plan card. */
function QuotaBar({
  quota,
  fallback,
}: {
  quota: QuotaInfo | null;
  fallback: string;
}) {
  if (!quota) {
    return (
      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
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
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
        <span className="flex items-center gap-1.5">
          <ClockIcon />
          uso hoje
        </span>
        <span>
          <span className="text-light">{quota.used}</span>
          <span className="text-muted"> / {quota.limit}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-sharp bg-elevated">
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
