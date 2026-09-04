import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { gerarAssetsDaCampanha } from "@/lib/server/prompt-system/visual";

/**
 * Etapas 4 e 5: gera as imagens do conceito e grava cada prompt junto da sua
 * imagem.
 *
 * Sem `maxDuration` estendido a rota morre no meio: são N chamadas de geração
 * de imagem em série, e `gpt-image-1` leva alguns segundos por imagem. Cortar
 * pela metade deixaria assets gravados e outros não — o que é recuperável,
 * porque o upsert por `(campaign_id, label)` torna a re-execução idempotente.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;

  try {
    const resultado = await gerarAssetsDaCampanha(id);
    const semImagem = resultado.assets.filter((a) => !a.imageUrl).length;

    return NextResponse.json({
      ok: true,
      ...resultado,
      // O painel precisa distinguir "gerou tudo" de "gravou os prompts e as
      // imagens falharam" — nos dois casos a resposta é 200.
      resumo: `${resultado.assets.length} asset(s) gravado(s)` +
        (semImagem ? `, ${semImagem} sem imagem` : ""),
    });
  } catch (err) {
    console.error("[PROMPT-SYSTEM] Falha ao gerar assets:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gerar os assets." },
      { status: 400 },
    );
  }
}
