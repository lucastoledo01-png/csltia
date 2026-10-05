import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { logsDoDia } from "@/lib/server/painel-logs";
import { getProjectById, projectToday } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * Os logs de um dia do projeto: runs, recusas da linha editorial e do
 * Instagram, com o código do motivo (05/10/2026). `?dia=AAAA-MM-DD`, no fuso do
 * projeto; sem ele, hoje. Só leitura.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  try {
    const projeto = await getProjectById(id);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    const pedido = req.nextUrl.searchParams.get("dia")?.trim();
    if (pedido && !/^\d{4}-\d{2}-\d{2}$/.test(pedido)) {
      return NextResponse.json({ ok: false, error: "dia precisa ser AAAA-MM-DD" }, { status: 400 });
    }
    const dia = pedido || projectToday(projeto);

    return NextResponse.json({ ok: true, ...(await logsDoDia(getSupabaseAdminClient(), projeto, dia)) });
  } catch (err) {
    console.error("[ADMIN LOGS DO DIA]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler os logs." },
      { status: 500 },
    );
  }
}
