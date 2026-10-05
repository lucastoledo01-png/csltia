import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { calendarioDaSemana } from "@/lib/server/painel-calendario";
import { getProjectById, projectToday } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * O calendário de conteúdo de uma semana, só leitura (05/10/2026).
 * `?semana=AAAA-MM-DD` é qualquer dia da semana; sem ele, a semana de hoje.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const projeto = await getProjectById(id);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    const pedido = req.nextUrl.searchParams.get("semana")?.trim();
    if (pedido && !/^\d{4}-\d{2}-\d{2}$/.test(pedido)) {
      return NextResponse.json({ ok: false, error: "semana precisa ser AAAA-MM-DD" }, { status: 400 });
    }

    const hoje = projectToday(projeto);
    const semana = await calendarioDaSemana(getSupabaseAdminClient(), projeto, pedido || hoje);
    return NextResponse.json({ ok: true, hoje, ...semana });
  } catch (err) {
    console.error("[ADMIN CALENDARIO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler o calendário." },
      { status: 500 },
    );
  }
}
