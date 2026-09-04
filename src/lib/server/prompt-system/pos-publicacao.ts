import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import { publishCampaignToOpenReply } from "./service";
import { recordFunnelEvent } from "./landing";

/**
 * Fecha a campanha assim que o post vai ao ar.
 *
 * Isto existe para corrigir uma inversão de ordem no desenho original: o
 * painel pedia o **ID da mídia do Instagram** como campo obrigatório antes de
 * criar a automação — mas esse ID só passa a existir depois da publicação.
 * Preenchê-lo à mão exigia publicar primeiro, copiar o ID do Instagram e
 * voltar ao painel, o que não é fluxo, é contorção.
 *
 * A ordem certa é a que o sistema já segue naturalmente:
 *
 *   campanha → imagens e prompts → post agendado → **publicado** → automação
 *
 * O worker tem o `mediaId` em mãos no instante em que publica. É o único
 * momento em que ninguém precisa procurar esse número em lugar nenhum.
 *
 * Nada aqui lança: a publicação já aconteceu e não se desfaz. Falha na criação
 * da automação deixa a campanha com o `ig_media_id` gravado e status `ready`,
 * pronta para o botão do painel — que passa a ser retentativa, não etapa
 * obrigatória.
 */

/**
 * Copy do Direct (etapa 9), montada da campanha.
 *
 * Determinística e sem LLM: são duas frases curtas cuja única variável é a
 * keyword. Um modelo aqui acrescentaria custo, latência e variação num texto
 * que a pessoa lê uma vez e cuja função é entregar um link.
 *
 * Só preenche o que está vazio — copy escrita à mão no painel sempre vence.
 */
export function montarCopyDoDirect(keyword: string, tema?: string): {
  openingDmMessage: string;
  dmMessage: string;
} {
  const assunto = (tema ?? "").trim();

  return {
    openingDmMessage:
      `achei você 👀 vi que comentou ${keyword}. ` +
      `toque no botão aqui embaixo que eu te mando o material.`,
    dmMessage:
      `é esse aqui 👇 os prompts exatos${assunto ? ` de ${assunto}` : ""}, ` +
      `com o que trocar para adaptar ao seu caso. bom proveito.`,
  };
}

export type ResultadoPosPublicacao = {
  campaignId: string;
  automacaoCriada: boolean;
  erro?: string;
};

export async function concluirCampanhaPublicada(
  campaignId: string,
  mediaId: string,
  projectId = DEFAULT_PROJECT_ID,
): Promise<ResultadoPosPublicacao> {
  const supabase = getSupabaseAdminClient();

  try {
    const { data: campanha } = await supabase
      .from("prompt_campaigns")
      .select("id, keyword, theme, status, dm_message, opening_dm_message, openreply_automation_id")
      .eq("id", campaignId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (!campanha) {
      return { campaignId, automacaoCriada: false, erro: "Campanha não encontrada." };
    }

    // Automação já existe: o post foi republicado ou o worker reprocessou a
    // vaga. Atualizar o media id e sair é o certo — criar uma segunda
    // automação na mesma keyword faria o worker do OpenReply escolher uma
    // arbitrariamente, e a outra pararia de entregar em silêncio.
    if (campanha.openreply_automation_id) {
      await supabase
        .from("prompt_campaigns")
        .update({ ig_media_id: mediaId })
        .eq("id", campaignId);

      await recordFunnelEvent(campaignId, "publish", { mediaId, reaproveitada: true });
      return { campaignId, automacaoCriada: false, erro: "Automação já existia." };
    }

    const padrao = montarCopyDoDirect(String(campanha.keyword), String(campanha.theme ?? ""));

    // `publishCampaignToOpenReply` exige media id, as duas mensagens e status
    // `ready`. Preencher aqui é o que dispensa o preenchimento manual.
    const { error: erroUpdate } = await supabase
      .from("prompt_campaigns")
      .update({
        ig_media_id: mediaId,
        dm_message: String(campanha.dm_message ?? "").trim() || padrao.dmMessage,
        opening_dm_message:
          String(campanha.opening_dm_message ?? "").trim() || padrao.openingDmMessage,
        status: "ready",
      })
      .eq("id", campaignId)
      .eq("project_id", projectId);

    if (erroUpdate) throw new Error(erroUpdate.message);

    await recordFunnelEvent(campaignId, "publish", { mediaId });

    await publishCampaignToOpenReply(campaignId, projectId);

    return { campaignId, automacaoCriada: true };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    console.warn(`[POS-PUBLICACAO] Campanha ${campaignId}: ${erro}`);

    // A campanha fica com media id e status `ready`, então o botão do painel
    // vira retentativa em vez de etapa obrigatória.
    return { campaignId, automacaoCriada: false, erro };
  }
}
