/**
 * User-message template for post-call report generation.
 *
 * v2 lets `follow_up` come back empty. v1 always wrote an email, and on a
 * call where nothing was agreed that produced a polite, contentless "let's
 * schedule another meeting" — the kind of output that teaches a seller to
 * stop trusting the tool.
 *
 * `sugestao` (a "better answer you could have given") was deliberately cut
 * from v1. The instruction that would have bounded it — "only when the
 * conversation gives you a basis" — is the kind of constraint a model
 * rationalizes around, and the failure is silent: the seller carries an
 * invented argument into the next call. Revisit once there are real
 * transcripts to test it against.
 */
export const REPORT_PROMPT_VERSION = 2;

export interface ReportPromptVars {
  /** ISO-639-1 code detected for the call, or 'desconhecido'. */
  idioma: string;
  /** Channel-tagged transcript, one line per final. */
  transcricao: string;
}

export function buildReportPrompt(vars: ReportPromptVars): string {
  return `A transcrição está etiquetada por canal. [vendedor] é quem usava o Auris; [cliente] é o outro lado da chamada.

<transcricao idioma="${vars.idioma}">
${vars.transcricao}
</transcricao>

Produza um JSON com exatamente estes campos:

resumo: string
  5 a 8 linhas em português, sempre — mesmo que a call tenha sido em outro
  idioma. O que foi tratado e onde a conversa parou. Não comece com
  "nesta reunião" nem recapitule o óbvio.

proximos_passos: array de { acao, responsavel, prazo }
  responsavel é "nos" ou "cliente". Só ações que alguém de fato assumiu.
  prazo só quando foi dito em voz alta ("semana que vem", "dia 10");
  caso contrário null. Array vazio se ninguém assumiu nada.

objecoes: array de { objecao, resposta_dada }
  Só resistências levantadas pelo cliente: preço, prazo, concorrente,
  autoridade, necessidade. resposta_dada é o que o vendedor efetivamente
  respondeu, ou null se ele não respondeu. Registre o que aconteceu; não
  proponha o que ele deveria ter dito.

follow_up: { assunto, corpo }
  E-mail curto que o vendedor envia depois, no idioma da call. Retoma o
  que foi combinado e propõe o próximo passo concreto. Sem saudação longa,
  sem assinatura, sem "espero que esteja bem".

  Se nada foi combinado e não há próximo passo concreto a propor, devolva
  assunto e corpo como string vazia. Não invente um motivo para escrever:
  um e-mail que apenas sugere "vamos marcar uma nova reunião" não carrega
  informação, e mandar isso gasta a credibilidade de quem assina.`;
}
