import { describe, expect, it } from "vitest";
import { chapeuDaPeca, montarCapaDoPost, sobrancelha } from "./arte";
import { SLIDE_VARIANTS } from "@/lib/carousel-templates/variants";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import { MARCA } from "@/lib/marca";

/**
 * O chapéu da peça do feed (06/10/2026): o tema da lista fechada quando a pauta
 * o trata, a editoria quando não, como o Not Journal imprime "DATA CENTERS" e
 * não "POLÍTICA".
 */
describe("o chapéu da peça", () => {
  it("a pauta que trata um tema da lista leva o tema, em caixa alta", () => {
    const chapeu = chapeuDaPeca({
      eixo: "politica",
      textos: [
        "Chicago aprova regra nova para data centers",
        "A cidade tem 39 data centers ativos, e a regra vale para os data centers novos.",
      ],
    });
    expect(chapeu).toBe("DATA CENTERS");
  });

  it("uma menção de passagem não faz do tema o chapéu: fica a editoria", () => {
    const chapeu = chapeuDaPeca({
      eixo: "politica",
      textos: ["Senado aprova orçamento", "O texto cita data centers uma vez, entre outros setores."],
    });
    expect(chapeu).toBe(sobrancelha("politica"));
    expect(chapeu).toBe("POLÍTICA");
  });

  it("sem texto, a editoria; sem editoria nomeada nem tema, nada", () => {
    expect(chapeuDaPeca({ eixo: "economia" })).toBe("ECONOMIA");
    expect(chapeuDaPeca({ eixo: "outro", textos: ["nada de tema aqui"] })).toBe("");
  });

  it("é determinístico: o mesmo texto dá o mesmo chapéu", () => {
    const entrada = { eixo: "economia", textos: ["O Fed e os juros do Fed: corte de juros em dezembro"] };
    expect(chapeuDaPeca(entrada)).toBe(chapeuDaPeca(entrada));
  });

  it("a capa imprime o chapéu decidido, e sem ele a editoria de sempre", () => {
    const foto = { imageUrl: "https://upload.wikimedia.org/foto.jpg", attribution: "" };
    expect(montarCapaDoPost({ headline: "Manchete", eixo: "politica", chapeu: "DATA CENTERS", asset: foto }).slide.eyebrow).toBe(
      "DATA CENTERS",
    );
    expect(montarCapaDoPost({ headline: "Manchete", eixo: "politica", asset: foto }).slide.eyebrow).toBe("POLÍTICA");
  });
});

/**
 * A marca do Instagram (06/10/2026): a compacta, só nas peças do feed.
 */
describe("as peças do feed usam a marca do Instagram", () => {
  const ctx = { format: "noticia" as const, tokens: DEFAULT_TOKENS, eyebrowLabel: "", ctaText: "", slideIndex: 1, total: 1 };
  const base = {
    index: 1,
    type: "cover",
    eyebrow: "ECONOMIA",
    title: "Manchete",
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "https://upload.wikimedia.org/foto.jpg",
    cta_text: "",
  } as never;

  it.each([
    ["cover", "capa_jornal"],
    ["cover", "noticia_sem_foto"],
    ["content", "miolo_jornal"],
    ["content", "miolo_noticia"],
    ["cta", "cta_assinatura"],
    ["cta", "cta_newsletter"],
  ] as const)("%s/%s", (tipo, chave) => {
    const variantes = SLIDE_VARIANTS[tipo] as Record<string, { render: (s: never, c: never) => { body: string } }>;
    const html = variantes[chave].render(base, ctx as never).body;
    expect(html).toContain(MARCA.logoInstagramEscuro);
    expect(html).not.toContain(MARCA.logoEscuro);
    expect(html).not.toContain(MARCA.logoClaro);
  });

  it("o fundo preto do convite usa a versão branca, sem troca pelo brilho", () => {
    const html = SLIDE_VARIANTS.cta.cta_assinatura.render(base, ctx as never).body;
    expect(html).toContain(`src="${MARCA.logoInstagramEscuro}"`);
    expect(html).not.toContain("data-claro");
  });

  it("o e-mail e o site continuam com a assinatura horizontal", () => {
    expect(MARCA.logoClaro).toContain("eua-journal-fundo-claro.png");
    expect(MARCA.logoEscuro).toContain("eua-journal-fundo-escuro.png");
  });
});
