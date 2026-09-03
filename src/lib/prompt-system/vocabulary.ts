/**
 * Valores aceitos nas colunas de texto controlado de `prompt_campaigns`.
 *
 * **O banco é a autoridade, não este arquivo.** As colunas `campaign_type`,
 * `format`, `status` e `source` são NOT NULL com CHECK em produção, e o schema
 * foi aplicado fora do histórico de migrações do repo — então as listas abaixo
 * são a leitura mais fiel que temos, não uma definição.
 *
 * Por isso as rotas **não** rejeitam um valor fora destas listas: quem recusa é
 * o CHECK, e o erro do Postgres sobe traduzido. Duplicar a regra aqui daria a
 * ilusão de validação e divergiria do banco no primeiro ALTER que ninguém
 * espelhasse. O papel destas listas é só popular os menus do painel.
 *
 * Ao confirmar os CHECKs reais, ajuste aqui — é o único lugar.
 */

export const CAMPAIGN_STATUSES = [
  "draft",
  "keyword_reserved",
  "automation_ready",
  "published",
  "paused",
  "archived",
  "failed",
] as const;

export const CAMPAIGN_FORMATS = ["prompt", "tutorial", "noticia"] as const;

export const CAMPAIGN_TYPES = ["prompt", "tutorial", "noticia"] as const;

export const CAMPAIGN_SOURCES = ["manual", "pipeline"] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  keyword_reserved: "Keyword reservada",
  automation_ready: "Automação pronta",
  published: "Publicada",
  paused: "Pausada",
  archived: "Arquivada",
  failed: "Falhou",
};

/** Rótulo legível, caindo no valor cru quando o banco trouxer algo novo. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
