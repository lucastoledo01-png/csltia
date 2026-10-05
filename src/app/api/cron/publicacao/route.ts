import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { publicarOQueVenceu } from "@/lib/server/publicacao-agendada";

export const maxDuration = 60;

/**
 * O relógio da publicação (RF-01, 05/10/2026).
 *
 * Chamado de minuto em minuto. Publica no portal o que a produção da véspera
 * deixou com hora marcada e cuja hora chegou, nos projetos com
 * `producao_vespera` em `enforce`. Nos demais não faz nada, então instalar a
 * linha do crontab antes de ligar a capacidade é inócuo.
 *
 * Síncrona: são duas consultas por projeto, e a resposta é o próprio relatório.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const projetos = await publicarOQueVenceu();
    const comErro = projetos.some((p) => p.erros.length > 0);
    return NextResponse.json({ ok: !comErro, projetos }, { status: comErro ? 500 : 200 });
  } catch (err) {
    console.error("[CRON PUBLICACAO ERROR]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
