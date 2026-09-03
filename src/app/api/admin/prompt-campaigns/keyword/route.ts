import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { checkKeywordAvailability } from "@/lib/server/prompt-system/campaigns";

/**
 * Disponibilidade da keyword — etapa 7.
 *
 * Responde com o mesmo par de status do contrato documentado com o OpenReply
 * (`200` livre / `409` em uso) para que o painel e, na Fase 1, a rota de
 * serviço do OpenReply falem a mesma língua.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const keyword = req.nextUrl.searchParams.get("keyword");
  if (!keyword) {
    return NextResponse.json({ ok: false, error: "Informe a keyword." }, { status: 400 });
  }

  try {
    const result = await checkKeywordAvailability(DEFAULT_PROJECT_ID, keyword);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.available ? 200 : 409 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Erro ao checar keyword." },
      { status: 400 },
    );
  }
}
