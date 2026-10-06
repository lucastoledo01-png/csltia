import type { SupabaseClient } from "@supabase/supabase-js";
import { avisarCandidatasNaoGravadas, type CandidatasNaoGravadas } from "./avisos";
import { depsDosAvisos } from "./supabase";

/**
 * O aviso de candidatas não gravadas contra o banco e o Telegram de verdade.
 *
 * Nunca lança: o aviso é o último passo de um ciclo que já gravou os posts, e
 * a falha dele não pode virar "o Instagram falhou". O desfecho do envio fica
 * em `platform_events` pelo registro dos avisos, como o dos outros.
 */
export async function avisarCandidatasNaoGravadasNoBanco(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  falha: CandidatasNaoGravadas,
): Promise<boolean> {
  try {
    const enviado = await avisarCandidatasNaoGravadas({ id: projectId }, falha, depsDosAvisos(client));
    console.log(`[AVISOS] candidatas não gravadas em ${falha.dia}: ${enviado ? "aviso enviado" : "aviso não enviado"}`);
    return enviado;
  } catch (e) {
    console.error(`[AVISOS] aviso de candidatas não gravadas falhou: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
