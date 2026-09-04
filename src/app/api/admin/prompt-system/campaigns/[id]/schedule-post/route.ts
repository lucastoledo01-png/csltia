import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { agendarPostDaCampanha } from "@/lib/server/prompt-system/carrossel-de-campanha";

/**
 * Etapa 6: agenda o post da campanha — capa mais um slide de tela cheia por
 * resultado gerado.
 *
 * `quando` é opcional; sem ele o post fica devido agora e o worker o pega no
 * próximo giro (até 15 minutos).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const quando = typeof body.quando === "string" ? new Date(body.quando) : new Date();
  if (Number.isNaN(quando.getTime())) {
    return NextResponse.json({ ok: false, error: "Data de agendamento inválida." }, { status: 400 });
  }

  try {
    const r = await agendarPostDaCampanha(id, quando);
    return NextResponse.json({
      ok: true,
      ...r,
      resumo:
        `Post agendado com ${r.slides} slide(s)` +
        (r.semImagem ? `. ${r.semImagem} asset(s) sem imagem ficaram de fora.` : "."),
    });
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Falha ao agendar o post da campanha:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao agendar o post." },
      { status: 400 },
    );
  }
}
