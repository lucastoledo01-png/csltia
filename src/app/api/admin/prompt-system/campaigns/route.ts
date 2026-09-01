import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { CreateManualCampaignSchema } from "@/lib/server/prompt-system/schemas";
import { createManualCampaign, listCampaigns } from "@/lib/server/prompt-system/service";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Erro ao listar campanhas:", err);
    return NextResponse.json({ error: "Não foi possível carregar as campanhas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const parsed = CreateManualCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const campaign = await createManualCampaign(parsed.data);
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Erro ao criar campanha:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao criar campanha." },
      { status: 500 },
    );
  }
}
