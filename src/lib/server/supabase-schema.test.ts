import { describe, expect, it } from "vitest";
import { casalotiSchemaTables } from "./supabase-schema";

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
