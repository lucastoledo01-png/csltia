import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { executarAcao, visaoDaFila, type CorpoDaAcao } from "@/lib/server/aprovacao/painel";
import { processarRefacoes } from "@/lib/server/aprovacao/refacao-assincrona";
import { comoProjetoDaFila, projetoPeloSlug, quemDecide } from "@/lib/server/aprovacao/rotas";
import { previasDaFila, type PreviaDaPeca } from "@/lib/server/aprovacao/previa";
import { explicarDiaDoInstagram, lerDiaDoInstagram } from "@/lib/server/aprovacao/dia-do-instagram";

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
    const client = getSupabaseAdminClient();
    const visao = await visaoDaFila(p, depsDaFila(client, p));
    /*
     * A peça como vai ao ar e o dia do Instagram (06/10/2026). Ver
     * `previa.ts` e `dia-do-instagram.ts`. Falhar aqui não derruba a fila:
     * o painel mostra o cartão sem a prévia, com o motivo, e as decisões
     * continuam possíveis.
     */
    const agora = Date.now();
    const [previas, instagram] = await Promise.all([
      previasDaFila(client, projeto.id, visao.fila, visao.modo, agora).catch((erro: unknown) => {
        console.error("[ADMIN APROVACAO] prévias:", erro);
        return {} as Record<string, PreviaDaPeca>;
      }),
      lerDiaDoInstagram(client, projeto.id, new Date(agora - 36 * 60 * 60 * 1000).toISOString())
        .then(explicarDiaDoInstagram)
        .catch((erro: unknown) => ({
          gravados: 0,
          frase: `Não consegui ler o diagnóstico do Instagram: ${erro instanceof Error ? erro.message : String(erro)}`,
          detalhes: [],
          quando: null,
        })),
    ]);
    return NextResponse.json({
      ok: true,
      projeto: { slug: projeto.slug, nome: projeto.name },
      ...visao,
      previas,
      instagram,
      agora: new Date(agora).toISOString(),
    });
  } catch (err) {
    console.error("[ADMIN APROVACAO]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao ler a fila." },
      { status: 500 },
    );
  }
}

// A refação de uma seleção pode levar minutos (pacote, redação, foto, arte).
export const maxDuration = 900;

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const corpo = (await req.json().catch(() => ({}))) as CorpoDaAcao & { projeto?: unknown };
    const projeto = await projetoPeloSlug(corpo.projeto);
    if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
    const p = comoProjetoDaFila(projeto);
    const quem = quemDecide(req);
    const deps = depsDaFila(getSupabaseAdminClient(), p);
    const r = await executarAcao(p, corpo, quem, deps);
    /*
     * A refação agendada roda DEPOIS da resposta (06/10/2026): o clique volta
     * na hora com "na fila", e a refação começa em seguida, sem esperar o
     * relógio de um minuto. Se este processo cair no meio, o relógio pega a
     * refação travada depois de `MINUTOS_PARA_REFACAO_TRAVADA`.
     */
    if (r.ok && corpo.acao === "reprovar" && r.corpo.desfecho === "refacao_agendada" && typeof corpo.id === "string") {
      const id = corpo.id;
      after(async () => {
        try {
          const feitas = await processarRefacoes(p, deps, { ids: [id], limite: 1 });
          for (const f of feitas) console.log(`[ADMIN APROVACAO] refação ${f.id}: ${f.desfecho} (${f.detalhe})`);
        } catch (erro) {
          console.error(`[ADMIN APROVACAO] refação ${id} falhou fora do clique:`, erro);
        }
      });
    }
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
