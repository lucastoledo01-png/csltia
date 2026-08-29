import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { checkAndRefreshInstagramToken } from "@/lib/server/social/instagram/meta-token";
import { pingHealthcheck, sendAlert, formatError } from "@/lib/server/alerts";

/**
 * Verificação diária do token de longa duração da Meta. Checa a validade,
 * renova quando falta pouco (fb_exchange_token) e alerta no Telegram se não
 * conseguir. Rápido — responde na hora, sem 202.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const healthcheck = process.env.HEALTHCHECK_INSTAGRAM_URL;

  try {
    const result = await checkAndRefreshInstagramToken(DEFAULT_PROJECT_ID, process.env);
    await pingHealthcheck(healthcheck, result.ok ? undefined : "fail");
    return NextResponse.json(result);
  } catch (err) {
    await sendAlert("critical", "Cron do token do Instagram falhou", formatError(err));
    await pingHealthcheck(healthcheck, "fail");
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
