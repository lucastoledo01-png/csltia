import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

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
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";
  const disparadoEm = new Date().toISOString();

  const execucao = runNewsroom({
    dryRun: false,
    publishToPortal: true,
    createNewsletterCampaign: true,
    autoSend: true,
  });

  if (aguardar) {
    try {
      return NextResponse.json(await execucao);
    } catch (err) {
      console.error("[CRON NEWSROOM ERROR]", err);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  // Sem o catch aqui, uma falha viraria unhandled rejection e poderia derrubar
  // o processo que serve o site.
  execucao
    .then((resultado) => {
      console.log(
        `[CRON NEWSROOM] Concluído: edição ${resultado.ok ? "gerada" : "não gerada"}, ` +
          `campanha ${"listmonkCampaignId" in resultado ? resultado.listmonkCampaignId : "-"}, ` +
          `${"scheduledPosts" in resultado ? (resultado.scheduledPosts?.length ?? 0) : 0} post(s) agendado(s).`,
      );
    })
    .catch((err) => {
      console.error("[CRON NEWSROOM ERROR] Execução em segundo plano falhou:", err);
    });

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
