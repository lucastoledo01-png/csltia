import { describe, expect, it } from "vitest";
import {
  aparaSlidesParaFormato,
  InstagramCarouselSchema,
  legendaDeEmergencia,
  SLIDES_POR_FORMATO,
} from "./schemas";

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

describe("escalonamento das vagas", () => {
  it("uma execução tardia não vence todos os horários de uma vez", () => {
    // Reproduz o caso real: a edição rodou às 18h44 e 09:30, 12:30 e 16:00 já
    // tinham passado. O worker encontrou três vagas vencidas e despejou os
    // posts em sequência no perfil.
    //
    // A regra é `max(horário configurado, próxima janela livre)`, com 90
    // minutos entre vagas.
    const agora = new Date("2026-09-04T21:44:00Z").getTime();
    const horariosUTC = ["09:30", "12:30", "16:00", "19:00"].map((h) =>
      new Date(`2026-09-04T${h}:00Z`).getTime(),
    );

    const ESPACAMENTO = 90 * 60_000;
    let proximo = agora + 5 * 60_000;
    const quando = horariosUTC.map((h) => {
      const t = Math.max(h, proximo);
      proximo = t + ESPACAMENTO;
      return t;
    });

    // Nenhuma vaga no passado.
    for (const t of quando) expect(t).toBeGreaterThanOrEqual(agora);

    // E cada uma ao menos 90 minutos depois da anterior.
    for (let i = 1; i < quando.length; i++) {
      expect(quando[i] - quando[i - 1]).toBeGreaterThanOrEqual(ESPACAMENTO);
    }
  });

  it("execução no horário respeita os horários configurados", () => {
    // A correção não pode empurrar o dia normal: às 9h da manhã todos os
    // horários ainda estão por vir e valem como escritos.
    const agora = new Date("2026-09-04T09:03:00Z").getTime();
    const horariosUTC = ["09:30", "12:30", "16:00", "19:00"].map((h) =>
      new Date(`2026-09-04T${h}:00Z`).getTime(),
    );

    let proximo = agora + 5 * 60_000;
    const quando = horariosUTC.map((h) => {
      const t = Math.max(h, proximo);
      proximo = t + 90 * 60_000;
      return t;
    });

    expect(quando).toEqual(horariosUTC);
  });
});

describe("legenda ausente", () => {
  it("é remontada a partir da capa em vez de derrubar o post", () => {
    // Aconteceu em produção: o modelo entregou os slides e omitiu a legenda,
    // nas duas tentativas. A arte estava pronta e a pauta certa, e o post do
    // dia não foi ao ar por causa de um objeto ausente.
    const bruto = {
      title: "Interno",
      slides: [{ index: 1, type: "cover", title: "USCIS estende prazo em 30 dias", body: "O aviso vale a partir da publicação." }],
    };

    const r = legendaDeEmergencia(bruto, "VISA", ["#imigracao", "#eua"]) as {
      caption: { headline: string; cta_call: string; full_caption: string; hashtags: string[] };
    };

    expect(r.caption.headline).toContain("USCIS");
    expect(r.caption.cta_call).toContain("VISA");
    expect(r.caption.full_caption.length).toBeGreaterThan(20);
    expect(r.caption.hashtags).toContain("#imigracao");
  });

  it("não toca na legenda quando o modelo devolveu uma", () => {
    const bruto = { caption: { headline: "escrita pelo modelo" }, slides: [] };
    expect(legendaDeEmergencia(bruto, "VISA", [])).toBe(bruto);
  });

  it("desiste quando não há nem título de capa", () => {
    // Sem título não há do que montar legenda, e inventar texto seria pior
    // que falhar: o post sairia dizendo algo que ninguém escreveu.
    const bruto = { slides: [] };
    expect(legendaDeEmergencia(bruto, "VISA", [])).toBe(bruto);
  });
});
