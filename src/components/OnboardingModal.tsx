import { useEffect, useState } from 'react';
import { AurisIconMark } from './logo/AurisIconMark';

interface Props {
  /** Called when the user completes step 3 OR clicks skip. Both paths
   *  mark the prefs flag — there's no "remind me later" state. */
  onDismiss: () => void;
}

const STEPS = 3;

/** First-run tour. Three slides framing the value, the operating modes,
 *  and how to start. Skippable from any step via the X / "Pular" button. */
export function OnboardingModal({ onDismiss }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, STEPS - 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-8">
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-soft border border-border bg-bg shadow-pop">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/40" />

        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
              Bem-vindo
            </span>
            <span className="font-mono text-[9px] tracking-widest text-faint">
              · {step + 1}/{STEPS}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="font-mono text-[9px] uppercase tracking-widest text-muted transition-colors hover:text-text"
          >
            Pular
          </button>
        </header>

        <div className="flex flex-col gap-5 px-6 py-7">
          {step === 0 && <ValueStep />}
          {step === 1 && <ModesStep />}
          {step === 2 && <StartStep />}
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1 transition-all ${
                i === step ? 'w-6 bg-accent' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0}
            className="font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← Voltar
          </button>
          {step < STEPS - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-sharp border border-accent/40 bg-accent/15 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/25 hover:border-accent/60"
            >
              Avançar →
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-sharp bg-accent px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Começar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ValueStep() {
  return (
    <>
      <div className="flex justify-center pb-1">
        <div className="grid h-16 w-16 place-items-center rounded-sharp border border-border bg-surface">
          <AurisIconMark className="h-9 w-9" alive />
        </div>
      </div>
      <h2 className="text-center font-sans text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
        Auris ouve junto com você<span className="text-accent">.</span>
      </h2>
      <p className="text-center font-sans text-[13px] leading-[1.6] text-light">
        Capturamos o áudio do seu sistema — reuniões, vídeos, ligações — e
        ajudamos você a entender, resumir ou responder ao que é dito,
        sem digitar nada do que ouviu.
      </p>
      <div className="mt-1 flex flex-col gap-1.5 rounded-sharp border border-border bg-elevated/50 px-3 py-2">
        <Row label="Privado" desc="O áudio fica no seu computador. Apenas o texto vai pra IA." />
        <Row label="Sem barulho" desc="Janela some de gravadores e screen share (modo incógnito)." />
      </div>
    </>
  );
}

function ModesStep() {
  return (
    <>
      <div className="flex justify-center pb-1">
        <div className="flex items-center gap-2 rounded-sharp border border-border bg-surface px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            Manual
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live shadow-live-glow" />
            Auto
          </span>
        </div>
      </div>
      <h2 className="text-center font-sans text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
        Dois modos de operar
      </h2>
      <div className="flex flex-col gap-2.5">
        <ModeCard
          name="Manual"
          tone="neutral"
          desc='Você digita perguntas sobre o que foi dito ("resume os últimos 3 minutos", "o que ele quis dizer com X"). Auris responde com o áudio como contexto.'
        />
        <ModeCard
          name="Auto"
          tone="live"
          desc="Em entrevistas, ligações ou demos, Auris detecta perguntas sendo feitas a você no áudio e já sugere a resposta — sem você precisar digitar."
        />
      </div>
      <p className="text-center font-mono text-[9px] uppercase tracking-widest text-muted">
        Troque a qualquer momento no topo
      </p>
    </>
  );
}

function StartStep() {
  return (
    <>
      <div className="flex justify-center pb-1">
        <div className="flex items-center gap-1.5 rounded-sharp border border-accent/40 bg-accent/15 px-3 py-1.5">
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" className="text-accent">
            <path d="M1.5 1L7.5 4.5L1.5 8z" fill="currentColor" />
          </svg>
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-accent">
            Iniciar
          </span>
        </div>
      </div>
      <h2 className="text-center font-sans text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text">
        Pronto pra começar
      </h2>
      <p className="text-center font-sans text-[13px] leading-[1.6] text-light">
        Aperte <strong className="font-medium text-accent">Iniciar</strong> no
        topo direito da janela pra Auris começar a ouvir. Pause e retome
        quando quiser.
      </p>
      <div className="flex flex-col gap-1.5 rounded-sharp border border-border bg-elevated/50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-[12px] text-light">Atalho global</span>
          <span className="rounded-sharp border border-border bg-bg px-2 py-0.5 font-mono text-[10px] tracking-wider text-text">
            Ctrl+Shift+Space
          </span>
        </div>
        <p className="font-sans text-[11px] leading-relaxed text-muted">
          Funciona mesmo com a janela do Auris fechada — pause/retome de
          dentro do navegador, IDE, ou onde estiver.
        </p>
      </div>
    </>
  );
}

function Row({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-accent">
        {label}
      </span>
      <span className="font-sans text-[11.5px] leading-snug text-light">
        {desc}
      </span>
    </div>
  );
}

function ModeCard({
  name,
  tone,
  desc,
}: {
  name: string;
  tone: 'neutral' | 'live';
  desc: string;
}) {
  const accent =
    tone === 'live'
      ? 'border-live/40 bg-live/[0.05]'
      : 'border-border bg-elevated/40';
  const label =
    tone === 'live' ? 'text-live' : 'text-subtle';
  return (
    <div className={`rounded-sharp border ${accent} px-3 py-2`}>
      <div className={`mb-1 font-mono text-[9.5px] uppercase tracking-widest ${label}`}>
        {name}
      </div>
      <p className="font-sans text-[12px] leading-[1.55] text-light">{desc}</p>
    </div>
  );
}
