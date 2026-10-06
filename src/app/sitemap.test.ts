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
  { slug: "materia-com-data-torta", published_at: "12 de set. de 2026", updated_at: null },
  { slug: "materia-2026-09-09", published_at: "2026-09-09T09:12:00.000Z", updated_at: "2026-09-12T10:00:00.000Z" },
  { slug: "sem-data", published_at: null, updated_at: null },
];

const autores = [{ slug: "ana-silva", ultima: "2026-10-05T12:00:00.000Z" }];

vi.mock("@/lib/server/arquivos-para-maquinas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/arquivos-para-maquinas")>()),
  materiasDoSitemap: async () => artigos,
  autoresDoSitemap: async () => autores,
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

  it("inclui a página de cada editoria do menu", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const id of ["economia", "trabalho", "tecnologia", "custo-de-vida", "governo", "brasil"]) {
      expect(urls.some((u) => u.endsWith(`/editoria/${id}`))).toBe(true);
    }
  });

  it("falha de leitura devolve as fixas em vez de derrubar a rota", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/arquivos-para-maquinas", () => ({
      materiasDoSitemap: async () => {
        throw new Error("banco fora do ar");
      },
      autoresDoSitemap: async () => {
        throw new Error("banco fora do ar");
      },
    }));

    const { default: comFalha } = await import("./sitemap");
    const urls = (await comFalha()).map((e) => e.url);

    // As três fixas mais as seis editorias, que não dependem do banco.
    expect(urls.length).toBe(9);
    expect(urls.some((u) => u.includes("/artigos/"))).toBe(false);
  });
});

describe("sitemap com a data do banco (auditoria de 05/10/2026)", () => {
  it("lastmod é a modificação honesta da matéria, a mesma do JSON-LD", async () => {
    const entrada = (await sitemap()).find((e) => e.url.endsWith("/artigos/materia-2026-09-09"));
    expect((entrada?.lastModified as Date).toISOString()).toBe("2026-09-12T10:00:00.000Z");
  });
});

describe("páginas de autor no sitemap (06/10/2026)", () => {
  it("o autor que a leitura devolve entra, com a data da matéria mais recente", async () => {
    const entrada = (await sitemap()).find((e) => e.url === "https://casaloti.ia.br/autor/ana-silva");
    expect((entrada?.lastModified as Date).toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });

  it("a regra: só autor ativo com pelo menos uma matéria publicada", async () => {
    const { autoresComMateriaPublicada } = await vi.importActual<typeof import("@/lib/server/arquivos-para-maquinas")>(
      "@/lib/server/arquivos-para-maquinas",
    );
    const lista = autoresComMateriaPublicada(
      [
        { id: "a", slug: "com-materia", ativo: true },
        { id: "b", slug: "sem-materia", ativo: true },
        { id: "c", slug: "desativado", ativo: false },
      ],
      [
        { author_id: "a", published_at: "2026-10-01T00:00:00Z" },
        { author_id: "a", published_at: "2026-10-04T00:00:00Z" },
        { author_id: "c", published_at: "2026-10-04T00:00:00Z" },
        { author_id: null, published_at: "2026-10-04T00:00:00Z" },
      ],
    );
    expect(lista).toEqual([{ slug: "com-materia", ultima: "2026-10-04T00:00:00Z" }]);
  });
});
