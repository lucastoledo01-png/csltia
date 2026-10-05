import { resolverCapacidade } from "../capacidades";
import type { EstadoDaCapacidade, ProjetoComCapacidades } from "../capacidades";

/**
 * Em que estado rodam os três ramos independentes.
 *
 * Decisão do dono em 05/10/2026: a newsletter deixa de ser a mãe dos outros
 * canais. Até aqui ela compunha primeiro, o portal regravava o e-mail como
 * artigo, e o agendador legado do Instagram fazia um post por pauta da edição.
 * Daqui em diante o que é COMUM aos três é coleta, classificação, pacote
 * factual e resolução de imagem; seleção, redação, auditor, arte e fila são de
 * cada ramo.
 *
 *   off       o fluxo de antes, byte a byte. É o padrão.
 *   dry_run   os ramos novos rodam e gravam diagnóstico, e quem publica é o
 *             fluxo de antes. Custa as chamadas de redação do artigo.
 *   enforce   os ramos novos decidem o que cada canal publica.
 *
 * Não declarado cai no ambiente (`EDITORIAL_RAMOS`), e o ambiente sem valor é
 * `off`. É o contrato de `capacidades.ts`: subir este código não muda o ciclo
 * de amanhã. Quem liga é `settings.capacidades.ramos` no projeto.
 */
export type ModoDosRamos = EstadoDaCapacidade;

export function modoDosRamos(
  env: Record<string, string | undefined> = process.env,
  projeto?: ProjetoComCapacidades | null,
): ModoDosRamos {
  return resolverCapacidade("ramos", () => doAmbiente(env), projeto);
}

function doAmbiente(env: Record<string, string | undefined>): ModoDosRamos {
  const bruto = (env.EDITORIAL_RAMOS || "").trim().toLowerCase();
  if (bruto === "enforce") return "enforce";
  if (bruto === "dry_run") return "dry_run";
  // Ausente ou irreconhecível: desligado. Erro de digitação não liga ramo.
  return "off";
}
