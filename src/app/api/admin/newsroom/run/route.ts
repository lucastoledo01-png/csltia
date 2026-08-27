import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminOrCron } from "@/lib/server/api-auth";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

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
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erro interno ao executar a redação automatizada.",
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
