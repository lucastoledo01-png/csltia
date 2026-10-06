import { describe, expect, it, vi } from "vitest";
import { creditoCompleto, creditoDoAsset, creditoPorEndereco, htmlDoCredito, legendaNeutra, textoDoCredito } from "./credito-da-capa";
import { imagensDaCapaParaJsonLd, semImagemDaCapaNoCorpo } from "./imagem-da-capa";
import { conferenciaDaCapa } from "./server/estrutura-da-materia";
import { dadosEstruturadosDoArtigo } from "./server/dados-estruturados-do-artigo";
import { resolverCreditoDaCapa } from "./server/capa-da-materia";

/**
 * A capa com crédito, legenda e endereço limpo (06/10/2026). A auditoria de
 * estrutura achou 1 de 2 publicadas sem crédito, 1 sem legenda e 1 com
 * `&amp;` gravado no endereço da capa.
 */

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/1/16/Retrato_(2025).jpg?utm_source=commons.wikimedia.org";
const PEXELS_TORTO = "https://images.pexels.com/photos/27451140/pexels-photo-27451140.jpeg?auto=compress&amp%3Bcs=tinysrgb&amp%3Bdpr=2&w=600&h=360&fit=crop";

describe("o crédito", () => {
  it("autor, licença e origem, com o link da página do arquivo e a medida", () => {
    const c = creditoDoAsset({
      source: "wikimedia_commons",
      imageUrl: COMMONS,
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Retrato_(2025).jpg",
      author: "<a href='x'>Daniel Torok</a>",
      license: "Public domain",
      width: 1638,
      height: 2048,
    });
    expect(textoDoCredito(c!)).toBe("Foto: Daniel Torok, Public domain, via Wikimedia Commons");
    expect(creditoCompleto(c)).toBe(true);
    expect(htmlDoCredito(c!)).toBe(
      '<p class="credito-da-foto" data-largura="1638" data-altura="2048"><a href="https://commons.wikimedia.org/wiki/File:Retrato_(2025).jpg" rel="noopener" target="_blank">Foto: Daniel Torok, Public domain, via Wikimedia Commons</a></p>',
    );
  });

  it("o crédito gravado volta da página com o texto, o link e a medida", () => {
    const c = creditoDoAsset({ source: "wikimedia_commons", imageUrl: COMMONS, sourcePageUrl: "https://commons.wikimedia.org/wiki/File:A.jpg?x=1&y=2", author: "Fulano", license: "CC BY-SA 4.0", width: 2000, height: 1000 });
    const r = semImagemDaCapaNoCorpo(`${htmlDoCredito(c!)}<section><p>texto</p></section>`, COMMONS);
    expect(r.creditoDaCapa).toBe("Foto: Fulano, CC BY-SA 4.0, via Wikimedia Commons");
    expect(r.creditoDaCapaHref).toBe("https://commons.wikimedia.org/wiki/File:A.jpg?x=1&y=2");
    expect(r.dimensoesDaCapa).toEqual({ largura: 2000, altura: 1000 });
    expect(r.html).toBe("<section><p>texto</p></section>");
  });

  it("o autor com HTML não injeta nada", () => {
    const html = htmlDoCredito({ autor: '"><script>x</script>', licenca: "CC BY 4.0", origem: "Commons", href: "javascript:alert(1)" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });

  it("pelo endereço: o Pexels vai para a página da foto, desfeito de &amp;", () => {
    expect(creditoPorEndereco(PEXELS_TORTO)).toEqual({ autor: "", licenca: "Licença Pexels", origem: "Pexels", href: "https://www.pexels.com/photo/27451140/" });
    expect(creditoPorEndereco(COMMONS)?.href).toBe("https://commons.wikimedia.org/wiki/File:Retrato_(2025).jpg");
    // Sem autor não é crédito completo: a página segue perguntando à origem.
    expect(creditoCompleto(creditoPorEndereco(PEXELS_TORTO))).toBe(false);
  });

  it("a legenda neutra diz só o assunto", () => {
    expect(legendaNeutra("data centers")).toBe("Imagem ilustrativa: data centers.");
    expect(legendaNeutra("")).toBe("Imagem ilustrativa.");
  });

  it("resolve na página do arquivo do Commons, e falha cai no crédito do endereço", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        query: {
          pages: {
            "1": {
              title: "File:Retrato (2025).jpg",
              imageinfo: [
                {
                  url: COMMONS,
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Retrato_(2025).jpg",
                  width: 1638,
                  height: 2048,
                  mime: "image/jpeg",
                  extmetadata: { Artist: { value: "<b>Daniel Torok</b>" }, LicenseShortName: { value: "Public domain" } },
                },
              ],
            },
          },
        },
      }),
    );
    const c = await resolverCreditoDaCapa(COMMONS, { fetcher: fetcher as never, env: {} });
    expect(textoDoCredito(c!)).toBe("Foto: Daniel Torok, Public domain, via Wikimedia Commons");
    expect(c?.largura).toBe(1638);
    const quebrado = await resolverCreditoDaCapa(COMMONS, { fetcher: (async () => new Response("", { status: 500 })) as never, env: {} });
    expect(quebrado?.href).toBe("https://commons.wikimedia.org/wiki/File:Retrato_(2025).jpg");
  });
});

describe("o image do NewsArticle com largura e altura", () => {
  it("Pexels: os três cortes, cada um com a medida que o corte garante, e sem &amp;", () => {
    const imagens = imagensDaCapaParaJsonLd(PEXELS_TORTO);
    expect(imagens).toHaveLength(3);
    for (const i of imagens) {
      expect(typeof i).not.toBe("string");
      if (typeof i === "string") continue;
      expect(i.url).not.toContain("amp");
      const u = new URL(i.url);
      expect(Number(u.searchParams.get("w"))).toBe(i.width);
      expect(Number(u.searchParams.get("h"))).toBe(i.height);
      expect(u.searchParams.get("fit")).toBe("crop");
    }
  });

  it("Commons: miniatura de 1280 com a altura pela proporção; sem medida, o endereço puro, como era", () => {
    const comMedida = imagensDaCapaParaJsonLd("https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg", { largura: 4000, altura: 3000 });
    expect(comMedida).toEqual([
      { "@type": "ImageObject", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Wall_Street.jpg/1280px-Wall_Street.jpg", width: 1280, height: 960 },
    ]);
    expect(imagensDaCapaParaJsonLd("https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg")).toEqual([
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Wall_Street.jpg/1280px-Wall_Street.jpg",
    ]);
  });

  it("o NewsArticle lê a medida do crédito gravado no corpo", () => {
    const g = dadosEstruturadosDoArtigo(
      {
        slug: "x",
        title: "t",
        cover_image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg",
        content_html: htmlDoCredito({ autor: "A", licenca: "CC BY 4.0", origem: "Wikimedia Commons", href: "https://commons.wikimedia.org/wiki/File:Wall_Street.jpg", largura: 2560, altura: 1440 }),
      },
      { perguntasVisiveis: [] },
    ) as { "@graph": Array<Record<string, unknown>> };
    const materia = g["@graph"].find((n) => n["@type"] === "NewsArticle");
    expect(materia?.image).toEqual([{ "@type": "ImageObject", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Wall_Street.jpg/1280px-Wall_Street.jpg", width: 1280, height: 720 }]);
    expect(materia?.isAccessibleForFree).toBe(true);
  });
});

describe("a conferência da capa na auditoria", () => {
  it("acusa endereço torto, falta de legenda e de crédito; a linha consertada passa", () => {
    const torta = conferenciaDaCapa({ slug: "a", title: "t", cover_image: PEXELS_TORTO, content_html: "<p>texto</p>" });
    expect(torta.problemas).toEqual(["endereço da capa gravado com &amp;", "sem legenda gravada (a página desenha a neutra)", "sem crédito gravado (a página resolve na origem)"]);
    const certa = conferenciaDaCapa({
      slug: "a",
      title: "t",
      cover_image: "https://images.pexels.com/photos/27451140/a.jpeg",
      content_html: `<p class="legenda-da-capa">Imagem ilustrativa: x.</p>${htmlDoCredito({ autor: "Klea", licenca: "Licença Pexels", origem: "Pexels", href: "https://www.pexels.com/photo/27451140/" })}<p>texto</p>`,
    });
    expect(certa.problemas).toEqual([]);
    const semAutor = conferenciaDaCapa({
      slug: "a",
      title: "t",
      cover_image: "https://images.pexels.com/photos/27451140/a.jpeg",
      content_html: `<p class="legenda-da-capa">x</p>${htmlDoCredito({ autor: "", licenca: "Licença Pexels", origem: "Pexels", href: "https://www.pexels.com/photo/27451140/" })}`,
    });
    expect(semAutor.problemas).toEqual(["crédito gravado sem autor, licença ou link"]);
  });
});
