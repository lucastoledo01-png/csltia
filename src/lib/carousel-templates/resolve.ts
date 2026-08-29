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

export async function resolveTokens(): Promise<CarouselTokens> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from("carousel_theme")
      .select("tokens")
      .eq("id", 1)
      .maybeSingle();
    return mergeTokens(data?.tokens ?? {});
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
