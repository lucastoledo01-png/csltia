import { describe, expect, it } from "vitest";
import { juntarPautasEArtigos, montarHome, type ArtigoDoRamo, type PautaDoPortal } from "./portal";

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
