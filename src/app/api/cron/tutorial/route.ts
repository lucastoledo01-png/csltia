import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { pickTodaysTopic } from "@/lib/server/tutorials/topic-sources";
import { generateTutorialDraft } from "@/lib/server/tutorials/generate-tutorial";
import { saveTutorialDraft } from "@/lib/server/tutorials/save-tutorial-draft";

export const maxDuration = 300;

/**
 * Disparo diário do gerador de tutorial. Alterna a inspiração entre GitHub
 * (repositório em alta) e Instagram (hashtag em alta) por dia-do-ano — ver
 * `pickSourceForToday` em topic-sources.ts. Sempre gera um rascunho para
 * revisão humana; nunca publica sozinho.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";

  const execucao = (async () => {
    const { suggestion, reasons } = await pickTodaysTopic();
    if (!suggestion) {
      throw new Error(
        `Nenhuma fonte de tema devolveu resultado hoje. ${reasons.join(" | ")}`,
      );
    }

    const { draft } = await generateTutorialDraft(suggestion.topic, suggestion.referenceUrls);
    const { article, readiness } = await saveTutorialDraft(draft, `cron-tutorial-${suggestion.origin}`);

    return { suggestion, article, readiness };
  })();

  if (aguardar) {
    try {
      return NextResponse.json({ ok: true, ...(await execucao) });
    } catch (err) {
      console.error("[CRON TUTORIAL ERROR]", err);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  execucao
    .then((resultado) => {
      console.log(
        `[CRON TUTORIAL] Concluído: "${resultado.article.title}" (origem: ${resultado.suggestion.origin} — ${resultado.suggestion.originDetail}), score ${resultado.readiness.score}/100.`,
      );
    })
    .catch((err) => {
      console.error("[CRON TUTORIAL ERROR] Execução em segundo plano falhou:", err);
    });

  return NextResponse.json(
    { ok: true, accepted: true, message: "Geração de tutorial iniciada." },
    { status: 202 },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
