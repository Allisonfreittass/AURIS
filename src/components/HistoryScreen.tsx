import { useEffect, useState } from 'react';
import { Conversation, type Message } from './Conversation';
import { CopyButton } from './CopyButton';
import { auris } from '../lib/ipc';
import type { SessionSummary, StoredSession } from '../../shared/ipc';

/** Read-only browser for previously auto-saved sessions. Lists summaries
 *  in the left rail; selecting one renders the full Q&A on the right
 *  using the same Conversation component as the live overlay. */
export function HistoryScreen() {
  const [list, setList] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const items = await auris.listSessions();
      setList(items);
      // Auto-select the newest entry so the right pane isn't empty.
      if (items.length > 0 && selectedId === null) {
        setSelectedId(items[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId === null) {
      setSession(null);
      return;
    }
    setSessionLoading(true);
    auris
      .getSession(selectedId)
      .then((s) => setSession(s))
      .catch(() => setSession(null))
      .finally(() => setSessionLoading(false));
  }, [selectedId]);

  async function handleDelete(id: string) {
    await auris.deleteSession(id);
    if (selectedId === id) {
      setSelectedId(null);
      setSession(null);
    }
    await refresh();
  }

  const messages: Message[] = session
    ? session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        ts: m.ts,
        error: m.error,
      }))
    : [];

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left rail: list of sessions */}
      <aside className="auris-scroll flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-3 py-2.5">
          <span className="eyebrow">Histórico</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
            {loading ? '…' : `${list.length}`}
          </span>
        </div>
        {loading ? (
          <div className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted">
            Carregando…
          </div>
        ) : list.length === 0 ? (
          <div className="px-3 py-6 text-center font-sans text-[12px] leading-relaxed text-muted">
            Nenhuma sessão salva ainda.
            <br />
            Conversas com Auris ficam salvas aqui automaticamente.
          </div>
        ) : (
          <ul className="flex flex-col">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-elevated ${
                    selectedId === s.id ? 'bg-elevated' : ''
                  }`}
                >
                  <div className="flex w-full items-baseline justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
                      {formatStamp(s.startedAt)}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider text-faint">
                      {s.messageCount > 0 && `${s.messageCount}m`}
                      {s.messageCount > 0 && s.transcriptCount > 0 && ' · '}
                      {s.transcriptCount > 0 && `${s.transcriptCount}t`}
                    </span>
                  </div>
                  <span className="line-clamp-2 font-sans text-[12px] leading-snug text-light">
                    {s.preview || (
                      <span className="italic text-muted">sem preview</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Right pane: selected session */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedId === null ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <span className="font-sans text-[12px] text-muted">
              Selecione uma sessão à esquerda.
            </span>
          </div>
        ) : sessionLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Carregando sessão…
            </span>
          </div>
        ) : session === null ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <span className="font-sans text-[12px] text-danger">
              Não foi possível carregar essa sessão.
            </span>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
                  Sessão · {formatStamp(session.startedAt)}
                </span>
                <span className="font-sans text-[12px] text-text">
                  {session.messages.length} mensagens · {session.transcripts.length}{' '}
                  transcrições
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CopyButton
                  text={renderAsMarkdown(session)}
                  title="Copiar como Markdown"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Excluir essa sessão do histórico?')) {
                      void handleDelete(session.id);
                    }
                  }}
                  aria-label="Excluir sessão"
                  title="Excluir sessão"
                  className="grid h-5 w-5 place-items-center rounded-sharp text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                    <path
                      d="M2.5 3h6M4.5 3V2a1 1 0 011-1h0a1 1 0 011 1v1M3.5 3l.5 6.5h3l.5-6.5"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
            </header>
            {messages.length > 0 ? (
              <Conversation messages={messages} />
            ) : session.transcripts.length > 0 ? (
              <div className="auris-scroll flex-1 overflow-y-auto px-5 py-4">
                <div className="eyebrow mb-3">Transcrição</div>
                <div className="flex flex-col gap-1.5 font-sans text-[12.5px] leading-relaxed text-light">
                  {session.transcripts.map((t, i) => (
                    <p key={i}>{t.text}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6">
                <span className="font-sans text-[12px] text-muted">
                  Sessão vazia.
                </span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function formatStamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Hoje · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) {
    return `Ontem · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Same Markdown shape used by the live "Exportar" toolbar, replayed
 *  from stored state. Allows the copy button to feed the user something
 *  paste-ready. */
function renderAsMarkdown(s: StoredSession): string {
  const stamp = new Date(s.startedAt).toLocaleString('pt-BR');
  const lines: string[] = [
    '# Sessão Auris',
    '',
    `_Iniciada em ${stamp}_`,
    '',
    '---',
    '',
  ];

  if (s.transcripts.length > 0) {
    lines.push('## Transcrição do áudio', '');
    for (const t of s.transcripts) {
      const time = new Date(t.ts).toLocaleTimeString('pt-BR');
      const langTag = t.lang
        ? t.translated
          ? ` _[${t.lang} → traduzido]_`
          : ` _[${t.lang}]_`
        : '';
      lines.push(`- **${time}**${langTag} ${t.text}`);
    }
    lines.push('');
  }

  if (s.messages.length > 0) {
    lines.push('## Conversa com Auris', '');
    for (const m of s.messages) {
      const t = new Date(m.ts).toLocaleTimeString('pt-BR');
      if (m.role === 'user') {
        lines.push(`**Você** · ${t}`, '', m.text);
      } else if (m.role === 'detected') {
        lines.push(`**Pergunta detectada no áudio** · ${t}`, '', `> ${m.text}`);
      } else {
        lines.push(`**Auris** · ${t}`, '', m.text || (m.error ? `_erro: ${m.error}_` : ''));
      }
      lines.push('', '');
    }
  }

  return lines.join('\n');
}
