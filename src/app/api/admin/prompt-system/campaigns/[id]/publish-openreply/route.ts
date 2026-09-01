import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { publishCampaignToOpenReply } from "@/lib/server/prompt-system/service";

/**
 * Etapa 8: publica a automação no fork do OpenReply (D1 em
 * docs/sistema-prompt-arquitetura.md). A rota `/api/service/automations`
 * ainda não existe do lado do OpenReply — essa chamada falha (404 ou erro
 * de rede) até o fork mínimo ser implementado lá. Falha esperada hoje, não
 * indica bug neste repo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;

  try {
    const campaign = await publishCampaignToOpenReply(id);
    return NextResponse.json(campaign);
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Erro ao publicar automação no OpenReply:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao publicar no OpenReply." },
      { status: 502 },
    );
  }
}
