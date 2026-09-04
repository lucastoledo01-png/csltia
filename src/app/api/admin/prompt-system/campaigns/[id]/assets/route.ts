import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";

/**
 * O que a campanha produziu: cada prompt com a imagem que ele gerou.
 *
 * Faltava por completo. O painel dizia "6 asset(s) gravado(s)" e não havia
 * como ver nenhum deles — a única forma de conferir o resultado era abrir a
 * página de entrega, que exige o cookie do funil, ou consultar o banco. Quem
 * decide se o post vai ao ar precisa olhar as imagens antes.
 *
 * `stock_credit` é lido numa segunda consulta pelo mesmo motivo de sempre: é
 * coluna recente, e um ambiente sem ela deve perder a proveniência, não a
 * listagem inteira.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;

  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("prompt_assets")
      .select("id, label, prompt_text, image_url, substitution_notes, model, generated_at")
      .eq("campaign_id", id)
      .eq("project_id", DEFAULT_PROJECT_ID)
      .order("generated_at");

    if (error) throw new Error(error.message);

    const origem = new Map<string, { provedor: string; fotografo: string }>();
    const { data: creditos } = await supabase
      .from("prompt_assets")
      .select("id, stock_credit")
      .eq("campaign_id", id);

    for (const row of (creditos ?? []) as Array<{ id?: unknown; stock_credit?: unknown }>) {
      const c = row.stock_credit as { provedor?: unknown; fotografo?: unknown } | null;
      if (c?.provedor) {
        origem.set(String(row.id), {
          provedor: String(c.provedor),
          fotografo: String(c.fotografo ?? ""),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      assets: (data ?? []).map((a) => ({
        id: String(a.id),
        label: String(a.label),
        promptText: String(a.prompt_text ?? ""),
        imageUrl: (a.image_url as string | null) ?? null,
        substitutionNotes: String(a.substitution_notes ?? ""),
        model: String(a.model ?? ""),
        origem: origem.get(String(a.id)) ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
