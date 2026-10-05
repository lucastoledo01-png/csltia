import { describe, expect, it } from "vitest";
import { dataDaEdicao, renderEditionToHtml } from "./newsroom-service";
import type { EditionContent } from "./schemas";

/*
 * A edição produzida na véspera (05/10/2026) leva a data de AMANHÃ, no
 * cabeçalho e no link. Sem a data pedida, tudo continua como sempre foi.
 */

const BRASILIA = { timezone: "America/Sao_Paulo" };

describe("a data da edição", () => {
  it("sem pedido, é hoje no fuso do projeto", () => {
    expect(dataDaEdicao({}, BRASILIA)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a data pedida vence", () => {
    expect(dataDaEdicao({ editionDate: "2026-10-06" }, BRASILIA)).toBe("2026-10-06");
  });

  it("NÃO aceita data torta, em vez de cair em hoje", () => {
    expect(() => dataDaEdicao({ editionDate: "06/10/2026" }, BRASILIA)).toThrow(/AAAA-MM-DD/);
  });
});

describe("o HTML da edição da véspera", () => {
  const edicao = {
    subject: "assunto",
    subject_options: ["assunto"],
    preheader: "pre",
    headline: "Manchete",
    intro: "Bom dia.",
    stories: [
      {
        rank: 1,
        category: "Economia",
        title: "Título",
        summary: "Resumo.",
        context: "",
        why_it_matters: "",
        practical_impact: "",
        humor_line: "",
        source_name: "Fonte",
        source_url: "https://exemplo.com/a",
      },
    ],
    quick_bits: [],
    closing: "Fim.",
    final_line: "Até amanhã.",
  } as unknown as EditionContent;

  it("cabeçalho com o dia da edição, e não o dia em que foi escrita", () => {
    const html = renderEditionToHtml(edicao, new Map(), false, new Map(), "2026-10-06");
    expect(html).toContain("TERÇA-FEIRA");
    expect(html).toContain("2026-10-06");
  });
});
