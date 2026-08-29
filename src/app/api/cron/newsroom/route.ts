import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";
import { formatError, pingHealthcheck, sendAlert } from "@/lib/server/alerts";

export const maxDuration = 300;

/**
 * Disparo diário da redação.
 *
 * A execução completa leva minutos — coleta de feeds, pipeline editorial e
 * criação da campanha — e o proxy da hospedagem encerra a requisição bem antes
 * disso. Por isso a rota responde 202 imediatamente e segue trabalhando: o
 * processo Node é persistente, então a promessa continua depois da resposta.
 *
 * O acompanhamento é pelo banco: `newsroom_runs` guarda o resultado, e o painel
 * de logs mostra o histórico.
 *
 * Para aguardar o fim (teste manual), chame com `?wait=1`.
 */
async function reportNewsroomOutcome(
  resultado: Awaited<ReturnType<typeof runNewsroom>>,
  healthcheck: string | undefined,
): Promise<void> {
  const posts = "scheduledPosts" in resultado ? (resultado.scheduledPosts?.length ?? 0) : 0;
  console.log(
    `[CRON NEWSROOM] Concluído: edição ${resultado.ok ? "gerada" : "não gerada"}, ` +
      `campanha ${"listmonkCampaignId" in resultado ? resultado.listmonkCampaignId : "-"}, ` +
      `${posts} post(s) agendado(s).`,
  );

  if (!resultado.ok) {
    const reason = "reason" in resultado ? resultado.reason : "desconhecido";
    if (reason === "already_executed_today") {
      await pingHealthcheck(healthcheck);
    } else {
      await sendAlert("warning", "Redação não gerou edição", `Motivo: ${reason}`);
      await pingHealthcheck(healthcheck, "fail");
    }
    return;
  }

  const semPautas = "selectedStoriesCount" in resultado && resultado.selectedStoriesCount === 0;
  const qaReprovou = "qaResult" in resultado && resultado.qaResult && !resultado.qaResult.passed;

  if (semPautas) {
    await sendAlert(
      "warning",
      "Redação rodou mas não selecionou nenhuma pauta",
      "Nenhum candidato passou no ranqueamento hoje.",
    );
  } else if (qaReprovou) {
    await sendAlert(
      "warning",
      "Edição retida no QA de alucinação",
      "A campanha ficou como rascunho no Listmonk — revise no painel antes de disparar.",
    );
  }

  await pingHealthcheck(healthcheck);
}

async function reportNewsroomFailure(err: unknown, healthcheck: string | undefined): Promise<void> {
  console.error("[CRON NEWSROOM ERROR] Execução falhou:", err);
  await sendAlert("critical", "Redação falhou", formatError(err));
  await pingHealthcheck(healthcheck, "fail");
}

async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";
  const disparadoEm = new Date().toISOString();
  const healthcheck = process.env.HEALTHCHECK_NEWSROOM_URL;

  void pingHealthcheck(healthcheck, "start");

  const execucao = runNewsroom({
    dryRun: false,
    publishToPortal: true,
    createNewsletterCampaign: true,
    autoSend: true,
  });

  if (aguardar) {
    try {
      const resultado = await execucao;
      await reportNewsroomOutcome(resultado, healthcheck);
      return NextResponse.json(resultado);
    } catch (err) {
      await reportNewsroomFailure(err, healthcheck);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  // Sem o catch aqui, uma falha viraria unhandled rejection e poderia derrubar
  // o processo que serve o site.
  execucao
    .then((resultado) => reportNewsroomOutcome(resultado, healthcheck))
    .catch((err) => reportNewsroomFailure(err, healthcheck));

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      startedAt: disparadoEm,
      message: "Redação iniciada. Acompanhe o resultado em newsroom_runs.",
    },
    { status: 202 },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
