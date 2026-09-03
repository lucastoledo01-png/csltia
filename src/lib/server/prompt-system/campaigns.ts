import { getSupabaseAdminClient } from "../supabase-admin";
import { validateKeyword } from "@/lib/prompt-system/keyword";

/**
 * Registro de campanhas do Sistema PROMPT.
 *
 * Uma campanha é a identidade de uma publicação dentro do funil: nasce com uma
 * keyword, ganha a automação no OpenReply, vai ao ar como post e a partir daí
 * é a chave de junção de todo evento — comentário, Direct, clique, visita,
 * cadastro, acesso ao material.
 *
 * As colunas aqui espelham o schema que está **em produção**, lido do banco,
 * não o do documento de arquitetura: o schema aplicado é mais rico e inclui a
 * sequência de Direct (`opening_dm_message`, `follow_up_*`) e o
 * `campaign_type`. Onde os dois discordarem, o banco manda.
 */

export type PromptCampaign = {
  id: string;
  projectId: string;
  conceptId: string | null;
  keyword: string;
  campaignType: string;
  theme: string;
  format: string;
  status: string;
  source: string;
  igMediaId: string | null;
  openReplyAutomationId: string | null;
  lpUrl: string | null;
  /** Mensagem de entrega do Direct. */
  dmMessage: string | null;
  /** Primeira mensagem do fluxo, antes da entrega. */
  openingDmMessage: string | null;
  followUpEnabled: boolean;
  followUpDelayMinutes: number | null;
  followUpMessage: string | null;
  createdAt: string;
  publishedAt: string | null;
};

type CampaignRow = {
  id: string;
  project_id: string;
  concept_id: string | null;
  keyword: string;
  campaign_type: string;
  theme: string;
  format: string;
  status: string;
  source: string;
  ig_media_id: string | null;
  openreply_automation_id: string | null;
  lp_url: string | null;
  dm_message: string | null;
  opening_dm_message: string | null;
  follow_up_enabled: boolean;
  follow_up_delay_minutes: number | null;
  follow_up_message: string | null;
  created_at: string;
  published_at: string | null;
};

const CAMPAIGN_COLUMNS =
  "id, project_id, concept_id, keyword, campaign_type, theme, format, status, " +
  "source, ig_media_id, openreply_automation_id, lp_url, dm_message, " +
  "opening_dm_message, follow_up_enabled, follow_up_delay_minutes, " +
  "follow_up_message, created_at, published_at";

/**
 * Estados a partir dos quais a campanha ainda não tocou nada externo. Fora
 * deles existe um post no Instagram e uma automação no OpenReply apontando
 * para esta linha, e apagá-la deixaria o funil órfão.
 */
const DELETABLE_STATUSES = ["draft", "keyword_reserved", "failed"];

export function isDeletableStatus(status: string): boolean {
  return DELETABLE_STATUSES.includes(status);
}

function toCampaign(row: CampaignRow): PromptCampaign {
  return {
    id: row.id,
    projectId: row.project_id,
    conceptId: row.concept_id,
    keyword: row.keyword,
    campaignType: row.campaign_type,
    theme: row.theme,
    format: row.format,
    status: row.status,
    source: row.source,
    igMediaId: row.ig_media_id,
    openReplyAutomationId: row.openreply_automation_id,
    lpUrl: row.lp_url,
    dmMessage: row.dm_message,
    openingDmMessage: row.opening_dm_message,
    followUpEnabled: row.follow_up_enabled,
    followUpDelayMinutes: row.follow_up_delay_minutes,
    followUpMessage: row.follow_up_message,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export async function listCampaigns(
  projectId: string,
  options: { status?: string; limit?: number } = {},
): Promise<PromptCampaign[]> {
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("prompt_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar campanhas: ${error.message}`);
  }

  return (data as unknown as CampaignRow[]).map(toCampaign);
}

export async function getCampaignById(id: string): Promise<PromptCampaign | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toCampaign(data as unknown as CampaignRow);
}

export async function getCampaignByKeyword(
  projectId: string,
  keyword: string,
): Promise<PromptCampaign | null> {
  const validation = validateKeyword(keyword);
  if (!validation.ok) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("project_id", projectId)
    .eq("keyword", validation.keyword)
    .maybeSingle();

  if (error || !data) return null;
  return toCampaign(data as unknown as CampaignRow);
}

export type KeywordAvailability = {
  keyword: string;
  available: boolean;
  /** Campanha que já usa a keyword, quando houver. */
  conflict: Pick<PromptCampaign, "id" | "theme" | "status" | "createdAt"> | null;
  /**
   * Fase 0 confere apenas o histórico local. A etapa 7 exige checagem dupla —
   * a segunda metade é contra as automações existentes do OpenReply, e chega
   * na Fase 1 junto com a rota de serviço. Enquanto isto for `false`, uma
   * keyword livre aqui ainda pode estar ocupada lá.
   */
  checkedOpenReply: boolean;
};

export async function checkKeywordAvailability(
  projectId: string,
  keyword: string,
): Promise<KeywordAvailability> {
  const validation = validateKeyword(keyword);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const existing = await getCampaignByKeyword(projectId, validation.keyword);

  return {
    keyword: validation.keyword,
    available: existing === null,
    conflict: existing
      ? {
          id: existing.id,
          theme: existing.theme,
          status: existing.status,
          createdAt: existing.createdAt,
        }
      : null,
    checkedOpenReply: false,
  };
}

export type CreateCampaignInput = {
  projectId: string;
  keyword: string;
  campaignType: string;
  format: string;
  status: string;
  source: string;
  theme?: string;
  conceptId?: string | null;
  lpUrl?: string | null;
  dmMessage?: string | null;
  openingDmMessage?: string | null;
};

/**
 * Registra a campanha com a keyword já canônica.
 *
 * `campaignType`, `format`, `status` e `source` são pedidos explicitamente
 * porque as quatro colunas são NOT NULL em produção e seus valores aceitos
 * vêm de CHECKs do banco. Chutar um default aqui daria erro 400 só na hora da
 * gravação — quem chama passa o valor e a rota valida contra a lista única.
 */
export async function createCampaign(input: CreateCampaignInput): Promise<PromptCampaign> {
  const validation = validateKeyword(input.keyword);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .insert({
      project_id: input.projectId,
      concept_id: input.conceptId ?? null,
      keyword: validation.keyword,
      campaign_type: input.campaignType,
      theme: input.theme?.trim() ?? "",
      format: input.format,
      status: input.status,
      source: input.source,
      lp_url: input.lpUrl ?? null,
      dm_message: input.dmMessage ?? null,
      opening_dm_message: input.openingDmMessage ?? null,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A keyword ${validation.keyword} já está em uso neste projeto.`);
    }
    throw new Error(`Falha ao registrar campanha: ${error.message}`);
  }

  return toCampaign(data as unknown as CampaignRow);
}

export type UpdateCampaignInput = {
  status?: string;
  theme?: string;
  format?: string;
  lpUrl?: string | null;
  dmMessage?: string | null;
  openingDmMessage?: string | null;
  followUpEnabled?: boolean;
  followUpDelayMinutes?: number | null;
  followUpMessage?: string | null;
  igMediaId?: string | null;
  openReplyAutomationId?: string | null;
};

/**
 * `prompt_campaigns` não tem `updated_at` em produção, então não há carimbo de
 * alteração para manter aqui — a linha do tempo da campanha é `created_at` e
 * `published_at`, mais os eventos em `prompt_funnel_events`.
 */
export async function updateCampaign(
  id: string,
  patch: UpdateCampaignInput,
): Promise<PromptCampaign> {
  const updates: Record<string, unknown> = {};

  if (patch.status !== undefined) {
    updates.status = patch.status;
    // O carimbo de publicação é derivado da transição, não pedido a quem
    // chama: uma campanha publicada sem data quebra todo relatório de funil.
    if (patch.status === "published") updates.published_at = new Date().toISOString();
  }
  if (patch.theme !== undefined) updates.theme = patch.theme.trim();
  if (patch.format !== undefined) updates.format = patch.format;
  if (patch.lpUrl !== undefined) updates.lp_url = patch.lpUrl || null;
  if (patch.dmMessage !== undefined) updates.dm_message = patch.dmMessage || null;
  if (patch.openingDmMessage !== undefined) {
    updates.opening_dm_message = patch.openingDmMessage || null;
  }
  if (patch.followUpEnabled !== undefined) updates.follow_up_enabled = patch.followUpEnabled;
  if (patch.followUpDelayMinutes !== undefined) {
    updates.follow_up_delay_minutes = patch.followUpDelayMinutes;
  }
  if (patch.followUpMessage !== undefined) updates.follow_up_message = patch.followUpMessage || null;
  if (patch.igMediaId !== undefined) updates.ig_media_id = patch.igMediaId || null;
  if (patch.openReplyAutomationId !== undefined) {
    updates.openreply_automation_id = patch.openReplyAutomationId || null;
  }

  if (Object.keys(updates).length === 0) {
    const atual = await getCampaignById(id);
    if (!atual) throw new Error("Campanha não encontrada.");
    return atual;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_campaigns")
    .update(updates)
    .eq("id", id)
    .select(CAMPAIGN_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar campanha: ${error.message}`);
  }

  return toCampaign(data as unknown as CampaignRow);
}

export async function deleteCampaign(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("prompt_campaigns").delete().eq("id", id);

  if (error) {
    throw new Error(`Falha ao remover campanha: ${error.message}`);
  }
}
