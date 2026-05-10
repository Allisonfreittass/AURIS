interface Props {
  messageCount: number;
  transcriptCount: number;
  /** `partial=true` keeps the last user/auris pair as carryover context. */
  onClearContext: (partial: boolean) => void;
  onExport: () => void;
}

/**
 * Slim row above the AskInput. Shows session activity + offers two
 * actions: Limpar (zeroes context + transcript) and Exportar (saves the
 * full session — transcript + Q&A — as .md).
 *
 * Visible whenever there's content, not just when there are messages —
 * users who are listening to a video without asking anything yet still
 * want to be able to export the transcript.
 *
 * Limpar takes a partial flag — Shift+click preserves the most recent
 * exchange so a follow-up still has continuity.
 */
export function ConversationToolbar({
  messageCount,
  transcriptCount,
  onClearContext,
  onExport,
}: Props) {
  if (messageCount === 0 && transcriptCount === 0) return null;
  const exchanges = Math.ceil(messageCount / 2);

  // Build a contextual summary that adapts to what we've got.
  const parts: string[] = [];
  if (exchanges > 0) {
    parts.push(`${exchanges} ${exchanges === 1 ? 'troca' : 'trocas'}`);
  }
  if (transcriptCount > 0) {
    parts.push(`${transcriptCount} ${transcriptCount === 1 ? 'trecho' : 'trechos'}`);
  }
  const summary = parts.join(' · ');

  return (
    <div className="no-drag flex items-center justify-between gap-2 px-4 pb-1 pt-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-faint">
        {summary} · ativo
      </span>
      <div className="flex items-center gap-1">
        <ToolbarButton
          onClick={onExport}
          title="Salvar transcrição + conversa como .md em Documents/Auris/sessions/ ao parar — clique aqui pra baixar uma cópia agora também"
          icon={
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M5 1v6M2.5 4.5L5 7l2.5-2.5M1.5 9h7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          }
          label="Exportar"
        />
        <ToolbarButton
          onClick={(e) => onClearContext(e.shiftKey)}
          title={
            'Apagar transcrição + conversa e zerar o contexto.\n' +
            'Shift+clique: mantém a última troca como continuação.'
          }
          icon={
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2 5a3 3 0 105.5-1.7M7.5 1v2.3H5.2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          }
          label="Limpar"
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  icon,
  label,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
    >
      {icon}
      {label}
    </button>
  );
}
