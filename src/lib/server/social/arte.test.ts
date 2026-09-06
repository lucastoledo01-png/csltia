import { describe, expect, it } from "vitest";
import { diagnosticarLayout, layoutCarregaAFoto, montarCapaDoPost, publicavelSemFoto } from "./arte";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { resolveFormatConfig } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { AssetVisual } from "../visual/tipos";
import type { Layout } from "@/lib/carousel-templates/layout";

function asset(over: Partial<AssetVisual> = {}): AssetVisual {
  return {
    entityName: "Departamento de Estado",
    entityNormalized: "departamento de estado",
    entityType: "organizacao",
    source: "wikimedia_commons",
    sourceAssetId: "Harry_S._Truman_Building.jpg",
    imageUrl: "https://upload.wikimedia.org/foto.jpg",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Harry_S._Truman_Building.jpg",
    author: "Ser Amantio di Nicolao",
    license: "CC BY-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    attribution: "Foto: Ser Amantio di Nicolao / Wikimedia Commons, CC BY-SA 3.0",
    rightsStatement: "cc-by-sa-3.0",
    rightsStatus: "verified",
    rightsCheckedAt: "2026-09-04T00:00:00Z",
    sourceLastCheckedAt: "2026-09-04T00:00:00Z",
    width: 2400,
    height: 1600,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0.8,
    imageContextType: "entity_reference",
    metadata: {},
    ...over,
  };
}

function montar(slide: ReturnType<typeof montarCapaDoPost>): string {
  return assembleSlide(slide.slide, {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    formatConfig: resolveFormatConfig("noticia"),
    slideIndex: 1,
    total: 1,
    layout: null,
    credito: slide.credito,
  });
}

describe("capa do post do feed", () => {
  it("a foto aprovada é a única imagem que entra na arte", () => {
    const capa = montarCapaDoPost({ headline: "Ordem suspende política do Diversity Visa", asset: asset() });

    expect(capa.comFoto).toBe(true);
    expect(capa.slide.bg_image_url).toBe("https://upload.wikimedia.org/foto.jpg");
    // O campo que o renderizador antigo usa como consulta e como prompt.
    expect(capa.slide.cover_image_prompt).toBe("");
  });

  it("sem asset aprovado a capa é de texto, e diz por quê", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem suspende política do Diversity Visa",
      eixo: "outro",
      asset: null,
      motivoSemFoto: "NO_VALID_IMAGE",
    });

    expect(capa.comFoto).toBe(false);
    expect(capa.slide.bg_image_url).toBe("");
    expect(capa.variante).toBe("brand_card");
    expect(capa.motivoSemFoto).toBe("NO_VALID_IMAGE");
    // A sobrancelha devolve a referência que a foto daria.
    expect(capa.slide.eyebrow).toBe("");
  });

  it("o eixo vira rótulo escrito, não o valor cru da classificação", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem manda USCIS retomar pedidos pendentes",
      eixo: "decisao_judicial",
      asset: null,
    });
    expect(capa.slide.eyebrow).toBe("DECISÃO JUDICIAL");
    expect(capa.slide.eyebrow).not.toContain("_");
  });

  it("eixo sem rótulo não inventa editoria", () => {
    expect(montarCapaDoPost({ headline: "Título qualquer serve", eixo: "outro", asset: null }).slide.eyebrow).toBe("");
    expect(montarCapaDoPost({ headline: "Título qualquer serve", eixo: "xpto", asset: null }).slide.eyebrow).toBe("");
  });

  it("capa sem foto nunca cai numa variante que precisa de foto", () => {
    const capa = montarCapaDoPost({ headline: "Título qualquer que serve", asset: null });
    const html = montar(capa);
    // `s-photo` é a camada de fundo fotográfico. O nome aparece no CSS base de
    // todo slide; o que não pode aparecer é a div.
    expect(html).not.toContain(`<div class="s-photo`);
    expect(html).toContain("Título qualquer que serve");
  });

  it("a atribuição exigida pela licença é impressa na arte", () => {
    const capa = montarCapaDoPost({ headline: "Ordem suspende política do Diversity Visa", asset: asset() });
    const html = montar(capa);

    expect(html).toContain(`<div class="s-credito">`);
    expect(html).toContain("Ser Amantio di Nicolao");
    expect(html).toContain("CC BY-SA 3.0");
  });

  it("licença que não exige atribuição não imprime tira de crédito", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem suspende política do Diversity Visa",
      asset: asset({ license: "PD-USGov", attribution: "" }),
    });
    const html = montar(capa);

    expect(capa.credito).toBe("");
    expect(html).not.toContain(`<div class="s-credito">`);
  });

  it("o crédito é escapado, não injetado", () => {
    const capa = montarCapaDoPost({
      headline: "Título qualquer que serve",
      asset: asset({ attribution: 'Foto: <script>alert("x")</script>' }),
    });
    const html = montar(capa);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("o desenho do painel só manda quando consegue mostrar a foto", () => {
  /** O desenho de `noticia/cover` como está em produção: sem bloco de imagem. */
  const comoEstaEmProducao = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "veu", tipo: "forma", x: 0, y: 0, w: 100, h: 18, z: 2 },
      { id: "marca", tipo: "texto", slot: "marca", x: 20, y: 4, w: 60, h: 5, z: 3, cor: "#FFFFFF" },
      { id: "titulo", tipo: "texto", slot: "titulo", x: 6, y: 57, w: 88, h: 24, z: 4, cor: "#FFFFFF" },
    ],
  } as unknown as Layout;

  const comFoto = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "foto", tipo: "imagem", imagem: "fundo", x: 0, y: 0, w: 100, h: 100, z: 1 },
      ...comoEstaEmProducao.blocks,
    ],
  } as unknown as Layout;

  it("desenho sem bloco de imagem não carrega a foto", () => {
    expect(layoutCarregaAFoto(comoEstaEmProducao)).toBe(false);
  });

  it("desenho com bloco de fundo carrega", () => {
    expect(layoutCarregaAFoto(comFoto)).toBe(true);
  });

  it("bloco de imagem fixa não conta: não é a foto da notícia", () => {
    const fixa = {
      canvas: comFoto.canvas,
      blocks: [{ id: "f", tipo: "imagem", imagem: "fixa", imagemUrl: "https://x/y.png", x: 0, y: 0, w: 100, h: 100, z: 1 }],
    } as unknown as Layout;
    expect(layoutCarregaAFoto(fixa)).toBe(false);
  });

  it("sem desenho nenhum, a variante de código assume", () => {
    expect(layoutCarregaAFoto(null)).toBe(false);
    expect(layoutCarregaAFoto({ canvas: comFoto.canvas, blocks: [] } as unknown as Layout)).toBe(false);
  });
});

describe("o diagnóstico do desenho tem nome", () => {
  const semSlot = {
    canvas: { width: 1080, height: 1350 },
    blocks: [{ id: "t", tipo: "texto", slot: "titulo", x: 6, y: 57, w: 88, h: 24, z: 4 }],
  } as unknown as Layout;

  const comSlot = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "f", tipo: "imagem", imagem: "fundo", x: 0, y: 0, w: 100, h: 100, z: 1 },
      ...semSlot.blocks,
    ],
  } as unknown as Layout;

  it("desenho salvo sem bloco de imagem é LAYOUT_MISSING_IMAGE_SLOT", () => {
    expect(diagnosticarLayout(semSlot, true)).toBe("LAYOUT_MISSING_IMAGE_SLOT");
  });

  it("desenho completo é usado", () => {
    expect(diagnosticarLayout(comSlot, true)).toBe("LAYOUT_USED");
  });

  it("sem desenho nenhum não é defeito de desenho", () => {
    expect(diagnosticarLayout(null, true)).toBe("LAYOUT_NOT_DESIGNED");
  });

  it("capa de texto não julga o desenho: ele não entra em jogo", () => {
    expect(diagnosticarLayout(semSlot, false)).toBe("LAYOUT_NOT_APPLICABLE_NO_PHOTO");
    expect(diagnosticarLayout(comSlot, false)).toBe("LAYOUT_NOT_APPLICABLE_NO_PHOTO");
  });

  it("o diagnóstico não contradiz a decisão de usar o desenho", () => {
    expect(layoutCarregaAFoto(semSlot)).toBe(false);
    expect(layoutCarregaAFoto(comSlot)).toBe(true);
  });
});

describe("falta de imagem não elimina o post", () => {
  it("o formato do feed publica sem fotografia", () => {
    // É a regra: NO_VALID_VISUAL_ASSET é decisão editorial, não erro.
    expect(publicavelSemFoto("noticia")).toBe(true);
  });

  it("o carrossel de texto também", () => {
    expect(publicavelSemFoto("tutorial")).toBe(true);
  });

  it("o formato que existe para mostrar imagem, não", () => {
    // Sem imagem não há o que mostrar, e um card escrito "aqui teria uma
    // imagem" é pior que não postar.
    expect(publicavelSemFoto("prompt")).toBe(false);
  });
});
