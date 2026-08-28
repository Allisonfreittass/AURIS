import { useEffect, useState } from 'react';
import { Conversation, type Message } from './Conversation';
import { CopyButton } from './CopyButton';
import { PostCallPanel } from './PostCallPanel';
import { auris } from '../lib/ipc';
import { hasFollowUp } from '../../shared/ipc';
import type { SessionSummary, StoredSession } from '../../shared/ipc';
import { toMillis } from '../../shared/time';

type DetailView = 'registro' | 'transcricao';

/** Browser for recorded calls. Lists them in the left rail; selecting one
 *  shows its post-call record, or the raw transcript and Q&A when there is
 *  no record yet. Generating the record is on demand here — the automatic
 *  trigger belongs to the explicit "encerrar call" lifecycle. */
export function HistoryScreen() {
  const [list, setList] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [view, setView] = useState<DetailView>('registro');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

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
    setGenError(null);
    auris
      .getSession(selectedId)
      .then((s) => {
        setSession(s);
        setView(s?.report ? 'registro' : 'transcricao');
      })
      .catch(() => setSession(null))
      .finally(() => setSessionLoading(false));
  }, [selectedId]);

  async function handleGenerate(id: string) {
    setGenerating(true);
    setGenError(null);
    try {
      const result = await auris.generatePostCall(id);
      if (result.ok) {
        setSession((prev) => (prev && prev.id === id ? { ...prev, report: result.report } : prev));
        setView('registro');
        await refresh();
      } else {
        setGenError(result.error);
      }
    } catch (err) {
      setGenError((err as Error).message ?? 'Falha ao gerar o registro.');
    } finally {
      setGenerating(false);
    }
  }

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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-4 py-3">
          <span className="eyebrow">Minhas calls</span>
          <span className="chrome text-label">{loading ? '…' : `${list.length}`}</span>
        </div>
        {loading ? (
          <div className="chrome px-4 py-6 text-center text-label">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="px-4 py-6 text-[14px] italic leading-[1.5] text-muted">
            Nenhuma call registrada ainda. As calls que você escutar ficam
            salvas aqui automaticamente.
          </div>
        ) : (
          <ul className="flex flex-col">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  aria-current={selectedId === s.id ? 'true' : undefined}
                  className={`flex w-full flex-col items-start gap-1.5 border-b border-hairline py-3 pr-4 text-left transition-colors ${
                    selectedId === s.id
                      ? 'border-l-2 border-l-accent bg-elevated pl-[14px]'
                      : 'border-l-2 border-l-transparent pl-[14px] hover:bg-elevated/50'
                  }`}
                >
                  <span className="chrome text-label">{formatStamp(s.startedAt)}</span>
                  <span className="line-clamp-2 text-[14px] leading-[1.45] text-primary">
                    {s.preview || (
                      <span className="italic text-muted">sem conteúdo</span>
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
            <span className="text-[14px] italic text-muted">
              Selecione uma call à esquerda.
            </span>
          </div>
        ) : sessionLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="chrome text-label">Carregando call…</span>
          </div>
        ) : session === null ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <span className="text-[14px] text-danger">
              Não foi possível carregar essa call.
            </span>
          </div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-border bg-surface px-7 pb-0 pt-5">
              <div className="flex min-w-0 flex-col">
                <h2 className="text-[17px] font-semibold leading-[1.3] text-primary">
                  {formatStamp(session.startedAt)}
                </h2>
                {/* One line, not three. Duration and language live here now
                    instead of in a cramped footer under the report. */}
                <span className="chrome mt-1 truncate text-label">
                  {describeCall(session)}
                </span>
                {session.report ? (
                  <div className="-mb-px mt-4 flex gap-5">
                    {(['registro', 'transcricao'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        aria-pressed={view === v}
                        className={`chrome border-b-2 pb-2 transition-colors ${
                          view === v
                            ? 'border-accent text-primary'
                            : 'border-transparent text-label hover:text-secondary'
                        }`}
                      >
                        {v === 'registro' ? 'Registro' : 'Transcrição'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-4" />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {!session.report && session.transcripts.length > 0 && (
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void handleGenerate(session.id)}
                    className="chrome mr-1 rounded-sharp bg-accent px-2.5 py-1.5 text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating ? 'Gerando…' : 'Gerar registro'}
                  </button>
                )}
                <CopyButton
                  text={renderAsMarkdown(session)}
                  title="Copiar como Markdown"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Excluir essa call do histórico?')) {
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
            {genError && (
              <div className="border-b border-border bg-danger/10 px-7 py-2.5 text-[14px] leading-[1.5] text-danger">
                {genError}
              </div>
            )}
            {session.report && view === 'registro' ? (
              <PostCallPanel report={session.report} />
            ) : messages.length > 0 && view !== 'transcricao' ? (
              <Conversation messages={messages} />
            ) : session.transcripts.length > 0 ? (
              <div className="auris-scroll flex-1 overflow-y-auto px-7 py-6">
                <div className="max-w-reading">
                  <div className="eyebrow mb-3">Transcrição</div>
                  <div className="flex flex-col gap-2.5">
                    {session.transcripts.map((t, i) => (
                      <p key={i} className="text-[15px] leading-[1.6] text-primary">
                        {t.channel && t.channel !== 'mixed' && (
                          <span className="chrome mr-2 align-[0.1em] text-label">
                            {t.channel}
                          </span>
                        )}
                        {t.text}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6">
                <span className="text-[14px] italic text-muted">Call vazia.</span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** The call's identity line: duration, size, language — in that order, on
 *  one line. Pure formatting over what is already stored. */
function describeCall(s: StoredSession): string {
  const parts: string[] = [];

  const stamps = s.transcripts.map((t) => toMillis(t.ts, 0)).filter((n) => n > 0);
  const durationSec =
    s.report?.meta.durationSec ??
    (stamps.length >= 2
      ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 1000)
      : 0);
  if (durationSec > 0) parts.push(formatDuration(durationSec));

  parts.push(
    s.transcripts.length === 1 ? '1 transcrição' : `${s.transcripts.length} transcrições`,
  );

  const lang = s.report?.meta.lang;
  if (lang) parts.push(lang);

  return parts.join(' · ');
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return `${sec}s`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
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

  if (s.report) {
    const r = s.report;
    lines.push('## Registro pós-call', '', '### Resumo', '', r.resumo, '');

    lines.push('### Próximos passos', '');
    if (r.proximos_passos.length === 0) {
      lines.push('Nenhum próximo passo foi definido nessa call.', '');
    } else {
      for (const step of r.proximos_passos) {
        const quem = step.responsavel === 'nos' ? 'nosso' : 'cliente';
        const prazo = step.prazo ? ` — prazo: ${step.prazo}` : '';
        lines.push(`- **[${quem}]** ${step.acao}${prazo}`);
      }
      lines.push('');
    }

    lines.push('### Objeções', '');
    if (r.objecoes.length === 0) {
      lines.push('Nenhuma objeção registrada.', '');
    } else {
      for (const o of r.objecoes) {
        lines.push(`- ${o.objecao}`);
        lines.push(
          `  - Resposta dada: ${o.resposta_dada ?? '_não foi respondida na call_'}`,
        );
      }
      lines.push('');
    }

    lines.push('### Follow-up', '');
    if (!hasFollowUp(r.follow_up)) {
      lines.push('Não há o que enviar depois dessa call.', '');
    } else {
      lines.push(`**${r.follow_up.assunto}**`, '', r.follow_up.corpo, '');
      if (r.follow_up.traducao_pt) {
        lines.push('_Tradução (referência):_', '', r.follow_up.traducao_pt, '');
      }
    }
    lines.push('---', '');
  }

  if (s.transcripts.length > 0) {
    lines.push('## Transcrição do áudio', '');
    for (const t of s.transcripts) {
      const time = new Date(toMillis(t.ts)).toLocaleTimeString('pt-BR');
      const langTag = t.lang
        ? t.translated
          ? ` _[${t.lang} → traduzido]_`
          : ` _[${t.lang}]_`
        : '';
      const who = t.channel && t.channel !== 'mixed' ? ` **[${t.channel}]**` : '';
      lines.push(`- **${time}**${langTag}${who} ${t.text}`);
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
