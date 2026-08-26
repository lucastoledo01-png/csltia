import { NextRequest, NextResponse } from "next/server";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "casaloti_admin_secret_key";
    const urlSecret = req.nextUrl.searchParams.get("secret");

    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (cronSecret && urlSecret === cronSecret);

    if (!isAuthorized && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    console.log("[CRON NEWSROOM] Executando disparo diário da redação desbuguei.ia...");

    const result = await runNewsroom({
      dryRun: false,
      publishToPortal: true,
      createNewsletterCampaign: true,
      autoSend: true,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[CRON NEWSROOM ERROR]", err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
