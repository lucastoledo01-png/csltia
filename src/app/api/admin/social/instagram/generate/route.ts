import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { requestInstagramPost } from "@/lib/server/social/instagram/instagram-service";

/**
 * Enfileira um post para o worker processar.
 *
 * A aplicação web não renderiza os slides: isso exige Chromium, que não roda na
 * hospedagem que serve o site. A rota apenas cria a vaga com horário imediato;
 * quem gera, renderiza e publica é o worker.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));

    const resultado = await requestInstagramPost({
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      editionDateStr: typeof body.editionDateStr === "string" ? body.editionDateStr : undefined,
      storyIndex: typeof body.storyIndex === "number" ? body.storyIndex : undefined,
    });

    return NextResponse.json({
      ok: true,
      ...resultado,
      message: "Post enfileirado. O worker processa no próximo giro.",
    });
  } catch (err) {
    console.error("[API INSTAGRAM GENERATE ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
