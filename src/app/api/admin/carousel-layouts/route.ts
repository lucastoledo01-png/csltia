import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { LayoutSchema } from "@/lib/carousel-templates/layout";
import { CAROUSEL_FORMATS } from "@/lib/carousel-templates/types";
import { FORMAT_DEFAULTS } from "@/lib/carousel-templates/format-defaults";

/**
 * Layouts desenhados à mão, por (formato, tipo de slide).
 *
 * O GET devolve todos de uma vez: são poucos — no máximo um por combinação — e
 * o editor precisa saber quais existem para marcar as abas que já têm desenho.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("carousel_layouts")
      .select("format, slide_type, name, canvas, blocks, enabled, updated_at")
      .eq("project_id", DEFAULT_PROJECT_ID);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      layouts: data ?? [],
      // Quais tipos de slide cada formato aceita — é o que o editor usa para
      // montar as abas sem duplicar a regra que já vive em FORMAT_DEFAULTS.
      slideTypesByFormat: Object.fromEntries(
        CAROUSEL_FORMATS.map((f) => [f, FORMAT_DEFAULTS[f].allowedSlideTypes]),
      ),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });

  const format = String(body.format ?? "");
  const slideType = String(body.slideType ?? "");

  if (!CAROUSEL_FORMATS.includes(format as (typeof CAROUSEL_FORMATS)[number])) {
    return NextResponse.json({ ok: false, error: `Formato desconhecido: ${format}` }, { status: 400 });
  }
  if (!slideType) {
    return NextResponse.json({ ok: false, error: "Informe o slideType." }, { status: 400 });
  }

  // Valida o desenho na entrada, não na renderização. Um bloco com número fora
  // de faixa gravado aqui só apareceria como slide torto no post publicado —
  // e aí o custo de descobrir é um post no ar.
  const parsed = LayoutSchema.safeParse({ canvas: body.canvas, blocks: body.blocks });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Desenho inválido.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("carousel_layouts").upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        format,
        slide_type: slideType,
        name: String(body.name ?? "").slice(0, 80),
        canvas: parsed.data.canvas,
        blocks: parsed.data.blocks,
        /*
         * Ligar um desenho salvo é ato EXPLÍCITO.
         *
         * Era `body.enabled !== false`, então qualquer gravação sem o campo
         * religava o desenho. Foi assim que o layout de 04/09, com a marca
         * antiga e o bloco de imagem de fundo, voltou a vencer a gramática
         * nova sempre que havia foto: ninguém religou de propósito, o padrão
         * religou sozinho.
         */
        enabled: body.enabled === true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,format,slide_type" },
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Apaga o desenho: o slide volta para a variante de código. */
export async function DELETE(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "";
  const slideType = searchParams.get("slideType") ?? "";

  if (!format || !slideType) {
    return NextResponse.json({ ok: false, error: "Informe format e slideType." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("carousel_layouts")
      .delete()
      .eq("project_id", DEFAULT_PROJECT_ID)
      .eq("format", format)
      .eq("slide_type", slideType);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
