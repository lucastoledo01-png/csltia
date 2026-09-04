import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import {
  deleteCampaign,
  getCampaignById,
  isDeletable,
  updateCampaign,
} from "@/lib/server/prompt-system/campaigns";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    status,
    theme,
    format,
    lp_url,
    dm_message,
    opening_dm_message,
    follow_up_enabled,
    follow_up_delay_minutes,
    follow_up_message,
    ig_media_id,
    openreply_automation_id,
  } = body;

  // Sem lista de status aqui: o CHECK do banco é a autoridade, e um valor
  // recusado volta como 400 com a mensagem do Postgres.
  try {
    const campaign = await updateCampaign(id, {
      status,
      theme: typeof theme === "string" ? theme : undefined,
      format: typeof format === "string" ? format : undefined,
      lpUrl: lp_url,
      dmMessage: dm_message,
      openingDmMessage: opening_dm_message,
      followUpEnabled: typeof follow_up_enabled === "boolean" ? follow_up_enabled : undefined,
      followUpDelayMinutes: follow_up_delay_minutes,
      followUpMessage: follow_up_message,
      igMediaId: ig_media_id,
      openReplyAutomationId: openreply_automation_id,
    });

    return NextResponse.json({ ok: true, campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar campanha.";
    const recusado = message.includes("violates check constraint");
    return NextResponse.json({ ok: false, error: message }, { status: recusado ? 400 : 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const campaign = await getCampaignById(id);

  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Campanha não encontrada." }, { status: 404 });
  }

  // Havendo post no Instagram ou automação no OpenReply, apagar a linha deixa
  // os eventos do funil sem campanha e sumiria com o histórico do que foi ao
  // ar — arquivar preserva os dois.
  if (!isDeletable(campaign)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Campanha já tem post ou automação vinculados e não pode ser removida. Arquive em vez de apagar.",
      },
      { status: 409 },
    );
  }

  try {
    await deleteCampaign(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erro ao remover campanha." },
      { status: 500 },
    );
  }
}
