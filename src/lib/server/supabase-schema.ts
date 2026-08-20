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
