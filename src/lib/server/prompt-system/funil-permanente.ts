import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import { createAutomation } from "./openreply-client";

/**
 * Funil permanente: uma keyword que vale para todos os posts do projeto.
 *
 * O Sistema PROMPT nasceu com um modelo de um post, uma campanha, uma
 * keyword: cada carrossel tinha a sua palavra e o seu material. O funil de
 * análise de perfil inverte isso. A palavra é sempre a mesma, aparece em toda
 * publicação, e leva sempre ao mesmo destino externo.
 *
 * Duas consequências que este módulo existe para resolver:
 *
 * 1. **A notícia não nasce de campanha.** O agendador da redação cria a vaga a
 *    partir da pauta do dia, sem campanha nenhuma. Sem uma campanha marcada
 *    como permanente, o worker não teria como saber qual copy usar.
 *
 * 2. **A automação do OpenReply é por post.** O contrato exige `postId`, então
 *    cada publicação precisa da sua. Não existe automação de conta inteira.
 *    Isso significa criar uma automação nova a cada post, todas com a mesma
 *    palavra, o que é justamente o que a checagem de colisão de keyword
 *    impedia.
 *
 * Nada aqui lança. O post já está no ar e não se desfaz; falha na automação
 * deixa o post publicado e o erro registrado.
 */

export type ResultadoDoFunil = {
  ligado: boolean;
  keyword?: string;
  automationId?: string;
  criadaAgora?: boolean;
  motivo?: string;
};

type CampanhaPermanente = {
  id: string;
  keyword: string;
  dm_message: string | null;
  opening_dm_message: string | null;
  destination_url: string | null;
  openreply_automation_id: string | null;
  follow_up_enabled: boolean | null;
  follow_up_delay_minutes: number | null;
  follow_up_message: string | null;
};

/** A campanha marcada como permanente do projeto, se houver. */
export async function carregarFunilPermanente(
  projectId = DEFAULT_PROJECT_ID,
): Promise<CampanhaPermanente | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select(
      "id, keyword, dm_message, opening_dm_message, destination_url, openreply_automation_id, " +
        "follow_up_enabled, follow_up_delay_minutes, follow_up_message",
    )
    .eq("project_id", projectId)
    .eq("is_evergreen", true)
    .maybeSingle();

  if (error || !data) return null;

  // Passa por `unknown`: `destination_url` e `is_evergreen` são colunas novas
  // e os tipos gerados do Supabase ainda não as conhecem.
  return data as unknown as CampanhaPermanente;
}

/**
 * Garante que a automação do funil permanente existe. Idempotente.
 *
 * Chamada a cada publicação, mas só fala com o OpenReply na primeira vez: a
 * automação vale para qualquer post, então não há nada a criar depois. As
 * chamadas seguintes leem uma linha do banco e saem.
 */
export async function garantirFunilPermanente(
  projectId = DEFAULT_PROJECT_ID,
): Promise<ResultadoDoFunil> {
  try {
    const campanha = await carregarFunilPermanente(projectId);
    if (!campanha) return { ligado: false, motivo: "Projeto sem funil permanente." };

    if (campanha.openreply_automation_id) {
      return {
        ligado: true,
        keyword: campanha.keyword,
        automationId: campanha.openreply_automation_id,
        criadaAgora: false,
      };
    }

    const destino = (campanha.destination_url ?? "").trim();
    const dm = (campanha.dm_message ?? "").trim();
    const abertura = (campanha.opening_dm_message ?? "").trim();

    if (!destino) return { ligado: false, keyword: campanha.keyword, motivo: "Campanha sem destino." };
    if (!dm || !abertura) {
      return { ligado: false, keyword: campanha.keyword, motivo: "Copy do Direct incompleta." };
    }

    /*
     * Sem `postId`: o OpenReply cria com `matchAnyPost`, e a palavra passa a
     * valer em toda publicação do perfil.
     *
     * A alternativa seria uma automação por post, com a mesma palavra. Não
     * funciona: a checagem de colisão de keyword recusa a segunda, e cada post
     * novo exigiria mais uma chamada. Uma automação só, criada uma vez, cobre
     * o que já foi publicado e o que ainda vai ser.
     */
    const r = await createAutomation({
      keyword: campanha.keyword,
      dmMessage: dm,
      openingDmMessage: abertura,
      trackedLink: { slug: campanha.keyword.toLowerCase(), destinationUrl: destino },
      followUp: campanha.follow_up_enabled
        ? {
            enabled: true,
            delayMinutes: campanha.follow_up_delay_minutes ?? 10,
            message: campanha.follow_up_message ?? "",
          }
        : undefined,
    });

    const supabase = getSupabaseAdminClient();
    await supabase
      .from("prompt_campaigns")
      .update({
        openreply_automation_id: r.automationId,
        lp_url: r.trackedLinkUrl,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    return {
      ligado: true,
      keyword: campanha.keyword,
      automationId: r.automationId,
      criadaAgora: true,
    };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.warn(`[FUNIL] ${motivo}`);
    return { ligado: false, motivo };
  }
}
