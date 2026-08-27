import { describe, expect, it } from "vitest";
import { renderEditionToHtml } from "./newsroom-service";
import type { EditionContent } from "./schemas";

function edicaoCom(overrides: Partial<EditionContent["stories"][number]> = {}): EditionContent {
  return {
    subject_options: ["assunto"],
    subject: "assunto",
    preheader: "preheader",
    headline: "headline",
    intro: "intro",
    stories: [
      {
        rank: 1,
        category: "Ferramentas",
        title: "Título comum",
        summary: "Um resumo com a palavra ferramenta no meio.",
        context: "contexto",
        why_it_matters: "importa",
        practical_impact: "impacto",
        humor_line: "piada",
        source_name: "Fonte",
        source_url: "https://exemplo.com/materia",
        secondary_urls: [],
        ...overrides,
      },
    ],
    quick_bits: [],
    closing: "fecho",
    final_line: "Agora você está desbugado.",
  } as EditionContent;
}

describe("montagem do HTML da newsletter", () => {
  it("neutraliza script vindo do título da fonte", () => {
    const html = renderEditionToHtml(edicaoCom({ title: '<script>alert("xss")</script>' }));

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("impede quebra de atributo pelo título, que também vai no alt da imagem", () => {
    const html = renderEditionToHtml(edicaoCom({ title: '" onerror="alert(1)' }));

    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot; onerror=&quot;");
  });

  it("bloqueia link com esquema executável na URL da fonte", () => {
    const html = renderEditionToHtml(edicaoCom({ source_url: "javascript:alert(1)" }));

    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('href="#"');
  });

  it("preserva o link legítimo da fonte dentro do resumo", () => {
    const html = renderEditionToHtml(edicaoCom());

    expect(html).toContain('href="https://exemplo.com/materia"');
    expect(html).toContain("Título comum");
  });

  it("escapa também a abertura da edição", () => {
    const edicao = edicaoCom();
    edicao.intro = '<img src=x onerror="alert(1)">';

    expect(renderEditionToHtml(edicao)).not.toContain("<img src=x");
  });
});
