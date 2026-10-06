import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { formatError, sendAlert } from "@/lib/server/alerts";
import { listProjects } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { cicloDaFila } from "@/lib/server/aprovacao/fila";
import { processarRefacoes } from "@/lib/server/aprovacao/refacao-assincrona";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";

/**
 * O relógio da fila de aprovação (05/10/2026).
 *
 * Avisa no Telegram, a partir das 06:00 locais, a newsletter que ainda não foi
 * aprovada, e libera o que foi aprovado e já chegou à hora (06:07 para a
 * newsletter). É idempotente e foi desenhado para ser chamado a cada minuto: o
 * aviso grava `avisado_em` e a liberação grava `liberado_em`.
 *
 * Desde 06/10/2026 também roda as refações pendentes, depois da resposta
 * (`processarRefacoes`).
 *
 * Itera os projetos ativos, ao contrário do cron da redação. Projeto com a
 * fila fora de `enforce` é pulado sem nenhuma leitura da fila.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const client = getSupabaseAdminClient();
    const resultados: Record<string, unknown> = {};
    for (const projeto of await listProjects(true)) {
      if (modoDaFila(projeto) !== "enforce") continue;
      const p = comoProjetoDaFila(projeto);
      const deps = depsDaFila(client, p);
      resultados[projeto.slug] = await cicloDaFila(p, deps);
      /*
       * As refações pendentes (06/10/2026), depois da resposta: uma seleção
       * refeita leva minutos, e o cron de um minuto não pode esperar. A
       * reivindicação condicional impede dois giros de refazerem a mesma peça.
       */
      after(async () => {
        try {
          const feitas = await processarRefacoes(p, deps);
          for (const f of feitas) console.log(`[CRON FILA] ${projeto.slug} refação ${f.id}: ${f.desfecho} (${f.detalhe})`);
        } catch (erro) {
          await sendAlert("warning", "Refações da fila falharam", formatError(erro));
        }
      });
    }
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    await sendAlert("critical", "Cron da fila de aprovação falhou", formatError(err));
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const maxDuration = 900;

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
