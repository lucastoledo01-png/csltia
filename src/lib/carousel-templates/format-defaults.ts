import type { CarouselFormat, InstagramSlideType } from "./types";

export type FormatDefault = {
  /** Tipos de slide que o pipeline pode gerar para este formato. */
  allowedSlideTypes: InstagramSlideType[];
  /** Variante usada por tipo de slide quando o admin não sobrescreve. */
  variantBySlideType: Partial<Record<InstagramSlideType, string>>;
  /** Qual SYSTEM prompt o `pipeline.ts` usa para gerar o roteiro. */
  systemPromptKey: "noticia" | "tutorial" | "prompt";
};

/**
 * Cada formato tem uma forma própria, e a diferença não é só de layout:
 *
 * - `tutorial` é o **único carrossel de texto**.
 * - `noticia` é **capa só** — post de imagem única.
 * - `prompt` é capa mais os resultados do prompt **em tela cheia**: a pessoa vê
 *   primeiro o que poderia criar, e o prompt aparece como a ferramenta.
 *
 * `allowedSlideTypes` trava o vocabulário: o pipeline não gera tipo fora da
 * lista, então nenhum formato produz um slide sem variante desenhada. A
 * quantidade de slides é travada em `SLIDES_POR_FORMATO`, no schema.
 */
export const FORMAT_DEFAULTS: Record<CarouselFormat, FormatDefault> = {
  noticia: {
    allowedSlideTypes: ["cover"],
    variantBySlideType: {
      cover: "capa_jornal",
    },
    systemPromptKey: "noticia",
  },
  tutorial: {
    allowedSlideTypes: ["cover", "step", "tip", "cta"],
    variantBySlideType: {
      cover: "editorial_claro",
      step: "terminal_claro",
      tip: "destaque_claro",
      cta: "keyword_claro",
    },
    systemPromptKey: "tutorial",
  },
  prompt: {
    allowedSlideTypes: ["cover", "gallery"],
    variantBySlideType: {
      cover: "result_fullbleed",
      gallery: "tela_cheia",
    },
    systemPromptKey: "prompt",
  },
};
