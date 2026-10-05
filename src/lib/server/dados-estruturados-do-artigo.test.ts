import { describe, expect, it } from "vitest";
import {
  corpoComPerguntas,
  dadosEstruturadosDoArtigo,
  dataDeModificacao,
  jsonLdSeguro,
  perguntasDoArtigo,
} from "./dados-estruturados-do-artigo";

const base = {
  slug: "hollywood-2026-10-04",
  title: "Hollywood nos EUA atrai capital privado para filmes independentes",
  seo_description: "Investidores privados entram no financiamento de Hollywood.",
  category: "Economia",
  cover_image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg",
  published_at: "2026-10-04T09:29:38.729Z",
  updated_at: "2026-10-04T09:29:38.729Z",
};

function grafo(d: Record<string, unknown>): Array<Record<string, unknown>> {
  return d["@graph"] as Array<Record<string, unknown>>;
}

describe("dadosEstruturadosDoArtigo", () => {
  it("NewsArticle completo: título, datas, autor Organization, editora, imagem, editoria", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] }));
    const materia = g.find((n) => n["@type"] === "NewsArticle")!;
    expect(materia.headline).toBe(base.title);
    expect(materia.datePublished).toBe("2026-10-04T09:29:38.729Z");
    expect(materia.dateModified).toBe("2026-10-04T09:29:38.729Z");
    expect(materia.author).toEqual({ "@type": "Organization", name: "Redação eua.journal", url: "https://casaloti.ia.br" });
    expect(materia.publisher).toEqual({ "@id": "https://casaloti.ia.br/#organizacao" });
    expect(materia.image).toEqual([base.cover_image]);
    expect(materia.articleSection).toBe("Economia");
    expect(g.some((n) => n["@type"] === "Organization" && n["@id"] === "https://casaloti.ia.br/#organizacao")).toBe(true);
  });

  it("caminho de navegação passa pela página da editoria", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] }));
    const caminho = g.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement as Array<Record<string, unknown>>;
    expect(caminho.map((c) => c.item)).toEqual([
      "https://casaloti.ia.br",
      "https://casaloti.ia.br/editoria/economia",
      "https://casaloti.ia.br/artigos/hollywood-2026-10-04",
    ]);
    expect(caminho.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it("FAQPage só quando há pergunta visível", () => {
    expect(grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] })).some((n) => n["@type"] === "FAQPage")).toBe(false);
    const g = grafo(
      dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [{ pergunta: "Quanto tempo leva?", resposta: "Cerca de **um ano**." }] }),
    );
    const faq = g.find((n) => n["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toEqual([
      { "@type": "Question", name: "Quanto tempo leva?", acceptedAnswer: { "@type": "Answer", text: "Cerca de um ano." } },
    ]);
  });

  it("sem capa, sem image: o logotipo não finge ser a foto da matéria", () => {
    const g = grafo(dadosEstruturadosDoArtigo({ ...base, cover_image: null }, { perguntasVisiveis: [] }));
    expect(g.find((n) => n["@type"] === "NewsArticle")!.image).toBeUndefined();
  });
});

describe("dataDeModificacao", () => {
  it("gravação da mesma rodada não conta como modificação", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-04T09:05:00Z")).toBe("2026-10-04T09:00:00.000Z");
  });

  it("mudança depois de publicar vira dateModified", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-06T12:00:00Z")).toBe("2026-10-06T12:00:00.000Z");
  });

  it("updated_at anterior à publicação não recua a data", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-01T09:00:00Z")).toBe("2026-10-04T09:00:00.000Z");
  });
});

describe("jsonLdSeguro", () => {
  it("escapa < para um título com </script> não fechar a tag", () => {
    const s = jsonLdSeguro({ headline: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s).headline).toBe("</script><script>alert(1)</script>");
  });
});

describe("perguntas", () => {
  it("lê os dois formatos gravados no banco", () => {
    expect(
      perguntasDoArtigo([
        { pergunta: "A?", resposta: "a." },
        { question: "B?", answer: "b." },
        { pergunta: "sem resposta" },
        "lixo",
      ]),
    ).toEqual([
      { pergunta: "A?", resposta: "a." },
      { pergunta: "B?", resposta: "b." },
    ]);
  });

  it("a seção visível entra antes do crédito da fonte e escapa o texto", () => {
    const html = `<section><p>corpo</p></section><p class="fonte">Fonte: <a href="https://x.com">X</a></p>`;
    const r = corpoComPerguntas(html, [{ pergunta: "<b>Q</b>?", resposta: "R." }]);
    expect(r).toBe(
      `<section><p>corpo</p></section><section class="perguntas"><h2>Perguntas e respostas</h2><h3>&lt;b&gt;Q&lt;/b&gt;?</h3><p>R.</p></section><p class="fonte">Fonte: <a href="https://x.com">X</a></p>`,
    );
  });

  it("não duplica a seção que o ramo já escreveu no corpo", () => {
    const html = `<section><h2>Perguntas e respostas</h2><h3>Q?</h3><p>R.</p></section>`;
    expect(corpoComPerguntas(html, [{ pergunta: "Q?", resposta: "R." }])).toBe(html);
  });
});
