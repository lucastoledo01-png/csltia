import type {
  CarouselFormat,
  InstagramSlide,
  InstagramSlideType,
} from "@/lib/server/social/instagram/schemas";

/**
 * Os três formatos de carrossel do @desbuguei.ia. Todos compartilham a mesma
 * camada base (grade, tipografia, cabeçalho, rodapé, cartões) e divergem só no
 * eyebrow, no tratamento da capa e na densidade do corpo.
 */
export type { CarouselFormat };

export const CAROUSEL_FORMATS: CarouselFormat[] = ["noticia", "tutorial", "prompt"];

export const FORMAT_LABEL: Record<CarouselFormat, string> = {
  noticia: "Notícia",
  tutorial: "Tutorial",
  prompt: "Prompt",
};

/**
 * O que uma variante devolve: só o corpo do slide (o que fica entre o cabeçalho
 * e o rodapé). `full` marca capas/galerias sem margem, em que o chrome vira
 * sobreposição. `onDark` avisa o shell que o fundo é escuro.
 */
export type VariantOutput = {
  body: string;
  full?: boolean;
  onDark?: boolean;
};

export type VariantContext = {
  format: CarouselFormat;
  tokens: import("./tokens").CarouselTokens;
  eyebrowLabel: string;
  ctaText: string;
  slideIndex: number;
  total: number;
};

export type VariantRender = (slide: InstagramSlide, ctx: VariantContext) => VariantOutput;

export type SlideVariant = {
  key: string;
  label: string;
  render: VariantRender;
};

/**
 * Config de um formato — o que o painel do admin edita. Campos nulos caem no
 * default do formato (`FORMAT_DEFAULTS`) ou nos tokens.
 */
export type FormatConfig = {
  variantBySlideType: Partial<Record<InstagramSlideType, string>>;
  eyebrowLabel: string | null;
  ctaText: string | null;
};

export type { InstagramSlide, InstagramSlideType };
