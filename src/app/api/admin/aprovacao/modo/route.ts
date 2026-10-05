import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { ehRamo } from "@/lib/server/aprovacao/contrato";
import { modoDoRamo, settingsComModoDoRamo } from "@/lib/server/aprovacao/modo";
import { projetoPeloSlug, quemDecide } from "@/lib/server/aprovacao/rotas";

/**
 * Manual ou automático, por ramo (RF-25). Só o dono troca.
 *
 * "Só o dono" é a sessão do painel: o login do painel é um só, e é o do dono.
 * Nenhuma rota de cron nem o worker alcançam isto, de propósito: a máquina não
 * pode se dar permissão para aprovar sozinha.
 *
 * Mesma forma das rotas de capacidades e de moldes: só o ramo `aprovacao` do
 * `settings` é tocado, e o resto do jsonb volta como estava.
 */
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const corpo = (await req.json().catch(() => ({}))) as { projeto?: unknown; ramo?: unknown; modo?: unknown };
    if (!ehRamo(corpo.ramo)) {
      return NextResponse.json({ ok: false, error: "informe o ramo: newsletter, artigo ou post" }, { status: 400 });
    }
    // Valor exato: a leitura cai em manual quando o valor é torto, e a escrita recusa.
    if (corpo.modo !== "manual" && corpo.modo !== "automatico") {
      return NextResponse.json({ ok: false, error: "informe o modo: manual ou automatico" }, { status: 400 });
    }
    const projeto = await projetoPeloSlug(corpo.projeto);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    const settings = settingsComModoDoRamo(projeto.settings, corpo.ramo, corpo.modo);
    const { error } = await getSupabaseAdminClient()
      .from("projects")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", projeto.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    console.log(`[ADMIN APROVACAO] ${projeto.slug}: ${corpo.ramo} em ${corpo.modo}, por ${quemDecide(req)}`);
    return NextResponse.json({ ok: true, ramo: corpo.ramo, modo: modoDoRamo({ settings }, corpo.ramo) });
  } catch (err) {
    console.error("[ADMIN APROVACAO MODO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gravar o modo." },
      { status: 500 },
    );
  }
}
