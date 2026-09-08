import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_TOKENS, mergeTokens, type CarouselTokens } from "./tokens";
import { resolveFormatConfig } from "./assemble";
import type { CarouselFormat, FormatConfig, InstagramSlideType } from "./types";
import { LayoutSchema, type Layout } from "./layout";

/**
 * Leitura do design salvo pelo painel. Só o renderer (worker) e a rota de
 * admin importam isto — a montagem do slide (`assembleSlide`) não toca o banco.
 *
 * Qualquer falha de leitura cai no default do repo: o carrossel nunca deixa de
 * ser gerado por causa de config de design.
 */

/**
 * Tokens efetivos de um formato, em cascata:
 *
 *   default do repo  →  carousel_theme (global)  →  carousel_format_config
 *
 * Sem `format`, devolve só o tema global — é o que o editor do painel mostra
 * quando está editando o tema, não um formato específico.
 *
 * As duas leituras vão juntas de propósito: em duas idas ao banco, uma falha
 * parcial produziria um slide meio claro e meio escuro, que é pior que cair
 * inteiro no default.
 */
/**
 * Os tokens, mais a resposta honesta sobre de onde eles vieram.
 *
 * A versão sem diagnóstico engolia tudo: `catch` devolvendo `DEFAULT_TOKENS` e
 * `data?.tokens ?? {}` sem olhar o `error`. Para o painel isso é aceitável —
 * mostrar o tema padrão é melhor que uma tela de erro. Para a arte que vai ao
 * ar não é: o canvas, a paleta e as fontes saem daqui, e renderizar com o
 * default do repo em vez do tema do banco produz uma peça diferente da que foi
 * aprovada, sem erro e sem log.
 *
 * Quem publica precisa saber. Quem só desenha na tela, não.
 */
export async function resolveTokensComDiagnostico(
  format?: CarouselFormat,
): Promise<{ tokens: CarouselTokens; degradado: boolean; motivo: string }> {
  try {
    const supabase = getSupabaseAdminClient();

    const [tema, doFormato] = await Promise.all([
      supabase.from("carousel_theme").select("tokens").eq("id", 1).maybeSingle(),
      format
        ? supabase.from("carousel_format_config").select("tokens").eq("format", format).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const erros = [tema.error?.message, ("error" in doFormato && doFormato.error?.message) || null]
      .filter(Boolean)
      .join("; ");

    if (erros) {
      return {
        tokens: mergeTokens(tema.data?.tokens ?? {}, doFormato.data?.tokens ?? {}),
        degradado: true,
        motivo: `leitura do tema falhou: ${erros}`,
      };
    }

    return {
      tokens: mergeTokens(tema.data?.tokens ?? {}, doFormato.data?.tokens ?? {}),
      degradado: false,
      motivo: "",
    };
  } catch (err) {
    return {
      tokens: DEFAULT_TOKENS,
      degradado: true,
      motivo: `tema do banco inacessível, caiu no default do repo: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

export async function resolveTokens(format?: CarouselFormat): Promise<CarouselTokens> {
  const r = await resolveTokensComDiagnostico(format);
  if (r.degradado) console.warn(`[TOKENS] ${r.motivo}`);
  return r.tokens;
}

export async function resolveFormatConfigFromDb(format: CarouselFormat): Promise<FormatConfig> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from("carousel_format_config")
      .select("variant_by_slide_type, eyebrow_label, cta_text")
      .eq("format", format)
      .maybeSingle();

    if (!data) return resolveFormatConfig(format);

    return resolveFormatConfig(format, {
      variantBySlideType:
        data.variant_by_slide_type && typeof data.variant_by_slide_type === "object"
          ? (data.variant_by_slide_type as Record<string, string>)
          : {},
      eyebrowLabel: data.eyebrow_label ?? null,
      ctaText: data.cta_text ?? null,
    });
  } catch {
    return resolveFormatConfig(format);
  }
}

/**
 * Layout desenhado à mão para um par (formato, tipo de slide).
 *
 * `null` quando não há nenhum, e o slide cai na variante de código — que
 * continua sendo o caminho de todo formato que ninguém desenhou. Um layout
 * salvo com desenho inválido também vira `null`: publicar com a variante
 * conhecida é melhor que publicar um slide quebrado.
 */
export async function resolveLayout(
  format: CarouselFormat,
  slideType: InstagramSlideType,
): Promise<Layout | null> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from("carousel_layouts")
      .select("canvas, blocks, enabled")
      .eq("format", format)
      .eq("slide_type", slideType)
      .eq("enabled", true)
      .maybeSingle();

    if (!data) return null;

    const parsed = LayoutSchema.safeParse({ canvas: data.canvas, blocks: data.blocks });
    if (!parsed.success) {
      console.warn(`[LAYOUT] Desenho inválido em ${format}/${slideType}; usando a variante.`);
      return null;
    }

    return parsed.data.blocks.length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}
