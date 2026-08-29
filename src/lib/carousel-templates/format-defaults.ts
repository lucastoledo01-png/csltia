import type { CarouselFormat, InstagramSlideType } from "./types";

export type FormatDefault = {
  /** Tipos de slide que o pipeline pode gerar para este formato. */
  allowedSlideTypes: InstagramSlideType[];
  /** Variante usada por tipo de slide quando o admin não sobrescreve. */
  variantBySlideType: Partial<Record<InstagramSlideType, string>>;
  /** Qual SYSTEM prompt o `pipeline.ts` usa para gerar o roteiro. */
  systemPromptKey: "noticia" | "tutorial" | "prompt";
};

export const FORMAT_DEFAULTS: Record<CarouselFormat, FormatDefault> = {
  noticia: {
    allowedSlideTypes: ["cover", "intro", "content", "practical_impact", "quote_highlight", "cta"],
    variantBySlideType: {
      cover: "fullbleed_portrait",
      intro: "big_statement",
      content: "bullets",
      practical_impact: "gold_dark_card",
      quote_highlight: "pull_quote",
      cta: "dark_card",
    },
    systemPromptKey: "noticia",
  },
  tutorial: {
    allowedSlideTypes: ["cover", "step", "tip", "cta"],
    variantBySlideType: {
      cover: "result_showcase",
      step: "code_block",
      tip: "light_card",
      cta: "dark_card",
    },
    systemPromptKey: "tutorial",
  },
  prompt: {
    allowedSlideTypes: ["cover", "gallery", "personalization", "cta"],
    variantBySlideType: {
      cover: "result_fullbleed",
      gallery: "image_caption",
      personalization: "prompt_swap",
      cta: "dark_card",
    },
    systemPromptKey: "prompt",
  },
};
