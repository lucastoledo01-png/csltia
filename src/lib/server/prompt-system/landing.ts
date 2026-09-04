import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import { validateKeyword } from "@/lib/prompt-system/keyword";

/**
 * Dados da landing por keyword (etapas 10 e 12).
 *
 * A campanha manda: a landing é renderizada a partir do registro, sem deploy
 * por post. Conceito e assets entram quando existem — na Fase 0 a campanha é
 * criada à mão e não tem nenhum dos dois, e a página precisa funcionar assim.
 */

export type LandingAsset = {
  label: string;
  promptText: string;
  imageUrl: string | null;
  substitutionNotes: string;
};

export type LandingCampaign = {
  id: string;
  keyword: string;
  theme: string;
  format: string;
  status: string;
  concept: { concept: string; hook: string; applications: string[] } | null;
  assets: LandingAsset[];
};

/**
 * Uma campanha só tem página pública depois de publicada.
 *
 * `draft` e `ready` ainda não foram ao ar, e servir a landing delas vazaria
 * conteúdo não publicado para quem adivinhasse a keyword — que é curta e
 * memorável de propósito. `archived` também não recebe: a campanha acabou.
 */
export const STATUS_PUBLICOS = ["published"];

export async function loadLandingCampaign(
  keywordCrua: string,
  options: { ignorarStatus?: boolean } = {},
): Promise<LandingCampaign | null> {
  const validation = validateKeyword(keywordCrua);
  if (!validation.ok) return null;

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("prompt_campaigns")
    .select("id, keyword, theme, format, status, concept_id")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .eq("keyword", validation.keyword)
    .maybeSingle();

  if (error || !data) return null;
  if (!options.ignorarStatus && !STATUS_PUBLICOS.includes(data.status as string)) return null;

  const [conceito, assets] = await Promise.all([
    data.concept_id
      ? supabase
          .from("prompt_concepts")
          .select("concept, hook, applications")
          .eq("id", data.concept_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("prompt_assets")
      .select("label, prompt_text, image_url, substitution_notes")
      .eq("campaign_id", data.id)
      .order("label"),
  ]);

  return {
    id: data.id as string,
    keyword: data.keyword as string,
    theme: data.theme as string,
    format: data.format as string,
    status: data.status as string,
    concept: conceito.data
      ? {
          concept: (conceito.data.concept as string) ?? "",
          hook: (conceito.data.hook as string) ?? "",
          applications: Array.isArray(conceito.data.applications)
            ? (conceito.data.applications as string[])
            : [],
        }
      : null,
    assets: (assets.data ?? []).map((a) => ({
      label: a.label as string,
      promptText: a.prompt_text as string,
      imageUrl: (a.image_url as string | null) ?? null,
      substitutionNotes: (a.substitution_notes as string | null) ?? "",
    })),
  };
}

export type FunnelStage =
  | "publish"
  | "comment"
  | "dm"
  | "dm_followup"
  | "click"
  | "lp_view"
  | "lead"
  | "delivery"
  | "veto";

/**
 * Grava um evento do funil.
 *
 * Nunca lança: um evento perdido é um número errado no relatório; uma exceção
 * aqui derrubaria a entrega do material para quem acabou de se cadastrar.
 *
 * `externalId` só existe para o que vem do OpenReply (`DmLog`, `LinkClick`) e
 * é o que torna o pull idempotente — ver a unicidade em
 * `prompt_funnel_events_dedupe_key`.
 */
export async function recordFunnelEvent(
  campaignId: string,
  stage: FunnelStage,
  payload: Record<string, unknown> = {},
  externalId?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("prompt_funnel_events").insert({
      project_id: DEFAULT_PROJECT_ID,
      campaign_id: campaignId,
      stage,
      external_id: externalId ?? null,
      payload,
    });

    // 23505 é o dedupe fazendo o trabalho dele: o evento já estava registrado.
    if (error && error.code !== "23505") {
      console.warn(`[FUNIL] Falha ao gravar ${stage}: ${error.message}`);
    }
  } catch (err) {
    console.warn("[FUNIL] Exceção ao gravar evento:", err);
  }
}
