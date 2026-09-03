/**
 * Valores aceitos pelas colunas de texto controlado das tabelas `prompt_*`.
 *
 * Lidos dos CHECKs do banco de produção em 2026-09-03 (`pg_get_constraintdef`),
 * porque o schema foi aplicado fora do histórico de `supabase/migrations/` e
 * este arquivo é a única cópia versionada dele. **O banco é a autoridade.**
 *
 * As rotas não rejeitam valores fora destas listas: quem recusa é o CHECK, e o
 * erro do Postgres sobe traduzido em 400. Duplicar a regra em TypeScript
 * divergiria do banco no primeiro ALTER que ninguém espelhasse. O papel destas
 * listas é popular os menus do painel e documentar o que existe.
 */

// prompt_campaigns_status_check
export const CAMPAIGN_STATUSES = ["draft", "ready", "published", "blocked", "archived"] as const;

// prompt_campaigns_format_check
export const CAMPAIGN_FORMATS = ["noticia", "tutorial", "prompt"] as const;

// prompt_campaigns_campaign_type_check
export const CAMPAIGN_TYPES = ["newsletter", "prompt"] as const;

// prompt_campaigns_source_check
export const CAMPAIGN_SOURCES = ["manual", "automated"] as const;

// prompt_funnel_events_stage_check — a ordem é a do funil.
export const FUNNEL_STAGES = [
  "publish",
  "comment",
  "dm",
  "dm_followup",
  "click",
  "lp_view",
  "lead",
  "delivery",
  "veto",
] as const;

// prompt_trends_status_check
export const TREND_STATUSES = ["candidate", "promoted", "rejected", "archived"] as const;

// prompt_trends_source_check
export const TREND_SOURCES = ["manual", "google_trends", "reddit", "catalogo_estreias"] as const;

// prompt_concepts_status_check
export const CONCEPT_STATUSES = ["draft", "approved", "blocked", "archived"] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  ready: "Pronta",
  published: "Publicada",
  blocked: "Bloqueada",
  archived: "Arquivada",
};

/** Rótulo legível, caindo no valor cru se o banco passar a aceitar algo novo. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
