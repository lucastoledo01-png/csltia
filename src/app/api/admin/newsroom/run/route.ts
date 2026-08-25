import { NextRequest, NextResponse } from "next/server";
import { runNewsroom } from "@/lib/server/newsroom/newsroom-service";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Verificar se a requisição tem a autorização do CRON ou sessão de admin
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const adminCookie = req.cookies.get("casaloti_admin");
      if (!adminCookie) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : process.env.DRY_RUN !== "false";

    const result = await runNewsroom({ dryRun });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[NEWSROOM API ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno ao executar a redação automatizada." },
      { status: 500 }
    );
  }
}
