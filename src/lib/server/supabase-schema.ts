export const casalotiSchemaTables = [
  "admin_sessions",
  "articles",
  "article_revisions",
  "newsletter_leads",
  "email_campaigns",
  "email_events",
  "content_sources",
  "editorial_reviews",
  "listmonk_sync_logs",
  "platform_events",
  "pageviews",
] as const;

export type CasalotiSchemaTable = (typeof casalotiSchemaTables)[number];

/**
 * Tabelas do Sistema PROMPT, na ordem do pipeline.
 *
 * Lidas do banco de produção, não de uma migração: o schema foi aplicado fora
 * do histórico de `supabase/migrations/`. Ver `docs/sistema-prompt-arquitetura.md`.
 */
export const promptSystemTables = [
  "prompt_trends",
  "prompt_concepts",
  "prompt_campaigns",
  "prompt_assets",
  "prompt_leads",
  "prompt_funnel_events",
  "prompt_concept_results",
  "prompt_learnings",
] as const;

export type PromptSystemTable = (typeof promptSystemTables)[number];
