import { describe, expect, it } from "vitest";
import { buildEditorialReadiness, normalizeAdminArticleDraft } from "./editorial-quality";

const completeDraft = {
  title: "Como usar IA para vender sem virar panfleto ambulante",
  slug: "ia-vender-sem-panfleto",
  description: "Um guia prático para transformar notícia de IA em ação comercial clara, com exemplos, fontes e revisão humana antes de publicar.",
  excerpt: "IA aplicada em venda sem cheiro de robô corporativo.",
  status: "draft",
  category: "AEO",
  tags: ["ia", "vendas", "aeo"],
  sourceUrls: ["https://openai.com/news/example"],
  seoTitle: "IA para vender sem parecer panfleto",
  seoDescription: "Veja como usar IA em conteúdo de venda com SEO, AEO, fontes e revisão humana antes de publicar.",
  aeoQuestions: [
    {
      question: "Como usar IA para vender melhor?",
      answer: "Use IA para entender dúvidas reais, montar exemplos e revisar a clareza antes de publicar.",
    },
  ],
  ageSummary: "Resumo para mecanismos generativos: artigo explica como aplicar IA em vendas com fonte, contexto e ação prática.",
  sections: [
    {
      heading: "Comece pela pergunta certa",
      paragraphs: ["O conteúdo precisa responder uma dúvida real antes de tentar vender qualquer coisa."],
    },
  ],
};

describe("editorial quality gates", () => {
  it("aprova rascunho completo com requisitos de SEO, AEO e AGE", () => {
    const draft = normalizeAdminArticleDraft(completeDraft);
    const readiness = buildEditorialReadiness(draft);

    expect(readiness.canPublish).toBe(true);
    expect(readiness.score).toBeGreaterThanOrEqual(90);
    expect(readiness.checks.map((check) => check.group)).toEqual(expect.arrayContaining(["seo", "aeo", "age"]));
  });

  it("bloqueia publicação quando faltam fonte, resposta AEO e resumo AGE", () => {
    const draft = normalizeAdminArticleDraft({ ...completeDraft, sourceUrls: [], aeoQuestions: [], ageSummary: "" });
    const readiness = buildEditorialReadiness(draft);

    expect(readiness.canPublish).toBe(false);
    expect(readiness.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(
      expect.arrayContaining(["source-url", "aeo-answer", "age-summary"]),
    );
  });
});
