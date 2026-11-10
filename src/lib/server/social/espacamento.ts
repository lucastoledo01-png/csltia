/*
 * Dois posts nunca saem colados no feed (10/11/2026).
 *
 * Medido em 09 e 10/11/2026: o post aprovado depois do horário dele saía na
 * hora da aprovação (23:04), onze minutos antes do seguinte (23:15); e dois
 * Reels de 10/11 foram aprovados para o MESMO horário, 18:07, e saíram com um
 * segundo de diferença. A escolha da vaga já respeita 45 minutos
 * (`vagasDaTarde`), mas a liberação da fila não perguntava nada: ela punha o
 * post no horário planejado, ou agora, sem olhar o que já estava agendado.
 *
 * A regra mora aqui e vale na liberação, que é a porta por onde TODO post
 * passa (plano, complemento, Reel, peça feita à mão no chat): o horário é o
 * planejado, ou agora se ele passou, e é empurrado para depois enquanto
 * estiver a menos de 45 minutos de outro post agendado ou publicado. Rascunho
 * não conta, porque pode nunca ser aprovado.
 */
export const ESPACAMENTO_MINIMO_MINUTOS = 45;

export function horarioSemColar(entrada: {
  planejadoMs: number | null;
  agoraMs: number;
  /** Instantes dos OUTROS posts agendados ou publicados. */
  ocupadosMs: number[];
  espacamentoMinutos?: number;
}): number {
  const espacamento = (entrada.espacamentoMinutos ?? ESPACAMENTO_MINIMO_MINUTOS) * 60_000;
  const base = entrada.planejadoMs !== null && Number.isFinite(entrada.planejadoMs) ? entrada.planejadoMs : entrada.agoraMs;
  let t = Math.max(base, entrada.agoraMs);
  const ocupados = entrada.ocupadosMs.filter((o) => Number.isFinite(o)).sort((a, b) => a - b);
  // Cada volta empurra para depois de um post; com N posts, N voltas bastam.
  for (let i = 0; i <= ocupados.length; i++) {
    const colado = ocupados.find((o) => Math.abs(o - t) < espacamento);
    if (colado === undefined) return t;
    t = colado + espacamento;
  }
  return t;
}
