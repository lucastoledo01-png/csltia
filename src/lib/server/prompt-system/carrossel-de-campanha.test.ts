import { describe, expect, it } from "vitest";
import { InstagramCarouselSchema } from "../social/instagram/schemas";

/**
 * A montagem do post do formato `prompt` é determinística e não chama LLM,
 * então o que precisa de teste é o encaixe no schema: os limites de tamanho da
 * legenda são estreitos e um título longo do conceito estouraria a validação
 * bem depois, dentro do worker, quinze minutos após o agendamento.
 *
 * Os testes replicam a forma que `montarCarrosselDeCampanha` produz, sem
 * banco. O que eles travam é o contrato, que é onde o erro sai caro.
 */

function carrosselDeCampanha(opts: {
  titulo: string;
  conceito?: string;
  aplicacoes?: string[];
  keyword?: string;
  imagens: number;
}) {
  const { titulo, conceito = "", aplicacoes = [], keyword = "GTA26", imagens } = opts;

  const limitar = (t: string, max: number) => {
    const l = t.trim().replace(/\s+/g, " ");
    if (l.length <= max) return l;
    const c = l.slice(0, max - 1);
    const e = c.lastIndexOf(" ");
    return (e > max * 0.6 ? c.slice(0, e) : c).trim() + "…";
  };
  const aoMenos = (t: string, min: number, comp: string) =>
    t.trim().length >= min ? t.trim() : `${t.trim()} ${comp}`.trim();

  const chamada = `Comente ${keyword} e eu te mando os prompts exatos no Direct.`;
  const resumo = aoMenos(conceito || titulo, 20, "Os prompts exatos que geraram estes resultados.");

  const slide = (index: number, type: "cover" | "gallery", t: string) => ({
    index,
    type,
    eyebrow: type === "cover" ? "ULTRAPROMPT" : "",
    title: limitar(t, 120),
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "",
    cover_variant: "dark_speaker" as const,
    headline_style: "clean" as const,
    cover_image_prompt: "",
    bg_image_url: `https://exemplo.test/${index}.png`,
    cta_text: "",
  });

  return {
    title: limitar(titulo, 100),
    edition_date: "2026-09-04",
    primary_topic: limitar(titulo, 80),
    target_audience_focus: "Criadores, Vendedores & Empreendedores",
    format: "prompt" as const,
    slides: [
      slide(1, "cover", titulo),
      ...Array.from({ length: imagens }, (_, i) => slide(i + 2, "gallery", `PROMPT ${i + 1}`)),
    ],
    caption: {
      headline: aoMenos(limitar(titulo, 100), 10, "— UltraPrompt"),
      intro_summary: limitar(resumo, 300),
      key_takeaways:
        aplicacoes.length >= 2
          ? aplicacoes.slice(0, 5).map((a) => limitar(a, 120))
          : ["Os prompts exatos, um por resultado", "O que trocar para adaptar ao seu caso"],
      cta_call: limitar(chamada, 150),
      hashtags: ["#ia", "#prompts", "#inteligenciaartificial", "#desbuguei", "#criadoresdeconteudo"],
      full_caption: limitar(aoMenos(`${titulo}\n\n${resumo}\n\n${chamada}`, 50, chamada), 2000),
    },
  };
}

describe("post do formato prompt", () => {
  it("capa mais um slide por imagem passa no schema", () => {
    const r = InstagramCarouselSchema.safeParse(
      carrosselDeCampanha({ titulo: "Vire personagem de GTA", imagens: 4 }),
    );
    expect(r.success).toBe(true);
  });

  it("capa sozinha é recusada — o corpo do formato são as imagens", () => {
    const r = InstagramCarouselSchema.safeParse(
      carrosselDeCampanha({ titulo: "Vire personagem de GTA", imagens: 0 }),
    );
    expect(r.success).toBe(false);
  });

  it("título longo do conceito não estoura a legenda", () => {
    // O limite de headline é 100 e o de title 100: um hook comprido do conceito
    // quebraria a validação dentro do worker, muito depois do agendamento.
    const r = InstagramCarouselSchema.safeParse(
      carrosselDeCampanha({ titulo: "Vire personagem de GTA ".repeat(20), imagens: 3 }),
    );
    expect(r.success).toBe(true);
  });

  it("conceito curto ainda satisfaz o mínimo do resumo", () => {
    // intro_summary exige 20 caracteres; um conceito de duas palavras não os tem.
    const r = InstagramCarouselSchema.safeParse(
      carrosselDeCampanha({ titulo: "GTA no bairro", conceito: "curto", imagens: 2 }),
    );
    expect(r.success).toBe(true);
  });

  it("sem aplicações ainda entrega dois key_takeaways", () => {
    const c = carrosselDeCampanha({ titulo: "Vire personagem de GTA", imagens: 2 });
    expect(c.caption.key_takeaways.length).toBeGreaterThanOrEqual(2);
  });

  it("todo slide tem imagem — é o corpo do formato", () => {
    const c = carrosselDeCampanha({ titulo: "Vire personagem de GTA", imagens: 5 });
    expect(c.slides.every((s) => s.bg_image_url)).toBe(true);
  });

  it("não estoura o máximo de 12 slides", () => {
    const r = InstagramCarouselSchema.safeParse(
      carrosselDeCampanha({ titulo: "Vire personagem de GTA", imagens: 11 }),
    );
    expect(r.success).toBe(true);
  });
});
