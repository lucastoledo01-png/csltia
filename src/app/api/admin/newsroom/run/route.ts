import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/admin-auth";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

async function handleRun(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "casaloti_admin_secret_key";
    const urlSecret = req.nextUrl.searchParams.get("secret");

    const isAuthorizedCron =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (cronSecret && urlSecret === cronSecret);

    const adminCookie = req.cookies.get("casaloti_admin")?.value;
    const isAuthenticatedAdmin = verifyAdminSessionToken(cronSecret, adminCookie);

    if (!isAuthorizedCron && !isAuthenticatedAdmin && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    // Se dryRun for false ou se for chamado pelo Cron/Admin para publicação real
    const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : (process.env.DRY_RUN === "true");
    const publishToPortal = typeof body.publishToPortal === "boolean" ? body.publishToPortal : !dryRun;
    const createNewsletterCampaign = typeof body.createNewsletterCampaign === "boolean" ? body.createNewsletterCampaign : !dryRun;
    const autoSend = typeof body.autoSend === "boolean" ? body.autoSend : (process.env.NEWSLETTER_AUTO_SEND !== "false");

    console.log(`[NEWSROOM API RUN] Executando redação (dryRun: ${dryRun}, publishPortal: ${publishToPortal}, campaign: ${createNewsletterCampaign}, autoSend: ${autoSend})...`);

    const result = await runNewsroom({
      dryRun,
      publishToPortal,
      createNewsletterCampaign,
      autoSend,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[NEWSROOM API ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno ao executar a redação automatizada." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRun(req);
}

export async function POST(req: NextRequest) {
  return handleRun(req);
}
