import { getSupabaseAdminClient } from "../supabase-admin";
import { buildEditorialReadiness, type AdminArticleDraft } from "../editorial-quality";

/**
 * Persiste um rascunho de tutorial gerado pela IA na tabela `articles`.
 * Compartilhado entre a rota manual (/api/admin/tutorials/generate) e o
 * cron diário automático — mesma lógica, duas origens.
 */
export async function saveTutorialDraft(draft: AdminArticleDraft, reviewer: string) {
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
    throw new Error(`Falha ao salvar tutorial: ${error?.message}`);
  }

  await supabase.from("editorial_reviews").insert({
    article_id: data.id,
    score: readiness.score,
    checks: readiness.checks,
    reviewer,
  });

  return { article: data, readiness };
}
