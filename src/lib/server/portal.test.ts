import { describe, expect, it } from "vitest";
import {
  juntarPautasEArtigos,
  montarHome,
  pautasDaEditoria,
  pautasDasEdicoes,
  secoesEmFoco,
  type ArtigoDoRamo,
  type EdicaoBruta,
  type PautaDoPortal,
} from "./portal";

/**
 * A home com as matérias próprias do portal (integração de 05/10/2026).
 */

function pautaDaEdicao(i: number, data = "2026-10-06"): PautaDoPortal {
  return {
    id: `edicao-${data}#${i}`,
    titulo: `pauta ${i}`,
    resumo: "",
    rotulo: "Economia",
    editoria: "economia",
    imagem: null,
    fonte: "",
    data,
    href: `/artigos/edicao-${data}`,
  };
}

function artigo(slug: string, quando: string, fonte = `https://fonte.com/${slug}`): ArtigoDoRamo {
  return {
    slug,
    title: `Matéria ${slug}`,
    excerpt: "resumo",
    cover_image: "https://x/capa.jpg",
    category: "Tecnologia",
    published_at: quando,
    source_urls: [fonte],
  };
}

describe("a home com as matérias dos ramos", () => {
  it("o artigo que É a edição não entra: ela já está na home, desmontada em pautas", () => {
    const r = juntarPautasEArtigos([pautaDaEdicao(0)], [artigo("edicao-2026-10-06", "2026-10-06T09:07:00Z")]);
    expect(r.map((p) => p.id)).toEqual(["edicao-2026-10-06#0"]);
  });

  it("a mesma fonte na edição e numa matéria própria: fica a matéria, sai a pauta repetida", () => {
    const r = juntarPautasEArtigos(
      [pautaDaEdicao(0), pautaDaEdicao(1)],
      [artigo("chip", "2026-10-06T15:00:00Z", "https://fonte.com/chip")],
      "America/Sao_Paulo",
      new Map([["edicao-2026-10-06#1", "https://fonte.com/chip"]]),
    );
    expect(r.map((p) => p.id)).toEqual(["artigo:chip", "edicao-2026-10-06#0"]);
  });

  it("mais recente primeiro, e a ordem das pautas dentro da edição é preservada", () => {
    const r = juntarPautasEArtigos(
      [pautaDaEdicao(0, "2026-10-06"), pautaDaEdicao(1, "2026-10-06"), pautaDaEdicao(0, "2026-10-05")],
      [artigo("ontem", "2026-10-05T21:00:00Z"), artigo("hoje", "2026-10-06T15:00:00Z")],
    );
    expect(r.map((p) => p.id)).toEqual([
      "artigo:hoje",
      "edicao-2026-10-06#0",
      "edicao-2026-10-06#1",
      "artigo:ontem",
      "edicao-2026-10-05#0",
    ]);
  });

  it("a matéria vira card com editoria, link próprio e a data no fuso do projeto", () => {
    const [p] = juntarPautasEArtigos([], [artigo("chip", "2026-10-07T01:30:00Z")], "America/Sao_Paulo");
    expect(p).toMatchObject({ href: "/artigos/chip", editoria: "tecnologia", data: "2026-10-06", imagem: "https://x/capa.jpg" });
    // E ela cabe nos blocos da home como qualquer pauta.
    expect(montarHome([p]).destaque?.id).toBe("artigo:chip");
  });

  it("sem matérias, a lista é a das edições, intacta", () => {
    const pautas = [pautaDaEdicao(0), pautaDaEdicao(1)];
    expect(juntarPautasEArtigos(pautas, [])).toEqual(pautas);
  });
});

describe("as pautas das edições depois das matérias por pauta (05/10/2026)", () => {
  const edicao: EdicaoBruta = {
    edition_date: "2026-10-04",
    slug: "edicao-2026-10-04",
    content_html: "",
    stories: [
      { title: "Fed corta juros", category: "Economia", source_url: "https://f.com/fed" },
      { title: "EUA admitem refugiados", category: "Imigração", source_url: "https://f.com/ref" },
      { title: "Chip novo da AMD", category: "Tecnologia", source_url: "https://f.com/chip" },
    ],
  };

  it("antes do script, a pauta aponta para a edição, que ainda está publicada", () => {
    const { pautas } = pautasDasEdicoes([edicao]);
    expect(pautas.map((p) => p.href)).toEqual(["/artigos/edicao-2026-10-04", "/artigos/edicao-2026-10-04"]);
  });

  it("com a matéria publicada, a pauta aponta direto para ela, pelo mesmo slug que o script grava", () => {
    const { pautas } = pautasDasEdicoes([edicao], new Set(["chip-novo-da-amd-2026-10-04"]));
    expect(pautas.map((p) => p.href)).toEqual(["/artigos/edicao-2026-10-04", "/artigos/chip-novo-da-amd-2026-10-04"]);
  });

  it("a pauta de imigração sai da home", () => {
    const { pautas, fontesDasPautas } = pautasDasEdicoes([edicao]);
    expect(pautas.map((p) => p.titulo)).toEqual(["Fed corta juros", "Chip novo da AMD"]);
    // O id continua sendo a posição na edição, para a foto e a fonte casarem.
    expect(pautas.map((p) => p.id)).toEqual(["edicao-2026-10-04#0", "edicao-2026-10-04#2"]);
    expect(fontesDasPautas.has("edicao-2026-10-04#1")).toBe(false);
  });
});

describe("seções em foco", () => {
  function p(id: string, editoria: PautaDoPortal["editoria"], imagem: string | null): PautaDoPortal {
    return { ...pautaDaEdicao(0), id, editoria, imagem };
  }

  it("um card por editoria, sempre as seis, na ordem do menu", () => {
    expect(secoesEmFoco([]).map((s) => s.editoria)).toEqual(["economia", "trabalho", "tecnologia", "custo-de-vida", "governo", "brasil"]);
    expect(montarHome([]).secoes).toHaveLength(6);
  });

  it("a foto é a da pauta mais recente COM foto; sem nenhuma, fica sem foto", () => {
    const pautas = [p("a", "economia", null), p("b", "economia", "https://x/b.jpg"), p("c", "economia", "https://x/c.jpg")];
    const [economia, trabalho] = secoesEmFoco(pautas);
    expect(economia).toEqual({ editoria: "economia", imagem: "https://x/b.jpg", total: 3 });
    expect(trabalho).toEqual({ editoria: "trabalho", imagem: null, total: 0 });
  });

  it("a mesma foto não se repete na fileira enquanto a editoria tiver outra", () => {
    const pautas = [
      p("a", "economia", "https://x/wall-street.jpg"),
      p("b", "trabalho", "https://x/wall-street.jpg"),
      p("c", "trabalho", "https://x/fabrica.jpg"),
      p("d", "tecnologia", "https://x/wall-street.jpg"),
    ];
    expect(secoesEmFoco(pautas).slice(0, 3).map((s) => s.imagem)).toEqual([
      "https://x/wall-street.jpg",
      "https://x/fabrica.jpg",
      // Sem outra foto, a repetida é melhor que nenhuma.
      "https://x/wall-street.jpg",
    ]);
  });

  it("a página da editoria lista só as pautas dela, na ordem em que chegaram", () => {
    const pautas = [p("a", "economia", null), p("b", "brasil", null), p("c", "economia", null)];
    expect(pautasDaEditoria(pautas, "economia").map((x) => x.id)).toEqual(["a", "c"]);
  });
});
