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
 * `allowedSlideTypes` descreve o que o pipeline **gera hoje** — é contra isso
 * que os testes conferem que todo tipo produzido tem variante desenhada.
 *
 * A forma-alvo dos formatos é outra, e ainda não está implementada:
 * `noticia` vira post de imagem única (capa só) e `prompt` vira capa mais os
 * resultados em tela cheia. Chegar lá exige três mudanças acopladas — o SYSTEM
 * prompt, a contagem de slides no schema (`min(4)` hoje) e um caminho de
 * publicação de imagem única no `meta-client` (que só sabe `media_type=CAROUSEL`).
 * Ver `docs/plano-templates-carrossel.md`.
 *
 * Mudar esta lista antes das três não muda nada na geração e só faz os testes
 * divergirem do que sai no ar.
 */
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
      cover: "editorial_claro",
      step: "terminal_claro",
      tip: "destaque_claro",
      cta: "keyword_claro",
    },
    systemPromptKey: "tutorial",
  },
  prompt: {
    allowedSlideTypes: ["cover", "gallery", "personalization", "cta"],
    variantBySlideType: {
      // O corpo do formato `prompt` é o resultado em tela cheia: a pessoa vê
      // primeiro o que poderia criar, e o prompt aparece como a ferramenta.
      cover: "result_fullbleed",
      gallery: "tela_cheia",
      personalization: "prompt_swap",
      cta: "dark_card",
    },
    systemPromptKey: "prompt",
  },
};
