import { describe, expect, it, vi } from "vitest";

/**
 * Sitemap que responde 500 é pior que sitemap ausente.
 *
 * A primeira versão caiu com `RangeError: Invalid time value`. O campo `date`
 * do artigo vem formatado para leitura, no estilo "16 de set. de 2026", e
 * `new Date()` disso devolve Invalid Date. O Next chama `toISOString()` ao
 * montar o XML, e a rota inteira devolvia 500.
 *
 * O rastreador lê 500 no sitemap como problema do site, não do arquivo. Data
 * ausente é omissão aceitável; rota quebrada não é.
 */

const artigos = [
  { slug: "edicao-2026-09-12", date: "12 de set. de 2026" },
  { slug: "edicao-2026-09-09", date: "2026-09-09T09:12:00.000Z" },
  { slug: "sem-data", date: "" },
];

vi.mock("@/lib/server/articles-service", () => ({
  getPublishedArticles: async () => artigos,
}));

const { default: sitemap } = await import("./sitemap");

describe("sitemap", () => {
  it("não quebra com data formatada para leitura", async () => {
    const entradas = await sitemap();

    // Toda data presente precisa sobreviver ao toISOString que o Next chama.
    for (const e of entradas) {
      if (e.lastModified) {
        expect(() => new Date(e.lastModified as Date).toISOString()).not.toThrow();
      }
    }
  });

  it("inclui as páginas fixas e uma entrada por artigo", async () => {
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/artigos"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/newsletter"))).toBe(true);
    for (const a of artigos) {
      expect(urls.some((u) => u.endsWith(`/artigos/${a.slug}`))).toBe(true);
    }
  });

  it("falha de leitura devolve as fixas em vez de derrubar a rota", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/articles-service", () => ({
      getPublishedArticles: async () => {
        throw new Error("banco fora do ar");
      },
    }));

    const { default: comFalha } = await import("./sitemap");
    const urls = (await comFalha()).map((e) => e.url);

    expect(urls.length).toBe(3);
    expect(urls.some((u) => u.includes("/artigos/"))).toBe(false);
  });
});
