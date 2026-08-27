import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { buildEditorialReadiness } from "@/lib/server/editorial-quality";
import { generateTutorialDraft } from "@/lib/server/tutorials/generate-tutorial";

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

  let draft;
  let usage;
  try {
    ({ draft, usage } = await generateTutorialDraft(topic, referenceUrls));
  } catch (err) {
    console.error("Erro ao gerar tutorial com IA:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao gerar tutorial." },
      { status: 500 },
    );
  }

  const readiness = buildEditorialReadiness(draft);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("articles")
    .upsert(
      {
        slug: draft.slug,
        title: draft.title,
        excerpt: draft.excerpt,
        description: draft.description,
        status: "draft",
        category: draft.category || "Tutorial",
        tags: draft.tags || [],
        source_urls: draft.sourceUrls || [],
        seo_title: draft.seoTitle || draft.title,
        seo_description: draft.seoDescription || draft.description,
        aeo_questions: draft.aeoQuestions || [],
        age_summary: draft.ageSummary || draft.excerpt,
        content: draft.sections || [],
        editorial_score: readiness.score,
        manual_review_status: readiness.canPublish ? "approved" : "needs_review",
        published_at: null,
      },
      { onConflict: "slug" },
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("Erro ao salvar tutorial gerado:", error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }

  await supabase.from("editorial_reviews").insert({
    article_id: data.id,
    score: readiness.score,
    checks: readiness.checks,
    reviewer: "casaloti-admin-tutorial-ai",
  });

  return NextResponse.json({ ok: true, article: data, readiness, usage });
}
