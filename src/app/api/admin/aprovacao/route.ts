import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { executarAcao, visaoDaFila, type CorpoDaAcao } from "@/lib/server/aprovacao/painel";
import { comoProjetoDaFila, projetoPeloSlug, quemDecide } from "@/lib/server/aprovacao/rotas";

/**
 * A fila de aprovação de um projeto (05/10/2026, RF-21 a RF-24).
 *
 * GET devolve a fila já ordenada (aviso de QA primeiro), a taxa de aprovação
 * sem retrabalho por ramo e as regras propostas. POST executa uma decisão:
 * aprovar, aprovar em lote, reprovar com etapa, cancelar, editar o texto.
 *
 * As tabelas só existem depois da migration `20261005120000_fila_de_aprovacao`.
 * Antes dela esta rota responde 500 com a mensagem do PostgREST, e o resto do
 * sistema não percebe nada, porque com a capacidade em `off` ninguém lê a fila.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const projeto = await projetoPeloSlug(req.nextUrl.searchParams.get("projeto"));
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    const p = comoProjetoDaFila(projeto);
    const visao = await visaoDaFila(p, depsDaFila(getSupabaseAdminClient(), p));
    return NextResponse.json({ ok: true, projeto: { slug: projeto.slug, nome: projeto.name }, ...visao });
  } catch (err) {
    console.error("[ADMIN APROVACAO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler a fila." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const corpo = (await req.json().catch(() => ({}))) as CorpoDaAcao & { projeto?: unknown };
    const projeto = await projetoPeloSlug(corpo.projeto);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    const p = comoProjetoDaFila(projeto);
    const quem = quemDecide(req);
    const r = await executarAcao(p, corpo, quem, depsDaFila(getSupabaseAdminClient(), p));
    console.log(
      `[ADMIN APROVACAO] ${projeto.slug} ${String(corpo.acao)} ${String(corpo.id ?? corpo.ramo ?? "")} ` +
        `por ${quem}: ${r.ok ? "ok" : String(r.corpo.error)}`,
    );
    return NextResponse.json(r.corpo, { status: r.status });
  } catch (err) {
    console.error("[ADMIN APROVACAO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao decidir." },
      { status: 500 },
    );
  }
}
