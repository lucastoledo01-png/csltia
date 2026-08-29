import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { pickTodaysTopic } from "@/lib/server/tutorials/topic-sources";
import { generateTutorialDraft } from "@/lib/server/tutorials/generate-tutorial";
import { saveTutorialDraft } from "@/lib/server/tutorials/save-tutorial-draft";
import { formatError, pingHealthcheck, sendAlert } from "@/lib/server/alerts";

export const maxDuration = 300;

/**
 * Disparo diário do gerador de tutorial. Alterna a inspiração entre GitHub
 * (repositório em alta) e Instagram (hashtag em alta) por dia-do-ano — ver
 * `pickSourceForToday` em topic-sources.ts. Sempre gera um rascunho para
 * revisão humana; nunca publica sozinho.
 */
type TutorialOutcome = {
  suggestion: { origin: string; originDetail: string };
  article: { title: string };
  readiness: { score: number };
};

async function reportTutorialOutcome(r: TutorialOutcome, healthcheck: string | undefined): Promise<void> {
  console.log(
    `[CRON TUTORIAL] Concluído: "${r.article.title}" (origem: ${r.suggestion.origin} — ${r.suggestion.originDetail}), score ${r.readiness.score}/100.`,
  );
  await pingHealthcheck(healthcheck);
}

async function reportTutorialFailure(err: unknown, healthcheck: string | undefined): Promise<void> {
  console.error("[CRON TUTORIAL ERROR] Execução falhou:", err);
  await sendAlert("critical", "Gerador de tutorial falhou", formatError(err));
  await pingHealthcheck(healthcheck, "fail");
}

async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";
  const healthcheck = process.env.HEALTHCHECK_TUTORIAL_URL;

  void pingHealthcheck(healthcheck, "start");

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
      const resultado = await execucao;
      await reportTutorialOutcome(resultado, healthcheck);
      return NextResponse.json({ ok: true, ...resultado });
    } catch (err) {
      await reportTutorialFailure(err, healthcheck);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  execucao
    .then((resultado) => reportTutorialOutcome(resultado, healthcheck))
    .catch((err) => reportTutorialFailure(err, healthcheck));

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
