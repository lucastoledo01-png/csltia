import { getProjectById } from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { avisarFimDaProducao, type FimDaProducao, type ResultadoDosAvisos } from "./avisos";
import { depsDosAvisos } from "./supabase";

/**
 * O gancho do fim da produção das 17:00, para a rota chamar.
 *
 * Nunca lança: o aviso é o último passo de uma produção que já terminou, e a
 * falha dele não pode virar "produção falhou". Se ele se perder (projeto
 * ilegível, banco fora), o cron dos avisos manda a fila pronta a partir das
 * 17:30, pela mesma chave do dia.
 */
export async function avisarFimDaProducaoDoProjeto(
  projetoId: string,
  fim: FimDaProducao,
): Promise<ResultadoDosAvisos | null> {
  try {
    const projeto = await getProjectById(projetoId);
    if (!projeto) return null;
    const r = await avisarFimDaProducao(projeto, fim, depsDosAvisos(getSupabaseAdminClient()));
    console.log(`[AVISOS] fim da produção de ${projeto.slug}: ${JSON.stringify(r)}`);
    return r;
  } catch (e) {
    console.error(`[AVISOS] gancho do fim da produção falhou: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
