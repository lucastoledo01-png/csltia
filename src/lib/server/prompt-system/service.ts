import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../projects";
import {
  CreateManualCampaignInput,
  PROMPT_CAMPAIGN_COLUMNS,
  PromptCampaign,
  UpdateCampaignDmCopyInput,
  toPromptCampaign,
} from "./schemas";
import { createAutomation, isKeywordAvailableOnOpenReply } from "./openreply-client";

/**
 * Checa se a keyword está livre pro projeto — mesma regra de unicidade dupla
 * prevista na etapa 7 (aqui só o lado csltia; o lado OpenReply entra na
 * Fase 1, quando `openreply_automation_id` passa a ser preenchido).
 */
export async function isKeywordAvailable(keyword: string, projectId = DEFAULT_PROJECT_ID): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select("id")
    .eq("project_id", projectId)
    .eq("keyword", keyword)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao checar keyword: ${error.message}`);
  }
  return !data;
}

/**
 * Registro manual de campanha — a "Fase 0" do roadmap. Cria só a linha em
 * `prompt_campaigns`; concept/assets/geração visual entram nas fases
 * seguintes, quando as etapas 1-6 forem automatizadas.
 */
export async function createManualCampaign(
  input: CreateManualCampaignInput,
  projectId = DEFAULT_PROJECT_ID,
): Promise<PromptCampaign> {
  const supabase = getSupabaseAdminClient();

  const available = await isKeywordAvailable(input.keyword, projectId);
  if (!available) {
    throw new Error(`Keyword "${input.keyword}" já está em uso por outra campanha.`);
  }

  const { data, error } = await supabase
    .from("prompt_campaigns")
    .insert({
      project_id: projectId,
      keyword: input.keyword,
      campaign_type: input.campaignType,
      format: input.format,
      theme: input.theme,
      status: "draft",
      source: "manual",
    })
    .select(PROMPT_CAMPAIGN_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Falha ao criar campanha: ${error?.message ?? "resposta vazia"}`);
  }

  return toPromptCampaign(data as unknown as Parameters<typeof toPromptCampaign>[0]);
}

export async function listCampaigns(projectId = DEFAULT_PROJECT_ID): Promise<PromptCampaign[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select(PROMPT_CAMPAIGN_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar campanhas: ${error.message}`);
  }

  return (data ?? []).map((row) => toPromptCampaign(row as unknown as Parameters<typeof toPromptCampaign>[0]));
}

async function getCampaignRow(campaignId: string, projectId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select(PROMPT_CAMPAIGN_COLUMNS)
    .eq("id", campaignId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar campanha: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Campanha ${campaignId} não encontrada.`);
  }
  return data as unknown as Parameters<typeof toPromptCampaign>[0];
}

/**
 * Etapa 9/9b: grava a copy do Direct e do upsell antes de publicar a
 * automação no OpenReply. Campanha precisa estar em `draft` — depois de
 * publicada, a copy já foi entregue ao OpenReply e editar aqui não propaga.
 */
export async function updateCampaignDmCopy(
  campaignId: string,
  input: UpdateCampaignDmCopyInput,
  projectId = DEFAULT_PROJECT_ID,
): Promise<PromptCampaign> {
  const supabase = getSupabaseAdminClient();
  const current = await getCampaignRow(campaignId, projectId);

  if (current.status !== "draft") {
    throw new Error(`Campanha está "${current.status}" — só dá pra editar a copy enquanto estiver em rascunho.`);
  }

  const { data, error } = await supabase
    .from("prompt_campaigns")
    .update({
      ig_media_id: input.igMediaId,
      dm_message: input.dmMessage,
      opening_dm_message: input.openingDmMessage,
      follow_up_enabled: input.followUpEnabled,
      follow_up_delay_minutes: input.followUpDelayMinutes ?? null,
      follow_up_message: input.followUpMessage ?? null,
      status: "ready",
    })
    .eq("id", campaignId)
    .eq("project_id", projectId)
    .select(PROMPT_CAMPAIGN_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Falha ao gravar copy da campanha: ${error?.message ?? "resposta vazia"}`);
  }

  return toPromptCampaign(data as unknown as Parameters<typeof toPromptCampaign>[0]);
}

/**
 * Etapa 8: publica a automação no fork do OpenReply (D1). A campanha precisa
 * estar `ready` (copy já gravada via `updateCampaignDmCopy`). Isso chama uma
 * rota que ainda não existe do lado do OpenReply — falha esperada até o fork
 * mínimo (`POST /api/service/automations`) ser implementado lá.
 */
export async function publishCampaignToOpenReply(
  campaignId: string,
  projectId = DEFAULT_PROJECT_ID,
): Promise<PromptCampaign> {
  const supabase = getSupabaseAdminClient();
  const current = await getCampaignRow(campaignId, projectId);

  if (current.status !== "ready") {
    throw new Error(`Campanha está "${current.status}" — grave a copy do Direct antes de publicar.`);
  }
  if (!current.ig_media_id || !current.dm_message || !current.opening_dm_message) {
    throw new Error("Campanha sem ig_media_id/dm_message/opening_dm_message completos.");
  }

  const openreplyAvailable = await isKeywordAvailableOnOpenReply(current.keyword);
  if (!openreplyAvailable) {
    throw new Error(`Keyword "${current.keyword}" já está em uso no OpenReply.`);
  }

  const project = await requireActiveProject(projectId);
  const siteUrl = project.siteUrl?.replace(/\/$/, "") ?? "";
  const destinationUrl =
    current.campaign_type === "newsletter"
      ? `${siteUrl}/newsletter?utm_campaign=${current.keyword}`
      : `${siteUrl}/ultraprompts/${current.keyword.toLowerCase()}`;

  const result = await createAutomation({
    keyword: current.keyword,
    postId: current.ig_media_id,
    dmMessage: current.dm_message,
    openingDmMessage: current.opening_dm_message,
    trackedLink: { slug: current.keyword.toLowerCase(), destinationUrl },
    followUp: current.follow_up_enabled
      ? {
          enabled: true,
          delayMinutes: current.follow_up_delay_minutes ?? 10,
          message: current.follow_up_message ?? "",
        }
      : undefined,
  });

  const { data, error } = await supabase
    .from("prompt_campaigns")
    .update({
      openreply_automation_id: result.automationId,
      lp_url: result.trackedLinkUrl,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("project_id", projectId)
    .select(PROMPT_CAMPAIGN_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Automação criada no OpenReply (${result.automationId}) mas falhou ao gravar localmente: ${error?.message}`);
  }

  return toPromptCampaign(data as unknown as Parameters<typeof toPromptCampaign>[0]);
}
