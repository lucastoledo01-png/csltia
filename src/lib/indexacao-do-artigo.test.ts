import { describe, expect, it } from "vitest";
import {
  camposDeIndexacaoNoJsonLd,
  entidadesDoPacote,
  entidadesPresentesNoTexto,
  indexacaoDasTags,
  indexacaoValidadaDoArtigo,
  validarAssuntos,
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
    // Entidade antes de tema: a ordem é do validador, não da proposta.
    expect(indexacaoDasTags(todas)).toEqual({
      assuntos: ["Chicago", "data centers"],
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

describe("validarAssuntos: o modelo propõe, o código decide (06/10/2026)", () => {
  const ENTIDADES = [
    { papel: "sobre" as const, nome: "Chicago" },
    { papel: "menciona" as const, nome: "Brandon Johnson" },
    { papel: "menciona" as const, nome: "City Council" },
  ];

  it("recusa 'água', 'energia' e 'governo', com motivo para o log", () => {
    const r = validarAssuntos(["água", "energia", "governo"], { incluirSobre: false });
    expect(r.assuntos).toEqual([]);
    expect(r.descartados).toEqual([
      { termo: "água", motivo: "genérico" },
      { termo: "energia", motivo: "genérico" },
      { termo: "governo", motivo: "genérico" },
    ]);
  });

  it("aceita tema da lista fechada, gravado com o nome da lista", () => {
    expect(validarAssuntos(["Data Center", "inteligencia artificial"]).assuntos).toEqual(["data centers", "inteligência artificial"]);
  });

  it("recusa o que não é entidade nem tema, mesmo não sendo da lista de genéricos", () => {
    const r = validarAssuntos(["Illinois", "moratória"], { entidades: ENTIDADES, incluirSobre: false });
    expect(r.assuntos).toEqual([]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["fora da lista", "fora da lista"]);
  });

  it("aceita entidade da matéria, e a entidade vem antes do tema", () => {
    const r = validarAssuntos(["data centers", "brandon johnson", "energia"], { entidades: ENTIDADES });
    expect(r.assuntos).toEqual(["Chicago", "Brandon Johnson", "data centers"]);
  });

  it("no máximo cinco, sem repetição", () => {
    const r = validarAssuntos(
      ["data centers", "data center", "Brandon Johnson", "City Council", "inteligência artificial", "big techs", "semicondutores", "startups"],
      { entidades: ENTIDADES },
    );
    expect(r.assuntos).toHaveLength(5);
    expect(r.assuntos.slice(0, 3)).toEqual(["Chicago", "Brandon Johnson", "City Council"]);
    expect(r.descartados).toContainEqual({ termo: "data center", motivo: "repetido" });
    expect(r.descartados.some((d) => d.motivo === "acima do teto")).toBe(true);
  });

  it("tema que o texto trata entra mesmo sem proposta", () => {
    const r = validarAssuntos(["água"], { texto: "Pausa nos data centers. Os data centers consomem muito.", incluirSobre: false });
    expect(r.assuntos).toEqual(["data centers"]);
  });

  it("tagsDeIndexacao não grava assunto genérico nem que quem chama esqueça de validar", () => {
    const tags = tagsDeIndexacao({ assuntos: ["água", "data centers"], entidades: [] });
    expect(tags).toEqual(["assunto:data centers"]);
  });
});

describe("about e mentions só com quem o texto final nomeia (06/10/2026)", () => {
  it("filtra por presença, sem acento nem caixa", () => {
    const e = [{ nome: "President Trump" }, { nome: "São Paulo" }, { nome: "JB Pritzker" }];
    expect(entidadesPresentesNoTexto(e, "Em SAO PAULO e com jb pritzker.").map((x) => x.nome)).toEqual(["São Paulo", "JB Pritzker"]);
  });

  it("entidadesDoPacote com o texto final deixa de fora quem a poda tirou", () => {
    const e = entidadesDoPacote({ people: ["Brandon Johnson", "President Trump"], places: ["Chicago"] }, "Chicago pausa data centers", [], "Chicago pausa data centers. Brandon Johnson defende a pausa.");
    expect(e.map((x) => x.nome)).toEqual(["Chicago", "Brandon Johnson"]);
  });

  it("a leitura da página ignora 'Leia também' e 'Fontes' ao procurar o nome", () => {
    const ix = indexacaoValidadaDoArtigo({
      title: "Chicago pausa data centers",
      content_html: `<section class="abertura"><p>Texto.</p></section><section class="leia-tambem"><ul><li>President Trump</li></ul></section>`,
      tags: ["menciona:Person:President Trump", "sobre:Place:Chicago", "assunto:energia"],
    });
    expect(ix.entidades.map((x) => x.nome)).toEqual(["Chicago"]);
    expect(ix.assuntos).toEqual([]);
  });
});
