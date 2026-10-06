import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { criarFilaStore } from "@/lib/server/aprovacao/fila-store";
import { projetoPeloSlug } from "@/lib/server/aprovacao/rotas";
import { visaoDoAprendizado } from "@/lib/server/aprendizado/painel";
import { chamarModeloDeProducao, resumirEdicoesDaSemana } from "@/lib/server/aprendizado/edicoes";

/**
 * O painel de aprendizado de um projeto (06/10/2026).
 *
 * GET devolve a taxa de aprovação de primeira por canal e por semana, as
 * regras que valem, as propostas que esperam o dono, os motivos de reprovação
 * mais repetidos por etapa e as edições recentes. POST com
 * `{"acao": "resumir-edicoes"}` roda agora o resumo semanal das edições (o
 * mesmo da rota de cron), que só PROPÕE regras.
 *
 * Decidir uma proposta continua em `/api/admin/aprovacao/regras`, a mesma
 * rota da fila: uma porta só para a regra virar regra.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const projeto = await projetoPeloSlug(req.nextUrl.searchParams.get("projeto"));
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    const visao = await visaoDoAprendizado(
      { id: projeto.id, timezone: projeto.timezone },
      criarFilaStore(getSupabaseAdminClient()),
    );
    return NextResponse.json({ ok: true, projeto: { slug: projeto.slug, nome: projeto.name }, ...visao });
  } catch (err) {
    console.error("[ADMIN APRENDIZADO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler o aprendizado." },
      { status: 500 },
    );
  }
}

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const corpo = (await req.json().catch(() => ({}))) as { projeto?: unknown; acao?: unknown };
    if (corpo.acao !== "resumir-edicoes") {
      return NextResponse.json({ ok: false, error: 'ação desconhecida. Conhecida: "resumir-edicoes"' }, { status: 400 });
    }
    const projeto = await projetoPeloSlug(corpo.projeto);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    const r = await resumirEdicoesDaSemana(
      { id: projeto.id },
      { store: criarFilaStore(getSupabaseAdminClient()), chamarModelo: chamarModeloDeProducao() },
    );
    console.log(
      `[ADMIN APRENDIZADO] ${projeto.slug} resumo das edições: ${r.edicoesLidas} lidas, ${r.propostas.length} proposta(s)` +
        (r.erro ? `, erro: ${r.erro}` : ""),
    );
    return NextResponse.json({ ok: !r.erro, ...r, ...(r.erro ? { error: r.erro } : {}) }, { status: r.erro ? 502 : 200 });
  } catch (err) {
    console.error("[ADMIN APRENDIZADO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao resumir as edições." },
      { status: 500 },
    );
  }
}
