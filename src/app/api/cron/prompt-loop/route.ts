import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrCron } from "@/lib/server/api-auth";
import { formatError, pingHealthcheck, sendAlert } from "@/lib/server/alerts";
import { agregarAprendizados, gravarRetratosDoDia } from "@/lib/server/prompt-system/loop";
import { optionalEnv } from "@/lib/server/env";

/**
 * Etapas 13 e 14, diárias: grava o retrato de cada campanha publicada e, uma
 * vez por semana, agrega o período em `prompt_learnings`.
 *
 * A agregação semanal fica no mesmo cron do retrato diário de propósito: ela
 * depende dos retratos, e dois agendamentos separados poderiam rodar fora de
 * ordem — agregando um período cujo último dia ainda não tem retrato.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authErr = await requireAdminOrCron(req);
  if (authErr) return authErr;

  const healthcheck = optionalEnv("HEALTHCHECK_PROMPT_LOOP_URL");
  const agregar = req.nextUrl.searchParams.get("agregar") === "1";

  try {
    const retratos = await gravarRetratosDoDia();
    const aprendizado = agregar ? await agregarAprendizados() : null;

    if (retratos.falhas > 0) {
      await sendAlert(
        "warning",
        "Loop editorial com falhas",
        `${retratos.falhas} de ${retratos.campanhas} campanha(s) sem retrato hoje.`,
      );
    }

    await pingHealthcheck(healthcheck);

    return NextResponse.json({ ok: true, retratos, aprendizado });
  } catch (err) {
    await sendAlert("critical", "Loop editorial falhou", formatError(err));
    await pingHealthcheck(healthcheck, "fail");

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha no loop editorial." },
      { status: 500 },
    );
  }
}
