import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { generateTutorialDraft } from "@/lib/server/tutorials/generate-tutorial";
import { saveTutorialDraft } from "@/lib/server/tutorials/save-tutorial-draft";

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => ({}));
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const referenceUrls = Array.isArray(body.referenceUrls)
    ? body.referenceUrls.map((u: unknown) => String(u).trim()).filter(Boolean)
    : [];

  if (!topic) {
    return NextResponse.json({ ok: false, error: "Informe o tema do tutorial." }, { status: 400 });
  }

  try {
    const { draft, usage } = await generateTutorialDraft(topic, referenceUrls);
    const { article, readiness } = await saveTutorialDraft(draft, "casaloti-admin-tutorial-ai");
    return NextResponse.json({ ok: true, article, readiness, usage });
  } catch (err) {
    console.error("Erro ao gerar tutorial com IA:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gerar tutorial." },
      { status: 500 },
    );
  }
}
