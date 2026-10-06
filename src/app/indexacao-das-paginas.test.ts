import { describe, expect, it, vi } from "vitest";

/*
 * Quem fica fora do índice e quem tem canônico próprio (auditoria de SEO,
 * 05/10/2026). As três páginas da vertical antiga respondiam 200 com o título
 * da home; o painel só tinha o `robots.txt`.
 */

vi.mock("next/font/google", () => ({ Plus_Jakarta_Sans: () => ({ variable: "" }), Outfit: () => ({ variable: "" }) }));

describe("indexação das páginas", () => {
  it("as páginas da vertical antiga ficam fora do índice", async () => {
    for (const caminho of ["./formacoes/page", "./ultraprompts/page", "./automacao/page"]) {
      const { metadata } = await import(caminho);
      expect(metadata.robots).toEqual({ index: false, follow: true });
    }
  });

  it("o painel fica fora do índice", async () => {
    const { metadata } = await import("./admin/layout");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("lista e newsletter têm título e canônico próprios", async () => {
    vi.doMock("@/lib/server/articles-service", () => ({ getPublishedArticles: async () => [] }));
    const lista = (await import("./artigos/page")).metadata;
    expect(lista.title).toBe("Todas as matérias | eua.journal");
    expect(lista.alternates?.canonical).toBe("https://casaloti.ia.br/artigos");
    const news = (await import("./newsletter/page")).metadata;
    expect(news.alternates?.canonical).toBe("https://casaloti.ia.br/newsletter");
  });

  it("o layout pede a prévia grande de imagem e tem a base dos endereços", async () => {
    vi.doMock("next/font/google", () => ({
      Archivo_Black: () => ({ variable: "" }),
      Inter: () => ({ variable: "" }),
      Sora: () => ({ variable: "" }),
      Space_Mono: () => ({ variable: "" }),
    }));
    const { metadata } = await import("./layout");
    expect(String(metadata.metadataBase)).toBe("https://casaloti.ia.br/");
    expect((metadata.robots as { googleBot: Record<string, unknown> }).googleBot["max-image-preview"]).toBe("large");
  });
});
