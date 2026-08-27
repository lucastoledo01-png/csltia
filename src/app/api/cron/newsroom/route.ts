import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    console.log("[CRON NEWSROOM] Executando disparo diário da redação desbuguei.ia...");

    const result = await runNewsroom({
      dryRun: false,
      publishToPortal: true,
      createNewsletterCampaign: true,
      autoSend: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[CRON NEWSROOM ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
