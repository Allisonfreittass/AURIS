import type { AudioErrorEvent } from '../../shared/ipc';

interface Props {
  audioError: AudioErrorEvent | null;
  llmError: string | null;
  onRetryAudio?: () => void;
  onDismissLlm?: () => void;
}

/**
 * Friendly error surface — recognizes common failure modes (mic permission,
 * loopback unavailable, network down, rate limit, expired auth) and maps
 * them to actionable copy + a primary CTA. Falls back to the raw message
 * for things we haven't categorized yet.
 */
export function ErrorBanner({ audioError, llmError, onRetryAudio, onDismissLlm }: Props) {
  if (!audioError && !llmError) return null;

  const items: Array<{
    severity: 'block' | 'warn';
    title: string;
    body: string;
    cta?: { label: string; onClick: () => void };
    hint?: string;
  }> = [];

  if (audioError) {
    items.push(audioErrorPresentation(audioError, onRetryAudio));
  }
  if (llmError) {
    items.push(llmErrorPresentation(llmError, onDismissLlm));
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {items.map((it, i) => (
        <div
          key={i}
          className={
            it.severity === 'block'
              ? 'rounded-sharp border border-danger/30 bg-danger/[0.08] px-3.5 py-3'
              : 'rounded-sharp border border-accent/30 bg-accent/[0.06] px-3.5 py-3'
          }
        >
          <div
            className={`mb-1 font-mono text-[9px] uppercase tracking-widest ${
              it.severity === 'block' ? 'text-danger/85' : 'text-accent/85'
            }`}
          >
            {it.title}
          </div>
          <div
            className={`font-sans text-[12.5px] leading-relaxed ${
              it.severity === 'block' ? 'text-danger' : 'text-light'
            }`}
          >
            {it.body}
          </div>
          {it.hint && (
            <div className="mt-1.5 font-sans text-[11px] leading-relaxed text-subtle">
              {it.hint}
            </div>
          )}
          {it.cta && (
            <button
              onClick={it.cta.onClick}
              className={
                'no-drag mt-2.5 rounded-sharp border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ' +
                (it.severity === 'block'
                  ? 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/18'
                  : 'border-accent/35 bg-accent/10 text-accent hover:bg-accent/18')
              }
            >
              {it.cta.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function audioErrorPresentation(
  err: AudioErrorEvent,
  onRetry?: () => void,
): {
  severity: 'block' | 'warn';
  title: string;
  body: string;
  hint?: string;
  cta?: { label: string; onClick: () => void };
} {
  const cta = onRetry ? { label: 'Tentar novamente', onClick: onRetry } : undefined;

  switch (err.code) {
    case 'audio_permission':
      return {
        severity: 'block',
        title: 'Permissão de áudio negada',
        body:
          'O Windows está bloqueando o acesso ao áudio. Habilite em Configurações → Privacidade → Microfone (ou Sistema), reinicie o Auris e tente novamente.',
        hint: 'Em alguns casos é preciso reiniciar o app depois de mudar a permissão.',
        cta,
      };
    case 'no_loopback':
      return {
        severity: 'block',
        title: 'Áudio do sistema indisponível',
        body:
          'Não consegui acessar a saída de áudio do seu PC. Confira se há um dispositivo de saída ativo (alto-falante ou fone) selecionado nas configurações de som do Windows.',
        cta,
      };
    case 'sidecar_missing':
    case 'sidecar_spawn_error':
      return {
        severity: 'block',
        title: 'Falha ao iniciar o capturador de áudio',
        body:
          err.message ||
          'O processo auxiliar de áudio não pôde ser iniciado. Reinicie o Auris.',
        cta,
      };
    case 'loopback_failed':
    case 'microfone_failed':
      return {
        severity: 'warn',
        title: 'Falha temporária na captura',
        body:
          err.message ||
          'A captura de áudio falhou. Pode ter sido um conflito momentâneo com outro app.',
        cta,
      };
    default:
      return {
        severity: 'warn',
        title: `Erro de áudio · ${err.code}`,
        body: err.message,
        cta,
      };
  }
}

function llmErrorPresentation(
  raw: string,
  onDismiss?: () => void,
): {
  severity: 'block' | 'warn';
  title: string;
  body: string;
  hint?: string;
  cta?: { label: string; onClick: () => void };
} {
  const lower = raw.toLowerCase();
  const cta = onDismiss ? { label: 'OK, entendi', onClick: onDismiss } : undefined;

  // Worker rate-limit message (from `ratelimit.ts`).
  if (lower.includes('limite di') || lower.includes('rate_limit')) {
    return {
      severity: 'warn',
      title: 'Limite diário atingido',
      body: raw,
      hint: 'O contador zera às 21h (UTC reseta meia-noite). Em planos pagos esse limite some.',
      cta,
    };
  }

  // Expired Supabase JWT.
  if (lower.includes('sess') && lower.includes('expir')) {
    return {
      severity: 'block',
      title: 'Sessão expirada',
      body: 'Sua sessão expirou. Saia da conta e faça login novamente.',
      cta,
    };
  }

  // Network/Groq down.
  if (
    lower.includes('failed to reach') ||
    lower.includes('econnrefused') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('upstream_error')
  ) {
    return {
      severity: 'block',
      title: 'Sem conexão com o servidor',
      body: 'Não consegui falar com o servidor do Auris. Confira sua internet e tente de novo.',
      cta,
    };
  }

  // 401 from worker (token rejected).
  if (lower.includes('401') || lower.includes('auth_error') || lower.includes('rejected')) {
    return {
      severity: 'block',
      title: 'Autenticação rejeitada',
      body: 'O servidor recusou suas credenciais. Saia da conta e entre novamente.',
      cta,
    };
  }

  // Generic 5xx
  if (lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return {
      severity: 'warn',
      title: 'Servidor indisponível',
      body: 'O servidor está com problemas. Tenta de novo em alguns segundos.',
      cta,
    };
  }

  return {
    severity: 'warn',
    title: 'Erro inesperado',
    body: raw || 'Algo deu errado. Tenta de novo.',
    cta,
  };
}
