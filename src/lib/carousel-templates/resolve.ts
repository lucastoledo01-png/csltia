import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_TOKENS, mergeTokens, type CarouselTokens } from "./tokens";
import { resolveFormatConfig } from "./assemble";
import type { CarouselFormat, FormatConfig } from "./types";

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
export async function resolveTokens(format?: CarouselFormat): Promise<CarouselTokens> {
  try {
    const supabase = getSupabaseAdminClient();

    const [tema, doFormato] = await Promise.all([
      supabase.from("carousel_theme").select("tokens").eq("id", 1).maybeSingle(),
      format
        ? supabase.from("carousel_format_config").select("tokens").eq("format", format).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return mergeTokens(tema.data?.tokens ?? {}, doFormato.data?.tokens ?? {});
  } catch {
    return DEFAULT_TOKENS;
  }
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
