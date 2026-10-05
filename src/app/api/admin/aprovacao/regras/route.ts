import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import { projetoPeloSlug, quemDecide } from "@/lib/server/aprovacao/rotas";

/**
 * O dono decide uma regra proposta pela memória de reprovação (RF-29).
 *
 * Aprovada, ela entra no bloco "não repetir" da etapa como REGRA FIXA, em toda
 * refação e em toda pauta seguinte. Recusada, some do painel e não volta a ser
 * proposta com a mesma chave.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const corpo = (await req.json().catch(() => ({}))) as { projeto?: unknown; id?: unknown; decisao?: unknown };
    if (typeof corpo.id !== "string" || !corpo.id) {
      return NextResponse.json({ ok: false, error: "informe o id da regra" }, { status: 400 });
    }
    if (corpo.decisao !== "aprovada" && corpo.decisao !== "recusada") {
      return NextResponse.json({ ok: false, error: "informe a decisão: aprovada ou recusada" }, { status: 400 });
    }
    const projeto = await projetoPeloSlug(corpo.projeto);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });

    const store = criarFilaStore(getSupabaseAdminClient());
    const regras = await store.regras(projeto.id);
    if (!regras.some((r) => r.id === corpo.id)) {
      return NextResponse.json({ ok: false, error: "regra não encontrada neste projeto" }, { status: 404 });
    }
    const r = await store.decidirRegra(corpo.id, corpo.decisao, quemDecide(req));
    if (!r) return NextResponse.json({ ok: false, error: "a regra já foi decidida" }, { status: 409 });
    return NextResponse.json({ ok: true, regra: r });
  } catch (err) {
    console.error("[ADMIN APROVACAO REGRAS]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao decidir a regra." },
      { status: 500 },
    );
  }
}
