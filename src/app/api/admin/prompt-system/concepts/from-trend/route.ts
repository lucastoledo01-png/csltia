import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { gerarEGravarConceito } from "@/lib/server/prompt-system/concepts";

/**
 * Etapa 2 (com o guardrail da etapa 3): gera o conceito a partir de uma
 * tendência candidata.
 *
 * Conceito barrado pelo guardrail volta 200 com `status: "blocked"` e o
 * veredito — não é erro de servidor, é o portão funcionando, e quem opera
 * precisa ver o motivo para reformular.
 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const trendId = String(body.trendId ?? "").trim();

  if (!trendId) {
    return NextResponse.json({ ok: false, error: "Informe o trendId." }, { status: 400 });
  }

  try {
    const c = await gerarEGravarConceito(trendId);

    return NextResponse.json({
      ok: true,
      conceptId: c.id,
      status: c.status,
      aplicacoes: c.aplicacoes.length,
      ipCheck: c.ipCheck,
      resumo:
        c.status === "blocked"
          ? `Conceito BARRADO pelo guardrail de PI: ${c.ipCheck.motivos.join(" ")}`
          : `Conceito gravado com ${c.aplicacoes.length} aplicação(ões).`,
    });
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Falha ao gerar conceito:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gerar o conceito." },
      { status: 400 },
    );
  }
}
