import { describe, expect, it } from "vitest";
import { casalotiSchemaTables, promptSystemTables } from "./supabase-schema";

describe("supabase schema contract", () => {
  it("inclui tabelas para admin, artigos, emails, logs e pageviews", () => {
    expect(casalotiSchemaTables).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });
});

describe("tabelas do Sistema PROMPT", () => {
  it("espelha as oito tabelas que estão no banco", () => {
    // Conferido contra o schema exposto pelo PostgREST em produção. O schema
    // não veio de migração no repo, então esta lista é a única cópia
    // versionada do que existe lá.
    expect(promptSystemTables).toEqual([
      "prompt_trends",
      "prompt_concepts",
      "prompt_campaigns",
      "prompt_assets",
      "prompt_leads",
      "prompt_funnel_events",
      "prompt_concept_results",
      "prompt_learnings",
    ]);
  });
});
