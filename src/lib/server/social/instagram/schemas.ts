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
  /**
   * A segunda imagem, que a capa de jornal desenha em círculo.
   *
   * Opcional de propósito: a bolha é um reforço, não um requisito. Sem ela a
   * capa continua completa, com foto, chapéu e manchete. Um campo obrigatório
   * aqui transformaria "não achei uma segunda foto boa" em peça que não sai.
   */
  inset_image_url: z.string().optional().default(""),
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

/**
 * Limites de cada campo da legenda, do mesmo schema que os valida.
 *
 * Ficam aqui e não repetidos no aparador para não divergirem: alguém subiria
 * o máximo no schema e o aparador continuaria cortando no número velho, o que
 * é pior que não aparar — some texto sem nenhum erro para investigar.
 */
const LIMITES_DA_LEGENDA: Record<string, number> = {
  headline: 100,
  intro_summary: 300,
  cta_call: 150,
  full_caption: 2000,
};

/** Corta na última palavra inteira que cabe, com reticência. */
function cortar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;

  const bruto = texto.slice(0, limite - 1);
  const ultimoEspaco = bruto.lastIndexOf(" ");
  // Sem espaço perto do fim é palavra única gigante: corta no caractere mesmo.
  const base = ultimoEspaco > limite * 0.6 ? bruto.slice(0, ultimoEspaco) : bruto;

  return `${base.trimEnd()}…`;
}

/**
 * Apara a legenda para os limites do schema.
 *
 * O modelo escreve legenda mais longa que o teto com frequência — e o custo
 * disso não era um texto cortado, era **o post inteiro não sair**: a validação
 * falhava, a vaga ficava `scheduled` com o erro gravado, e ninguém era avisado.
 * Metade dos posts recentes estava parada por isso.
 *
 * Perder a cauda de um resumo é infinitamente melhor que perder a publicação
 * do dia. O prompt também passa a declarar os limites — pedido e garantia,
 * como no encaixe de texto do slide: um reduz a frequência, o outro fecha o
 * caminho.
 */
export function aparaLegenda(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object") return bruto;

  const obj = bruto as { caption?: unknown };
  if (!obj.caption || typeof obj.caption !== "object") return bruto;

  const legenda = { ...(obj.caption as Record<string, unknown>) };
  const cortados: string[] = [];

  for (const [campo, limite] of Object.entries(LIMITES_DA_LEGENDA)) {
    const valor = legenda[campo];
    if (typeof valor === "string" && valor.length > limite) {
      legenda[campo] = cortar(valor, limite);
      cortados.push(`${campo} (${valor.length}→${limite})`);
    }
  }

  // `key_takeaways` e `hashtags` são listas com máximo de itens, não de
  // caracteres — o excesso aqui também derruba a validação.
  if (Array.isArray(legenda.key_takeaways) && legenda.key_takeaways.length > 5) {
    cortados.push(`key_takeaways (${legenda.key_takeaways.length}→5)`);
    legenda.key_takeaways = legenda.key_takeaways.slice(0, 5);
  }
  if (Array.isArray(legenda.hashtags) && legenda.hashtags.length > 12) {
    cortados.push(`hashtags (${legenda.hashtags.length}→12)`);
    legenda.hashtags = legenda.hashtags.slice(0, 12);
  }

  if (cortados.length === 0) return bruto;

  console.warn(`[INSTAGRAM] Legenda aparada: ${cortados.join(", ")}.`);
  return { ...obj, caption: legenda };
}

/**
 * Reconstrói a legenda quando o modelo não devolve o objeto `caption`.
 *
 * Aconteceu em produção: o modelo entregou os slides e simplesmente omitiu a
 * legenda, nas duas tentativas. A validação recusou, e o custo foi o post do
 * dia inteiro — a arte estava pronta, a pauta estava certa, e nada foi ao ar
 * por causa de um objeto ausente.
 *
 * O que se monta aqui é modesto de propósito: título e corpo do slide, o CTA
 * e um punhado de hashtags. Não substitui uma legenda escrita, mas é
 * infinitamente melhor que não publicar. Quando o modelo devolve a legenda,
 * nada disto roda.
 */
export function legendaDeEmergencia(
  bruto: unknown,
  keyword: string,
  hashtags: string[],
): unknown {
  if (!bruto || typeof bruto !== "object") return bruto;

  const obj = bruto as { caption?: unknown; slides?: unknown; title?: unknown };
  if (obj.caption && typeof obj.caption === "object") return bruto;

  const capa = (Array.isArray(obj.slides) ? obj.slides[0] : null) as
    | { title?: unknown; body?: unknown }
    | null;

  const titulo = String(capa?.title ?? obj.title ?? "").trim();
  const corpo = String(capa?.body ?? "").trim();

  if (!titulo) return bruto;

  const cta = `Comente ${keyword} e receba a análise de perfil no Direct.`;
  const resumo = corpo || titulo;

  console.warn("[INSTAGRAM] Modelo não devolveu legenda; montada a partir da capa.");

  return {
    ...obj,
    caption: {
      headline: titulo.slice(0, 100),
      intro_summary: resumo.slice(0, 300),
      key_takeaways: [titulo.slice(0, 60), resumo.slice(0, 60)],
      cta_call: cta.slice(0, 150),
      hashtags: hashtags.slice(0, 12),
      full_caption: [titulo, resumo, "", cta, "", hashtags.join(" ")]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000),
    },
  };
}
