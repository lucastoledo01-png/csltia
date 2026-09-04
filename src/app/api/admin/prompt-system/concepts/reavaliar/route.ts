import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { reavaliarConceitosBloqueados } from "@/lib/server/prompt-system/concepts";

/**
 * Reaplica o guardrail de PI atual sobre os conceitos barrados.
 *
 * O veredito é gravado, não recalculado na leitura — então um afrouxamento da
 * regra não alcança sozinho o que já está no banco. Sem esta rota o conserto
 * seria `UPDATE` manual em produção.
 *
 * Não usa IA e não chama nada externo: é a mesma função pura do portão,
 * rodando sobre texto que já existe.
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const r = await reavaliarConceitosBloqueados();

    return NextResponse.json({
      ok: true,
      ...r,
      resumo:
        r.avaliados === 0
          ? "Nenhum conceito barrado para reavaliar."
          : `${r.avaliados} conceito(s) reavaliado(s); ${r.liberados} liberado(s).`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
