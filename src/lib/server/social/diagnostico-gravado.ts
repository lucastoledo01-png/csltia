import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoDoSocialDoDia } from "./ciclo-do-dia";

/**
 * O diagnóstico do social do dia, gravado no banco.
 *
 * Até 29/09/2026 ele existia inteiro e ia para dois lugares: a resposta HTTP
 * de `runNewsroom`, que o cron não guarda, e o `console.log` de um contêiner
 * que o usuário `deploy` não alcança. Resultado medido: em 23, 24, 26 e 28/09 o
 * feed saiu sem post de notícia, o evergreen parou de produzir depois de 22/09,
 * e a única marca no banco era o veredito do verificador, espalhado em
 * `news_candidates`. A causa (o verificador ainda julgava pela régua de
 * imigração) levou uma investigação inteira para aparecer, e o motivo do
 * evergreen continua desconhecido porque ninguém o gravou.
 *
 * `platform_events` foi escolhida porque já tem `event_type`, `payload` jsonb
 * e `project_id`: não pede DDL, que aqui só o dono roda. As listas são
 * cortadas, porque o objetivo é dizer POR QUE, e para isso vinte exemplos
 * bastam; o resto vai na contagem.
 */

export const EVENTO_DO_SOCIAL = "social_cycle_diagnostic";

const MAX_ITENS = 20;
const MAX_TEXTO = 240;

const cortar = (s: string) => (s.length > MAX_TEXTO ? `${s.slice(0, MAX_TEXTO - 1)}…` : s);

export function montarRegistroDoSocial(
  resultado: Pick<ResultadoDoSocialDoDia, "diagnostico" | "ciclo" | "conferencia">,
  contexto: { editionDate: string; dryRun: boolean },
) {
  const { diagnostico, ciclo, conferencia } = resultado;

  return {
    editionDate: contexto.editionDate,
    dryRun: contexto.dryRun,
    diagnostico,
    recusadas: (conferencia?.recusadas ?? []).slice(0, MAX_ITENS).map((r) => ({
      storyId: r.pauta.storyId,
      titulo: cortar(r.pauta.grupo.primary.title ?? ""),
      motivo: cortar(r.motivo),
    })),
    emConflito: (conferencia?.emConflito ?? []).slice(0, MAX_ITENS).map((r) => ({
      storyId: r.pauta.storyId,
      titulo: cortar(r.pauta.grupo.primary.title ?? ""),
      motivo: cortar(r.motivo),
    })),
    descartados: (ciclo?.descartados ?? []).slice(0, MAX_ITENS).map((d) => ({
      storyId: d.storyId,
      etapa: d.etapa,
      titulo: cortar(d.titulo),
      motivo: cortar(d.motivo),
    })),
  };
}

/**
 * Grava, e nunca derruba o ciclo.
 *
 * Falhar aqui não pode custar o post nem a newsletter: devolve o motivo para
 * quem chamou registrar no log, que é o que existia antes.
 */
export async function gravarDiagnosticoDoSocial(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  registro: ReturnType<typeof montarRegistroDoSocial>,
): Promise<string | null> {
  try {
    const { error } = await client
      .from("platform_events")
      .insert({ event_type: EVENTO_DO_SOCIAL, project_id: projectId, payload: registro });
    return error ? error.message : null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
