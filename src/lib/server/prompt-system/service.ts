import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import {
  CreateManualCampaignInput,
  PROMPT_CAMPAIGN_COLUMNS,
  PromptCampaign,
  toPromptCampaign,
} from "./schemas";

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
