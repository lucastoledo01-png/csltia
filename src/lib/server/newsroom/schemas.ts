import { z } from "zod";

export const EditionStorySchema = z.object({
  rank: z.number(),
  category: z.string(),
  title: z.string(),
  summary: z.string(),
  context: z.string(),
  why_it_matters: z.string(),
  practical_impact: z.string(),
  humor_line: z.string().optional(),
  source_name: z.string(),
  source_url: z.string(),
  secondary_urls: z.array(z.string()).optional().default([]),
});

export const EditionQuickBitSchema = z.object({
  title: z.string(),
  text: z.string(),
  url: z.string().optional(),
});

export const EditionContentSchema = z.object({
  subject_options: z.array(z.string()).min(3).max(5),
  subject: z.string().min(15).max(70),
  preheader: z.string().min(30).max(120),
  headline: z.string().min(10),
  intro: z.string().min(40).max(800),
  stories: z.array(EditionStorySchema).min(4).max(6),
  quick_bits: z.array(EditionQuickBitSchema).optional().default([]),
  closing: z.string().min(10),
  /**
   * Assinatura de encerramento.
   *
   * Aqui só se exige que exista. Qual frase é depende da publicação, e a
   * validação anterior tinha "Agora você está desbugado. Bora iniciar o dia."
   * escrita dentro do refine — o que significa que toda edição de qualquer
   * outra vertical seria **recusada na validação**, sem edição nenhuma no ar.
   *
   * Quem garante a frase certa é o pipeline: ele injeta `marca.assinatura`
   * quando o modelo não devolve, e o prompt pede a frase exata.
   */
  final_line: z.string().min(3),
});

export const QAResultSchema = z.object({
  passed: z.boolean(),
  hallucination_risk: z.boolean(),
  tone_check_passed: z.boolean(),
  grammar_passed: z.boolean(),
  story_count_valid: z.boolean(),
  issues: z.array(z.string()).default([]),
  score: z.number().min(0).max(100),
});

export type EditionContent = z.infer<typeof EditionContentSchema>;
export type EditionStory = z.infer<typeof EditionStorySchema>;
export type QAResult = z.infer<typeof QAResultSchema>;
