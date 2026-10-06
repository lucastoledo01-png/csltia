import { z } from "zod";
import { FORMAS_DO_ASSUNTO } from "./assunto";

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
  /*
   * Piso de 5, e não mais de 15 (06/10/2026). O método do The News tem assunto
   * de duas palavras ("nikolas & vorcaro", 17 caracteres, e "lula & trump"
   * teria 12), e recusar aqui derrubaria a edição inteira DEPOIS de paga por
   * causa de um assunto bom. A forma fina é conferida e consertada em
   * `assunto.ts`, depois da validação.
   */
  subject: z.string().min(5).max(70),
  /*
   * A forma de cada opção de assunto, na ordem de `subject_options`, e a forma
   * do assunto escolhido (06/10/2026). Opcionais e sem `.default()`, de
   * propósito: quem constrói uma edição sem passar pela redação (refação,
   * scripts, testes) não precisa conhecê-las. Ver o rodízio em `assunto.ts`.
   */
  subject_option_forms: z.array(z.string().nullable()).optional(),
  subject_form: z.enum(FORMAS_DO_ASSUNTO).nullable().optional(),
  preheader: z.string().min(30).max(120),
  headline: z.string().min(10),
  intro: z.string().min(40).max(800),
  // 2 a 6, não 4 a 6. O mínimo de verdade é decidido pela configuração
  // editorial; aqui só se recusa o que não é edição. Deixar 4 aqui faria toda
  // edição de dia magro ser recusada na validação, depois de paga.
  stories: z.array(EditionStorySchema).min(2).max(6),
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
