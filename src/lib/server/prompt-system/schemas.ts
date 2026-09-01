import { z } from "zod";

/**
 * Fase 0 do Sistema PROMPT (ver docs/sistema-prompt-arquitetura.md): registro
 * manual de campanha, sem as etapas 1-6 (trend intelligence, trend jacking,
 * geração visual) ainda automatizadas. `concept`/`applications` entram como
 * texto livre por enquanto — viram `prompt_concepts` estruturado na Fase 4.
 */

const KEYWORD_REGEX = /^[A-Z0-9]{3,20}$/;

export const CreateManualCampaignSchema = z.object({
  keyword: z
    .string()
    .trim()
    .toUpperCase()
    .regex(KEYWORD_REGEX, "Keyword deve ter 3-20 caracteres, só letras maiúsculas e números, sem acento/espaço."),
  campaignType: z.enum(["newsletter", "prompt"]).default("prompt"),
  format: z.enum(["noticia", "tutorial", "prompt"]).default("prompt"),
  theme: z.string().trim().min(1, "Tema é obrigatório."),
  concept: z.string().trim().default(""),
});

export type CreateManualCampaignInput = z.infer<typeof CreateManualCampaignSchema>;

export type PromptCampaignStatus = "draft" | "ready" | "published" | "blocked" | "archived";

export type PromptCampaign = {
  id: string;
  projectId: string;
  conceptId: string | null;
  keyword: string;
  campaignType: "newsletter" | "prompt";
  theme: string;
  format: "noticia" | "tutorial" | "prompt";
  status: PromptCampaignStatus;
  igMediaId: string | null;
  openreplyAutomationId: string | null;
  lpUrl: string | null;
  source: "manual" | "automated";
  createdAt: string;
  publishedAt: string | null;
};

type PromptCampaignRow = {
  id: string;
  project_id: string;
  concept_id: string | null;
  keyword: string;
  campaign_type: PromptCampaign["campaignType"];
  theme: string;
  format: PromptCampaign["format"];
  status: PromptCampaignStatus;
  ig_media_id: string | null;
  openreply_automation_id: string | null;
  lp_url: string | null;
  source: PromptCampaign["source"];
  created_at: string;
  published_at: string | null;
};

export function toPromptCampaign(row: PromptCampaignRow): PromptCampaign {
  return {
    id: row.id,
    projectId: row.project_id,
    conceptId: row.concept_id,
    keyword: row.keyword,
    campaignType: row.campaign_type,
    theme: row.theme,
    format: row.format,
    status: row.status,
    igMediaId: row.ig_media_id,
    openreplyAutomationId: row.openreply_automation_id,
    lpUrl: row.lp_url,
    source: row.source,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export const PROMPT_CAMPAIGN_COLUMNS =
  "id, project_id, concept_id, keyword, campaign_type, theme, format, status, " +
  "ig_media_id, openreply_automation_id, lp_url, source, created_at, published_at";
