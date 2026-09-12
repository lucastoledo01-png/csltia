import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminOrCron } from "@/lib/server/api-auth";
import {
  MOTIVO_QA_BLOQUEOU,
  diagnosticoSocialDoErro,
  detalheDoBloqueioDoErro,
  motivoDoErro,
  runNewsroom,
} from "@/lib/server/newsroom/newsroom-service";

async function handleRun(req: NextRequest) {
  const denied = await requireAdminOrCron(req);
  if (denied) return denied;

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : process.env.DRY_RUN === "true";
    const publishToPortal = typeof body.publishToPortal === "boolean" ? body.publishToPortal : !dryRun;
    const createNewsletterCampaign =
      typeof body.createNewsletterCampaign === "boolean" ? body.createNewsletterCampaign : !dryRun;
    const autoSend =
      typeof body.autoSend === "boolean" ? body.autoSend : process.env.NEWSLETTER_AUTO_SEND !== "false";

    console.log(
      `[NEWSROOM API RUN] Executando redação (dryRun: ${dryRun}, publishPortal: ${publishToPortal}, campaign: ${createNewsletterCampaign}, autoSend: ${autoSend})...`,
    );

    const result = await runNewsroom({
      dryRun,
      publishToPortal,
      createNewsletterCampaign,
      autoSend,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[NEWSROOM API ERROR]", err);

    /*
     * A newsletter falhou, e o Instagram do dia não falhou junto.
     *
     * Os dois são consumidores independentes do mesmo trabalho editorial, e o
     * social roda ANTES do portão do QA, de propósito. Quando a edição é
     * bloqueada, o canal social já rodou inteiro: devolver só `{ok:false,
     * error}` apagava esse resultado e deixava quem opera sem saber se o feed
     * do dia aconteceu.
     *
     * A resposta continua sendo erro, com o mesmo 500 e a mesma mensagem. Ela
     * só passa a dizer também o que o social produziu antes.
     */
    const motivo = motivoDoErro(err);
    const social = diagnosticoSocialDoErro(err);
    const mensagem =
      err instanceof Error ? err.message : "Erro interno ao executar a redação automatizada.";

    return NextResponse.json(
      {
        ok: false,
        newsletter: {
          status: motivo === MOTIVO_QA_BLOQUEOU ? "blocked" : "failed",
          reason: motivo,
          error: mensagem,
          // Quais conclusões foram apontadas, e não só quantas.
          ...(detalheDoBloqueioDoErro(err) ? { detalhe: detalheDoBloqueioDoErro(err) } : {}),
        },
        ...(social ? { social } : {}),
        // Mantido para quem já lia este campo. A resposta ganhou estrutura, e
        // não trocou de contrato.
        error: mensagem,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRun(req);
}

export async function POST(req: NextRequest) {
  return handleRun(req);
}
