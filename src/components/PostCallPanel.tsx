import { useState } from 'react';
import { hasFollowUp } from '../../shared/ipc';
import type { PostCallReport } from '../../shared/ipc';

/** Post-call record for one call.
 *
 * Type rule: mono uppercase is chrome (section labels, the copy button);
 * everything a person reads is sans in normal case. Prose is capped at the
 * reading measure so a wide window never stretches a line past the point
 * where the eye loses its place.
 *
 * Empty sections are never blank. A call where nobody committed to anything
 * is a signal the owner wants, and a blank area reads as "not loaded" rather
 * than "nothing was agreed" — so each empty list says so in words, set apart
 * by italics and a dimmer tone instead of a divider or a filled block. */
export function PostCallPanel({ report }: { report: PostCallReport }) {
  return (
    <div className="auris-scroll flex-1 overflow-y-auto p-7">
      <div className="max-w-reading">
        <Section title="Resumo">
          {/* One flowing paragraph. The model returns sentences separated by
              newlines; rendering those as hard breaks made five equal-weight
              lines that read as neither prose nor list. */}
          <p className="text-[15px] leading-[1.6] text-primary">
            {report.resumo.split(/\n+/).map((s) => s.trim()).filter(Boolean).join(' ')}
          </p>
        </Section>

        <Section title="Próximos passos" divided={report.proximos_passos.length > 0}>
          {report.proximos_passos.length === 0 ? (
            <Empty>Nenhum próximo passo foi definido nessa call.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {report.proximos_passos.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <Bullet />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] leading-[1.5] text-primary">
                      {step.acao}
                    </span>
                    <span className="chrome text-label">
                      {step.responsavel === 'nos' ? 'nosso' : 'cliente'}
                      {step.prazo && ` · ${step.prazo}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Objeções" divided={report.objecoes.length > 0}>
          {report.objecoes.length === 0 ? (
            <Empty>Nenhuma objeção registrada.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {report.objecoes.map((o, i) => (
                <li key={i} className="flex gap-2.5">
                  <Bullet />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[15px] leading-[1.5] text-primary">
                      {o.objecao}
                    </span>
                    {o.resposta_dada ? (
                      <span className="text-[13px] leading-[1.5] text-secondary">
                        {o.resposta_dada}
                      </span>
                    ) : (
                      <span className="text-[13px] italic leading-[1.5] text-muted">
                        Não foi respondida na call.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Follow-up" divided={hasFollowUp(report.follow_up)}>
          {!hasFollowUp(report.follow_up) ? (
            <Empty>Não há o que enviar depois dessa call.</Empty>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-elevated p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="text-[15px] font-medium leading-[1.4] text-primary">
                    {report.follow_up.assunto}
                  </span>
                  <CopyEmailButton
                    text={`${report.follow_up.assunto}\n\n${report.follow_up.corpo}`}
                  />
                </div>
                <p className="whitespace-pre-line text-[15px] leading-[1.6] text-primary">
                  {report.follow_up.corpo}
                </p>
                {report.follow_up.traducao_pt && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <div className="eyebrow mb-1.5">Tradução · referência</div>
                    <p className="whitespace-pre-line text-[13px] leading-[1.6] text-secondary">
                      {report.follow_up.traducao_pt}
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[13px] leading-[1.5] text-secondary">
                O Auris nunca envia esse e-mail. Copie e envie você mesmo.
              </p>
            </>
          )}
        </Section>

        {/* Duration and language live in the screen header now. What belongs
            here is only the caveat that changes how the report above should
            be read. */}
        {(report.meta.truncated || report.meta.channels.includes('mixed')) && (
          <p className="mt-7 border-t border-hairline pt-3 text-[13px] leading-[1.5] text-secondary">
            {report.meta.truncated &&
              'A transcrição era longa demais e só o trecho final foi analisado. '}
            {report.meta.channels.includes('mixed') &&
              'Essa call foi gravada sem separação de canal, então não dá para saber quem disse o quê.'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Copy with inline confirmation. Local UI state only — nothing about what
 *  gets copied or when changes. */
function CopyEmailButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="chrome shrink-0 rounded-sharp border border-border px-2 py-1 text-label transition-colors hover:bg-border/60 hover:text-primary"
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Bullet() {
  return (
    <span
      aria-hidden="true"
      className="mt-[9px] h-px w-2 shrink-0 bg-label"
    />
  );
}

function Section({
  title,
  divided,
  children,
}: {
  title: string;
  divided?: boolean;
  children: React.ReactNode;
}) {
  return (
    // A rule above an empty state would frame the absence as if it were
    // content. Sections that report nothing get the spacing but not the line.
    <section
      className={`first:mt-0 ${divided ? 'mt-7 border-t border-hairline pt-7' : 'mt-7'}`}
    >
      <div className="eyebrow mb-2.5">{title}</div>
      {children}
    </section>
  );
}

/** Absence, not content: italic, dimmer, no divider above it and no filled
 *  block around it. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14px] italic leading-[1.5] text-muted">{children}</p>
  );
}
