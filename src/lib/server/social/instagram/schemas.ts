import { z } from "zod";

export const InstagramSlideTypeSchema = z.enum([
  "cover",
  "intro",
  "content",
  "quote_highlight",
  "practical_impact",
  "cta",
  // tipos dos formatos tutorial e prompt
  "step",
  "tip",
  "gallery",
  "personalization",
]);

export const CarouselFormatSchema = z.enum(["noticia", "tutorial", "prompt"]);

export const InstagramSlideSchema = z.object({
  index: z.number().min(1).max(12),
  type: InstagramSlideTypeSchema,
  eyebrow: z.string().optional().default(""),
  title: z.string().min(3).max(120),
  body: z.string().max(1200).optional().default(""),
  bullet_points: z.array(z.string()).optional().default([]),
  highlight_text: z.string().optional().default(""),
  /** Sobrescreve a variante escolhida pelo formato para este slide específico. */
  variant: z.string().optional().default(""),
  cover_variant: z.enum(["dark_speaker", "clean_editorial", "brand_cutout"]).optional().default("dark_speaker"),
  headline_style: z.enum(["clean", "underline_stroke", "pen_highlight"]).optional().default("clean"),
  cover_image_prompt: z.string().optional().default(""),
  bg_image_url: z.string().optional().default(""),
  cta_text: z.string().optional().default(""),
});

export const InstagramCaptionSchema = z.object({
  headline: z.string().min(10).max(100),
  intro_summary: z.string().min(20).max(300),
  key_takeaways: z.array(z.string()).min(2).max(5),
  cta_call: z.string().min(10).max(150),
  hashtags: z.array(z.string()).min(3).max(12),
  full_caption: z.string().min(50).max(2000),
});

export const InstagramCarouselSchema = z.object({
  title: z.string().min(10).max(100),
  edition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primary_topic: z.string().min(3),
  target_audience_focus: z.string().default("Criadores, Vendedores & Empreendedores"),
  /** Formato do carrossel — decide os SYSTEM prompts e o conjunto de variantes. */
  format: CarouselFormatSchema.default("noticia"),
  slides: z.array(InstagramSlideSchema).min(1).max(12),
  caption: InstagramCaptionSchema,
}).superRefine((carrossel, ctx) => {
  const regra = SLIDES_POR_FORMATO[carrossel.format];
  if (!regra) return;

  if (carrossel.slides.length < regra.min || carrossel.slides.length > regra.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slides"],
      message:
        `O formato "${carrossel.format}" aceita de ${regra.min} a ${regra.max} slides; ` +
        `foram gerados ${carrossel.slides.length}.`,
    });
  }
});

/**
 * Quantidade de slides que cada formato aceita.
 *
 * Era um `min(4).max(12)` único, e isso amarrava os três formatos à forma de
 * carrossel. Só o `tutorial` é carrossel de texto: `noticia` é capa só — post
 * de imagem única — e `prompt` é capa mais os resultados em tela cheia.
 *
 * A regra vive aqui, no schema, porque é aqui que a saída da IA é validada.
 * Deixá-la só no prompt tornaria "a IA gerou 5 slides para uma notícia" um
 * post errado publicado, em vez de um erro de validação.
 */
export const SLIDES_POR_FORMATO: Record<z.infer<typeof CarouselFormatSchema>, { min: number; max: number }> = {
  // Capa só. Um segundo slide já descaracteriza o formato.
  noticia: { min: 1, max: 1 },
  tutorial: { min: 4, max: 12 },
  // Capa mais ao menos um resultado do prompt.
  prompt: { min: 2, max: 12 },
};

/**
 * Apara os slides para caber na forma do formato, antes de validar.
 *
 * O prompt pede a quantidade certa, mas um modelo que entrega demais não pode
 * custar o post do dia — e para `noticia`, que é capa só, o excedente é
 * justamente o conteúdo que passou a viver na legenda. Aparar é seguro porque
 * a ordem dos slides é significativa: o primeiro é sempre a capa.
 *
 * Só apara para baixo. Entregar **menos** que o mínimo não tem conserto
 * determinístico — inventar um slide de resultado que a IA não gerou seria
 * publicar conteúdo que ninguém escreveu — e aí a validação recusa mesmo.
 */
export function aparaSlidesParaFormato(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object") return bruto;

  const obj = bruto as { format?: unknown; slides?: unknown };
  const format = typeof obj.format === "string" ? obj.format : "noticia";
  const regra = SLIDES_POR_FORMATO[format as keyof typeof SLIDES_POR_FORMATO];

  if (!regra || !Array.isArray(obj.slides) || obj.slides.length <= regra.max) return bruto;

  const aparados = obj.slides.slice(0, regra.max).map((slide, i) =>
    slide && typeof slide === "object" ? { ...(slide as object), index: i + 1 } : slide,
  );

  console.warn(
    `[INSTAGRAM] Formato "${format}" aceita ${regra.max} slide(s) e a IA gerou ` +
      `${obj.slides.length}. Aparado para ${aparados.length}.`,
  );

  return { ...obj, slides: aparados };
}

export type InstagramSlide = z.infer<typeof InstagramSlideSchema>;
export type InstagramSlideType = z.infer<typeof InstagramSlideTypeSchema>;
export type CarouselFormat = z.infer<typeof CarouselFormatSchema>;
export type InstagramCaption = z.infer<typeof InstagramCaptionSchema>;
export type InstagramCarouselContent = z.infer<typeof InstagramCarouselSchema>;
