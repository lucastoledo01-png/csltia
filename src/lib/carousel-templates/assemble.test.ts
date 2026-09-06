import { describe, expect, it } from "vitest";
import { assembleSlide, resolveFormatConfig } from "./assemble";
import { FONTS } from "./fonts";
import { DEFAULT_TOKENS } from "./tokens";
import { SAMPLE_CAROUSEL } from "./sample-data";
import { CAROUSEL_FORMATS } from "./types";
import { FORMAT_DEFAULTS } from "./format-defaults";
import { SLIDE_VARIANTS } from "./variants";
import type { InstagramSlide } from "./types";
import { InstagramCarouselSchema } from "@/lib/server/social/instagram/schemas";

describe("assembleSlide", () => {
  for (const format of CAROUSEL_FORMATS) {
    const carousel = SAMPLE_CAROUSEL[format];

    it(`${format}: os dados de exemplo passam no schema`, () => {
      expect(() => InstagramCarouselSchema.parse(carousel)).not.toThrow();
    });

    carousel.slides.forEach((slide, i) => {
      it(`${format}: slide ${i + 1} (${slide.type}) monta HTML válido`, () => {
        const html = assembleSlide(slide, {
          format,
          tokens: DEFAULT_TOKENS,
          formatConfig: resolveFormatConfig(format),
          slideIndex: slide.index,
          total: carousel.slides.length,
        });

        expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
        expect(html).toContain("</html>");
        // placeholders resolvidos
        expect(html).not.toMatch(/\{\{.*?\}\}/);
        expect(html).not.toContain("undefined");
        // A dimensão saiu do CSS literal e virou token, então é o token que
        // precisa chegar ao HTML — é dele que o viewport do Playwright também
        // é derivado. Confere a altura junto: antes ninguém checava.
        expect(html).toContain(`--s-w:${DEFAULT_TOKENS.canvas.width}px`);
        expect(html).toContain(`--s-h:${DEFAULT_TOKENS.canvas.height}px`);

        // Toda família declarada precisa estar no <link> que a carrega. Fonte
        // pedida e não requisitada cai no fallback do sistema sem erro.
        for (const chave of new Set(Object.values(DEFAULT_TOKENS.fonts))) {
          const primeiraFamilia = FONTS[chave].stack.split(",")[0].replace(/"/g, "");
          expect(html).toContain(primeiraFamilia.replace(/ /g, "+"));
        }
      });
    });
  }

  it("cada tipo de slide permitido por um formato tem pelo menos uma variante", () => {
    for (const format of CAROUSEL_FORMATS) {
      for (const slideType of FORMAT_DEFAULTS[format].allowedSlideTypes) {
        expect(Object.keys(SLIDE_VARIANTS[slideType] ?? {}).length).toBeGreaterThan(0);
      }
    }
  });

  it("a variante default de cada formato existe no catálogo", () => {
    for (const format of CAROUSEL_FORMATS) {
      const def = FORMAT_DEFAULTS[format];
      for (const [slideType, variantKey] of Object.entries(def.variantBySlideType)) {
        expect(SLIDE_VARIANTS[slideType as keyof typeof SLIDE_VARIANTS]?.[variantKey!]).toBeDefined();
      }
    }
  });

  it("resolveFormatConfig faz merge do override sobre o default", () => {
    const cfg = resolveFormatConfig("noticia", {
      variantBySlideType: { cover: "brand_card" },
      eyebrowLabel: "PLANTÃO",
      ctaText: null,
    });
    expect(cfg.variantBySlideType.cover).toBe("brand_card");
    expect(cfg.variantBySlideType.cta).toBe(FORMAT_DEFAULTS.noticia.variantBySlideType.cta);
    expect(cfg.eyebrowLabel).toBe("PLANTÃO");
  });
});

describe("forma de cada formato", () => {
  it("o exemplo do painel só usa tipos que o formato produz", () => {
    // Sem isto, o preview do admin mostra slides que o pipeline nunca gera —
    // e a pessoa desenha em cima de um layout que não vai ao ar.
    for (const format of CAROUSEL_FORMATS) {
      const permitidos = FORMAT_DEFAULTS[format].allowedSlideTypes;
      const usados = SAMPLE_CAROUSEL[format].slides.map((s) => s.type);

      expect(usados.filter((t) => !permitidos.includes(t)), `formato ${format}`).toEqual([]);
    }
  });

  it("cada tipo permitido tem variante padrão apontando para uma que existe", () => {
    for (const format of CAROUSEL_FORMATS) {
      const def = FORMAT_DEFAULTS[format];
      for (const tipo of def.allowedSlideTypes) {
        const chave = def.variantBySlideType[tipo];
        expect(chave, `${format}/${tipo} sem variante padrão`).toBeTruthy();
        expect(SLIDE_VARIANTS[tipo]?.[chave!], `${format}/${tipo} → "${chave}" não existe`).toBeDefined();
      }
    }
  });
});

describe("peça de imagem única não convida a arrastar", () => {
  const slideUnico: InstagramSlide = {
    index: 1,
    type: "cover",
    eyebrow: "",
    title: "Ordem manda USCIS retomar pedidos pendentes",
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "brand_card",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "",
    cta_text: "",
  };

  function montar(total: number): string {
    return assembleSlide({ ...slideUnico }, {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: resolveFormatConfig("noticia"),
      slideIndex: 1,
      total,
      layout: null,
    });
  }

  it("sem SWIPE, sem progresso e sem 01 / 01 quando o post é um só", () => {
    const html = montar(1);
    expect(html).not.toContain("SWIPE");
    expect(html).not.toContain("PROGRESSO");
    expect(html).not.toContain("01 / 01");
    expect(html).not.toContain(`<div class="c-dots">`);
  });

  it("o carrossel continua com a paginação inteira", () => {
    const html = montar(5);
    expect(html).toContain("01 / 05");
  });

  it("a marca continua na peça única: ela não promete nada", () => {
    expect(montar(1)).toContain("imigra.us");
  });
});
