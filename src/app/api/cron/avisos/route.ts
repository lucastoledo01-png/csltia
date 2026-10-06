import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { listProjects } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { cicloDosAvisos } from "@/lib/server/avisos/avisos";
import { depsDosAvisos } from "@/lib/server/avisos/supabase";

export const maxDuration = 60;

/**
 * O relógio dos avisos de operação (06/10/2026).
 *
 * Chamado de minuto em minuto. Confere, no fuso de cada projeto ativo, se
 * venceu a janela de algum aviso (fila pronta, lembrete das 22:00, última
 * chamada das 05:30, resumo das 22:30, produção que não rodou, newsletter
 * aprovada que não saiu) e manda o que venceu, uma vez por dia. A regra de
 * cada aviso está em `avisos.ts`.
 *
 * Rota própria, e não dentro do cron da fila, por dois motivos: o cron da fila
 * pula projeto fora de `enforce` antes de ler qualquer coisa, e o resumo do
 * dia vale com a fila desligada; e uma falha aqui não pode atrasar a liberação
 * da newsletter das 06:07.
 *
 * Síncrona: são poucas leituras por projeto, e só dentro das janelas.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const deps = depsDosAvisos(getSupabaseAdminClient());
    const resultados: Record<string, unknown> = {};
    for (const projeto of await listProjects(true)) {
      resultados[projeto.slug] = await cicloDosAvisos(projeto, deps);
    }
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    // Sem alerta aqui, de propósito: este cron roda a cada minuto, e um banco
    // fora viraria um alerta crítico por minuto. Quem grita banco fora é a
    // redação e a fila; este responde 500 para o log do cron.
    console.error("[CRON AVISOS ERROR]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
