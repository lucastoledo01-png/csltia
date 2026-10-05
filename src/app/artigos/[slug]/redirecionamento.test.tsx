import { describe, expect, it, vi } from "vitest";

/**
 * O link antigo de uma edição que virou matéria por pauta (05/10/2026).
 *
 * A edição sai da lista do portal, mas o link dela está em e-mail enviado e
 * no Google. A página redireciona, de forma permanente, em vez de 404.
 */

const destinos: Record<string, string | null> = {
  "edicao-2026-10-04": "/artigos/fed-corta-juros-2026-10-04",
  "edicao-2026-09-16": "/artigos",
  "nao-existe": null,
};

vi.mock("@/lib/server/articles-service", () => ({
  getArticleBySlug: async () => null,
  destinoDoLinkDaEdicao: async (slug: string) => destinos[slug] ?? null,
}));

const { default: ArticlePage } = await import("./page");

async function erroDe(slug: string): Promise<{ digest?: string }> {
  try {
    await ArticlePage({ params: Promise.resolve({ slug }) });
  } catch (e) {
    return e as { digest?: string };
  }
  throw new Error("a página deveria ter redirecionado ou dado 404");
}

describe("link antigo de edição", () => {
  it("redireciona permanentemente para a primeira matéria da edição", async () => {
    const e = await erroDe("edicao-2026-10-04");
    expect(e.digest).toMatch(/^NEXT_REDIRECT;replace;\/artigos\/fed-corta-juros-2026-10-04;308;/);
  });

  it("edição sem matéria vai para a lista, e não para o 404", async () => {
    const e = await erroDe("edicao-2026-09-16");
    expect(e.digest).toMatch(/^NEXT_REDIRECT;replace;\/artigos;308;/);
  });

  it("slug que não é de edição continua dando 404", async () => {
    const e = await erroDe("nao-existe");
    expect(e.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
