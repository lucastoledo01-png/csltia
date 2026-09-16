import { describe, expect, it } from "vitest";
import { SLIDE_VARIANTS } from "./variants";
import { DEFAULT_TOKENS } from "./tokens";
import type { InstagramSlide, VariantContext } from "./types";

/**
 * A gramática de jornal, e as duas regras que ela quebrou antes de funcionar.
 *
 * O desenho veio de medição de três referências, não de estimativa: o bloco de
 * texto ocupa de 70% a 90,5% da altura, a margem lateral é 9%, o degradê nasce
 * na metade. Isso está no CSS.
 *
 * O que este teste guarda são as duas coisas que a renderização mostrou e que
 * nenhuma leitura de código mostraria.
 */

function ctx(total: number): VariantContext {
  return {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    eyebrowLabel: "",
    ctaText: "",
    slideIndex: 0,
    total,
  };
}

function slide(campos: Partial<InstagramSlide>): InstagramSlide {
  return {
    index: 1,
    type: "cover",
    eyebrow: "",
    title: "",
    body: "",
    highlight_text: "",
    bg_image_url: "",
    inset_image_url: "",
    ...campos,
  } as InstagramSlide;
}

describe("capa de jornal", () => {
  const capa = SLIDE_VARIANTS.cover.capa_jornal;

  /**
   * O script de ajuste encolhe a manchete enquanto ela não couber, e mede
   * `clientHeight`. Sem o gancho, ele não encontra o bloco e a manchete longa
   * cresce por cima da bolha, que foi o que a primeira renderização mostrou.
   */
  it("a manchete é entregue ao medidor do navegador", () => {
    const html = capa.render(slide({ title: "Uma manchete qualquer" }), ctx(1)).body;

    expect(html).toContain('class="j-manchete lay-texto"');
    expect(html).toContain('data-ajuste="encolher"');
    expect(html).toContain('data-max="74"');
    expect(html).toContain('data-min="40"');
  });

  it("a bolha só aparece quando existe uma segunda imagem", () => {
    const sem = capa.render(slide({ title: "T", bg_image_url: "https://a.com/1.jpg" }), ctx(1)).body;
    const com = capa.render(
      slide({ title: "T", bg_image_url: "https://a.com/1.jpg", inset_image_url: "https://a.com/2.jpg" }),
      ctx(1),
    ).body;

    // A bolha é reforço, não requisito: sem ela a capa continua inteira.
    expect(sem).not.toContain("j-bolha");
    expect(com).toContain("j-bolha");
    expect(com).toContain("https://a.com/2.jpg");
  });

  it("sem foto ainda há fundo, e ele não é o creme do shell", () => {
    // O texto desta gramática é branco. Sem fundo próprio, a peça sairia com
    // manchete branca sobre o creme padrão, ou seja ilegível.
    const html = capa.render(slide({ title: "T" }), ctx(1)).body;
    expect(html).toContain("j-fundo");
  });

  it("a peça de várias telas convida a arrastar, a única não", () => {
    const unica = capa.render(slide({ title: "T" }), ctx(1)).body;
    const carrossel = capa.render(slide({ title: "T" }), ctx(5)).body;

    expect(unica).not.toContain("Arrasta");
    expect(carrossel).toContain("Arrasta");
  });

  it("o chapéu some quando a redação não soube nomear a editoria", () => {
    // Imprimir um rótulo padrão seria inventar uma editoria para preencher
    // espaço, que é a regra que a capa de texto já segue.
    const html = capa.render(slide({ title: "T", eyebrow: "" }), ctx(1)).body;
    expect(html).not.toContain("j-chapeu");
  });
});

describe("chamada da newsletter", () => {
  const cta = SLIDE_VARIANTS.cta.cta_newsletter;

  it("pede a palavra que o funil espera, em caixa alta", () => {
    const html = cta.render(slide({ type: "cta", highlight_text: "news" }), ctx(5)).body;
    expect(html).toContain("Comente NEWS");
  });

  it("sem palavra declarada, cai em NEWS e não em vazio", () => {
    const html = cta.render(slide({ type: "cta" }), ctx(5)).body;
    expect(html).toContain("Comente NEWS");
  });
});

describe("a vice-campeã do resolvedor vira a bolha", () => {
  /**
   * A bolha precisa de uma foto que tenha passado pelas MESMAS barreiras da
   * primeira: resolução, licença, temporalidade, figura não central e piso de
   * relevância. Pegar a segunda da lista bruta traria de volta exatamente o que
   * cada barreira recusou, e a capa publicaria em destaque uma imagem que o
   * sistema tinha acabado de rejeitar.
   *
   * Por isso a vice sai de dentro do laço que aprova, e não de um segundo
   * filtro em outro lugar. Este teste guarda a consequência visível disso.
   */
  it("a bolha nunca repete a foto de fundo", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");

    const mesma = { imageUrl: "https://upload.wikimedia.org/a.jpg", attribution: "" };
    const capa = montarCapaDoPost({
      headline: "Uma manchete",
      estiloDaCapa: "carrossel",
      asset: mesma,
      assetSecundario: mesma,
    });

    // O resolvedor já recusa a repetição, e aqui a regra é reafirmada no ponto
    // em que ela aparece para quem vê: mesma foto no fundo e no círculo é pior
    // que capa sem bolha.
    expect(capa.slide.bg_image_url).toBe(mesma.imageUrl);
    expect(capa.slide.inset_image_url).toBe("");
  });

  it("sem foto principal não há bolha, mesmo com segunda imagem", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");

    const capa = montarCapaDoPost({
      headline: "Uma manchete",
      estiloDaCapa: "carrossel",
      asset: null,
      assetSecundario: { imageUrl: "https://upload.wikimedia.org/b.jpg", attribution: "" },
    });

    // Sem foto a capa é a peça tipográfica, que não tem onde pôr um círculo.
    expect(capa.slide.inset_image_url).toBe("");
  });
  it("com duas fotos diferentes, a bolha aparece", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");

    const capa = montarCapaDoPost({
      headline: "Uma manchete",
      estiloDaCapa: "carrossel",
      asset: { imageUrl: "https://upload.wikimedia.org/fundo.jpg", attribution: "" },
      assetSecundario: { imageUrl: "https://upload.wikimedia.org/bolha.jpg", attribution: "" },
    });

    // Sem este caso, os dois testes acima passariam com a bolha desligada para
    // sempre, que é o jeito mais fácil de nunca repetir foto.
    expect(capa.slide.inset_image_url).toBe("https://upload.wikimedia.org/bolha.jpg");
  });
});
