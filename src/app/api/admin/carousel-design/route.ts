import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_TOKENS, TokensSchema, mergeTokens } from "@/lib/carousel-templates/tokens";
import { resolveFormatConfig } from "@/lib/carousel-templates/assemble";
import { FORMAT_DEFAULTS } from "@/lib/carousel-templates/format-defaults";
import { variantCatalog } from "@/lib/carousel-templates/variants";
import { SAMPLE_CAROUSEL } from "@/lib/carousel-templates/sample-data";
import { CAROUSEL_FORMATS } from "@/lib/carousel-templates/types";
import type { CarouselFormat } from "@/lib/server/social/instagram/schemas";

/**
 * Design dos carrosséis editável pelo painel. GET devolve o design efetivo
 * (default do repo + overrides do banco) e o catálogo de variantes. PUT salva
 * tokens ou a config de um formato. DELETE restaura o padrão.
 */

type FormatRow = {
  format: string;
  tokens?: Record<string, unknown> | null;
  variant_by_slide_type: Record<string, string> | null;
  eyebrow_label: string | null;
  cta_text: string | null;
};

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const supabase = getSupabaseAdminClient();

  const [{ data: themeRow }, { data: formatRows }] = await Promise.all([
    supabase.from("carousel_theme").select("tokens").eq("id", 1).maybeSingle(),
    supabase.from("carousel_format_config").select("*"),
  ]);

  const tokens = mergeTokens(themeRow?.tokens ?? {});
  const rowsByFormat = new Map<string, FormatRow>();
  for (const row of (formatRows ?? []) as FormatRow[]) rowsByFormat.set(row.format, row);

  // Tokens efetivos por formato: default do repo → tema global → override do
  // formato. É o que permite `tutorial` ser claro e `noticia` escuro, e é o
  // que o preview precisa mostrar para o painel não mentir sobre o resultado.
  const formatTokens = Object.fromEntries(
    CAROUSEL_FORMATS.map((format) => [
      format,
      mergeTokens(themeRow?.tokens ?? {}, rowsByFormat.get(format)?.tokens ?? {}),
    ]),
  );

  const formatTokenOverrides = Object.fromEntries(
    CAROUSEL_FORMATS.map((format) => [format, rowsByFormat.get(format)?.tokens ?? {}]),
  );

  const formatConfigs = Object.fromEntries(
    CAROUSEL_FORMATS.map((format) => {
      const row = rowsByFormat.get(format);
      return [
        format,
        resolveFormatConfig(format, row
          ? {
              variantBySlideType: row.variant_by_slide_type ?? {},
              eyebrowLabel: row.eyebrow_label ?? null,
              ctaText: row.cta_text ?? null,
            }
          : undefined),
      ];
    }),
  );

  return NextResponse.json({
    ok: true,
    tokens,
    defaultTokens: DEFAULT_TOKENS,
    formatTokens,
    formatTokenOverrides,
    formatConfigs,
    formatDefaults: FORMAT_DEFAULTS,
    variantCatalog: variantCatalog(),
    sampleData: SAMPLE_CAROUSEL,
  });
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: temaAtual } = await supabase
    .from("carousel_theme")
    .select("tokens")
    .eq("id", 1)
    .maybeSingle();
  const themeTokensAtuais = (temaAtual?.tokens ?? {}) as Record<string, unknown>;

  // `formatTokens: true` marca que os tokens do corpo são override de formato,
  // não tema global — os dois usam a mesma chave `tokens`.
  if (body.tokens !== undefined && body.formatTokens !== true) {
    const merged = mergeTokens(body.tokens);
    const parsed = TokensSchema.safeParse(merged);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Tokens inválidos.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { error } = await supabase
      .from("carousel_theme")
      .upsert({ id: 1, tokens: parsed.data, updated_at: now, updated_by: "admin" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (typeof body.format === "string") {
    if (!CAROUSEL_FORMATS.includes(body.format as CarouselFormat)) {
      return NextResponse.json({ ok: false, error: "Formato inválido." }, { status: 400 });
    }
    const patch: Record<string, unknown> = { format: body.format, updated_at: now, updated_by: "admin" };
    if (body.variantBySlideType && typeof body.variantBySlideType === "object") {
      patch.variant_by_slide_type = body.variantBySlideType;
    }
    if (typeof body.eyebrowLabel === "string") patch.eyebrow_label = body.eyebrowLabel || null;
    if (typeof body.ctaText === "string") patch.cta_text = body.ctaText || null;

    // Override de tokens do formato. Valida a cascata inteira, não o override
    // sozinho: um override parcial não é um tema válido por si, e recusá-lo
    // isolado impediria trocar só o fundo.
    if (body.tokens !== undefined && body.formatTokens === true) {
      const efetivo = mergeTokens(themeTokensAtuais ?? {}, body.tokens);
      const parsed = TokensSchema.safeParse(efetivo);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Tokens do formato inválidos.", issues: parsed.error.issues },
          { status: 400 },
        );
      }
      patch.tokens = body.tokens;
    }

    const { error } = await supabase.from("carousel_format_config").upsert(patch);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const scope = req.nextUrl.searchParams.get("scope");
  const format = req.nextUrl.searchParams.get("format");
  const supabase = getSupabaseAdminClient();

  if (scope === "tokens") {
    const { error } = await supabase.from("carousel_theme").delete().eq("id", 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (scope === "format" && format && CAROUSEL_FORMATS.includes(format as CarouselFormat)) {
    const { error } = await supabase.from("carousel_format_config").delete().eq("format", format);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "scope inválido (use tokens ou format)." }, { status: 400 });
}
