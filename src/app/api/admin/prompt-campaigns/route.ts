import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { createCampaign, listCampaigns } from "@/lib/server/prompt-system/campaigns";
import { validateKeyword } from "@/lib/prompt-system/keyword";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const status = req.nextUrl.searchParams.get("status");

  try {
    const campaigns = await listCampaigns(DEFAULT_PROJECT_ID, { status: status ?? undefined });
    return NextResponse.json({ ok: true, campaigns });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erro ao listar campanhas." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { keyword, theme, format, campaign_type, lp_url, dm_message, opening_dm_message } = body;

  // A keyword é validada aqui porque a regra é nossa e o erro é acionável para
  // quem digita. Já `format`, `campaign_type`, `status` e `source` têm CHECK no
  // banco: repetir a lista aqui divergiria dele, então quem recusa é o Postgres
  // e a mensagem sobe traduzida.
  const validation = validateKeyword(keyword);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const campaign = await createCampaign({
      projectId: DEFAULT_PROJECT_ID,
      keyword: validation.keyword,
      campaignType: campaign_type ?? "prompt",
      format: format ?? "prompt",
      status: "draft",
      source: "manual",
      theme: typeof theme === "string" ? theme : "",
      lpUrl: typeof lp_url === "string" ? lp_url : null,
      dmMessage: typeof dm_message === "string" ? dm_message : null,
      openingDmMessage: typeof opening_dm_message === "string" ? opening_dm_message : null,
    });

    return NextResponse.json({ ok: true, campaign }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao registrar campanha.";
    // Keyword ocupada e valor recusado pelo CHECK são escolhas do usuário, não
    // falha de servidor: o painel usa o status para distinguir "corrija" de
    // "algo quebrou".
    const conflito = message.includes("já está em uso");
    const recusado = message.includes("violates check constraint");
    return NextResponse.json(
      { ok: false, error: message },
      { status: conflito ? 409 : recusado ? 400 : 500 },
    );
  }
}
