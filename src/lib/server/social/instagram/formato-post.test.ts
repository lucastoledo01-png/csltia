import { describe, expect, it } from "vitest";
import { aparaSlidesParaFormato, InstagramCarouselSchema, SLIDES_POR_FORMATO } from "./schemas";

/**
 * A forma de cada formato, travada no schema.
 *
 * Era um `min(4).max(12)` único para os três, o que amarrava todos à forma de
 * carrossel. Só o `tutorial` é carrossel de texto: `noticia` é capa só e
 * `prompt` é capa mais os resultados em tela cheia.
 *
 * A regra tem que morar aqui, e não só no prompt: deixá-la no prompt torna
 * "a IA gerou 5 slides para uma notícia" um post errado publicado, em vez de
 * um erro de validação.
 */

const CAPTION = {
  headline: "Manchete de teste do post",
  intro_summary: "Resumo de introdução com tamanho suficiente para o schema.",
  key_takeaways: ["primeiro ponto", "segundo ponto"],
  cta_call: "Comente NEWS para receber no Direct",
  hashtags: ["#ia", "#instagram", "#desbuguei"],
  full_caption: "Legenda completa com tamanho suficiente para passar no schema de validação do carrossel.",
};

function carrossel(format: "noticia" | "tutorial" | "prompt", tipos: string[]) {
  return {
    title: "Post de teste do desbuguei",
    edition_date: "2026-09-04",
    primary_topic: "Inteligência Artificial",
    format,
    slides: tipos.map((type, i) => ({ index: i + 1, type, title: `Slide ${i + 1} de teste` })),
    caption: CAPTION,
  };
}

describe("quantidade de slides por formato", () => {
  it("noticia aceita exatamente uma capa", () => {
    expect(InstagramCarouselSchema.safeParse(carrossel("noticia", ["cover"])).success).toBe(true);
  });

  it("noticia RECUSA um segundo slide", () => {
    // Era o que fazia a notícia sair como carrossel de 5 slides.
    const r = InstagramCarouselSchema.safeParse(carrossel("noticia", ["cover", "cover"]));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("noticia");
  });

  it("prompt precisa da capa mais ao menos um resultado", () => {
    expect(InstagramCarouselSchema.safeParse(carrossel("prompt", ["cover"])).success).toBe(false);
    expect(InstagramCarouselSchema.safeParse(carrossel("prompt", ["cover", "gallery"])).success).toBe(true);
  });

  it("tutorial segue exigindo carrossel de verdade", () => {
    expect(InstagramCarouselSchema.safeParse(carrossel("tutorial", ["cover", "step", "step"])).success).toBe(false);
    expect(
      InstagramCarouselSchema.safeParse(carrossel("tutorial", ["cover", "step", "step", "tip", "cta"])).success,
    ).toBe(true);
  });

  it("nenhum formato aceita mais de 12 slides", () => {
    for (const [, regra] of Object.entries(SLIDES_POR_FORMATO)) {
      expect(regra.max).toBeLessThanOrEqual(12);
      expect(regra.min).toBeGreaterThanOrEqual(1);
      expect(regra.min).toBeLessThanOrEqual(regra.max);
    }
  });
});

describe("escolha do tipo de post na Meta", () => {
  /**
   * O worker deriva o tipo da quantidade de slides, não do formato. É a
   * contagem que a API da Meta exige que case com o container: um slide vira
   * post de imagem única, dois ou mais viram carrossel.
   *
   * Mandar `is_carousel_item=true` num post solo cria uma mídia que nunca
   * aparece no feed — fica pendurada esperando um carrossel que não vem.
   */
  function tipoDePost(quantidadeDeSlides: number): "imagem_unica" | "carrossel" | "invalido" {
    if (quantidadeDeSlides === 0) return "invalido";
    return quantidadeDeSlides === 1 ? "imagem_unica" : "carrossel";
  }

  it("um slide vira imagem única", () => {
    expect(tipoDePost(1)).toBe("imagem_unica");
  });

  it("dois ou mais viram carrossel", () => {
    expect(tipoDePost(2)).toBe("carrossel");
    expect(tipoDePost(8)).toBe("carrossel");
  });

  it("zero slide não publica nada", () => {
    expect(tipoDePost(0)).toBe("invalido");
  });
});

describe("aparo dos slides antes de validar", () => {
  it("apara a notícia que veio como carrossel para a capa só", () => {
    // O caso que custaria o post do dia: o prompt pede 1 slide e o modelo
    // entrega 5. O excedente é justamente o que passou para a legenda.
    const bruto = carrossel("noticia", ["cover", "intro", "content", "practical_impact", "cta"]);
    const aparado = aparaSlidesParaFormato(bruto) as typeof bruto;

    expect(aparado.slides).toHaveLength(1);
    expect(aparado.slides[0].type).toBe("cover");
    expect(InstagramCarouselSchema.safeParse(aparado).success).toBe(true);
  });

  it("reindexa depois de aparar", () => {
    const aparado = aparaSlidesParaFormato(
      carrossel("prompt", ["cover", "gallery", "gallery"]),
    ) as ReturnType<typeof carrossel>;
    expect(aparado.slides.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("não mexe no que já cabe", () => {
    const bruto = carrossel("tutorial", ["cover", "step", "step", "tip", "cta"]);
    expect(aparaSlidesParaFormato(bruto)).toBe(bruto);
  });

  it("NÃO inventa slide quando vem menos que o mínimo", () => {
    // Completar para cima significaria publicar conteúdo que ninguém escreveu.
    // Aqui a validação tem que recusar mesmo.
    const aparado = aparaSlidesParaFormato(carrossel("prompt", ["cover"]));
    expect(InstagramCarouselSchema.safeParse(aparado).success).toBe(false);
  });

  it("aguenta entrada malformada sem explodir", () => {
    expect(aparaSlidesParaFormato(null)).toBe(null);
    expect(aparaSlidesParaFormato({ format: "noticia" })).toEqual({ format: "noticia" });
  });
});
