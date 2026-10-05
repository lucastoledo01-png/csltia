import { describe, expect, it } from "vitest";
import {
  camposDeIndexacaoNoJsonLd,
  entidadesDoPacote,
  indexacaoDasTags,
  tagsDeIndexacao,
  tagsSemIndexacao,
} from "./indexacao-do-artigo";

describe("assuntos e entidades em tags", () => {
  it("vai e volta pelo formato com prefixo, sem tocar nas outras tags", () => {
    const tags = tagsDeIndexacao({
      assuntos: ["data centers", "Chicago"],
      entidades: [
        { papel: "sobre", tipo: "Place", nome: "Chicago", sameAs: "https://www.wikidata.org/wiki/Q1297" },
        { papel: "menciona", tipo: "Person", nome: "Brandon Johnson" },
      ],
    });
    const todas = ["Política", "origem:edicao-2026-09-24", ...tags];
    expect(indexacaoDasTags(todas)).toEqual({
      assuntos: ["data centers", "Chicago"],
      entidades: [
        { papel: "sobre", tipo: "Place", nome: "Chicago", sameAs: "https://www.wikidata.org/wiki/Q1297" },
        { papel: "menciona", tipo: "Person", nome: "Brandon Johnson" },
      ],
    });
    expect(tagsSemIndexacao(todas)).toEqual(["Política", "origem:edicao-2026-09-24"]);
  });

  it("o que o título nomeia é `about`; o resto é `mentions`; assinatura e veículo ficam de fora", () => {
    const e = entidadesDoPacote(
      { people: ["Brandon Johnson", "Justin Kaufmann"], organizations: ["Axios Chicago", "Data Center Coalition"], places: ["Chicago", "Seattle"] },
      "Chicago propõe um ano sem novos data centers",
      ["Justin Kaufmann", "Axios Chicago"],
    );
    expect(e.filter((x) => x.papel === "sobre").map((x) => x.nome)).toEqual(["Chicago"]);
    expect(e.map((x) => x.nome)).not.toContain("Justin Kaufmann");
    expect(e.map((x) => x.nome)).not.toContain("Axios Chicago");
    expect(e.find((x) => x.nome === "Data Center Coalition")?.tipo).toBe("Organization");
  });

  it("JSON-LD: keywords, about e mentions só quando existem, e sameAs só quando veio do resolvedor", () => {
    expect(camposDeIndexacaoNoJsonLd({ assuntos: [], entidades: [] })).toEqual({});
    const c = camposDeIndexacaoNoJsonLd(
      indexacaoDasTags(["assunto:data centers", "sobre:Place:Chicago|https://www.wikidata.org/wiki/Q1297", "menciona:Person:Brad Tietz"]),
    );
    expect(c).toEqual({
      keywords: ["data centers"],
      about: [{ "@type": "Place", name: "Chicago", sameAs: "https://www.wikidata.org/wiki/Q1297" }],
      mentions: [{ "@type": "Person", name: "Brad Tietz" }],
    });
  });
});
