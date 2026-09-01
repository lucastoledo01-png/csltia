import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { UpdateCampaignDmCopySchema } from "@/lib/server/prompt-system/schemas";
import { updateCampaignDmCopy } from "@/lib/server/prompt-system/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCampaignDmCopySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const campaign = await updateCampaignDmCopy(id, parsed.data);
    return NextResponse.json(campaign);
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Erro ao gravar copy da campanha:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gravar copy da campanha." },
      { status: 500 },
    );
  }
}
