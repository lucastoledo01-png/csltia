import { NextRequest, NextResponse } from "next/server";
import { getAllArticlesForAdmin } from "@/lib/server/articles-service";
import { buildEditorialReadiness, normalizeAdminArticleDraft } from "@/lib/server/editorial-quality";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireAdmin } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const articles = await getAllArticlesForAdmin();
  return NextResponse.json({ ok: true, articles });
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => ({}));
  const draft = normalizeAdminArticleDraft(body);
  const readiness = buildEditorialReadiness(draft);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("articles")
    .upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        slug: draft.slug,
        title: draft.title,
        excerpt: draft.excerpt,
        description: draft.description,
        status: draft.status || "published",
        category: draft.category || "IA",
        tags: draft.tags || [],
        source_urls: draft.sourceUrls || [],
        seo_title: draft.seoTitle || draft.title,
        seo_description: draft.seoDescription || draft.description,
        aeo_questions: draft.aeoQuestions || [],
        age_summary: draft.ageSummary || draft.excerpt,
        content: draft.sections || [],
        editorial_score: readiness.score || 85,
        manual_review_status: readiness.canPublish ? "approved" : "needs_review",
        published_at: draft.status === "published" ? new Date().toISOString() : null,
      },
      // `unique (slug)` virou `unique (project_id, slug)` na migração
      // multi-projeto.
      { onConflict: "project_id,slug" },
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("Erro ao salvar artigo no Supabase:", error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }

  await supabase.from("editorial_reviews").insert({
    article_id: data.id,
    score: readiness.score,
    checks: readiness.checks,
    reviewer: "casaloti-admin-cms",
  });

  return NextResponse.json({ ok: true, article: data, readiness });
}

export async function PUT(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => ({}));
  const { id, slug, ...updates } = body;

  if (!slug && !id) {
    return NextResponse.json({ ok: false, error: "slug ou id obrigatorio" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const query = id ? supabase.from("articles").update(updates).eq("id", id) : supabase.from("articles").update(updates).eq("slug", slug);

  const { data, error } = await query.select("*").single();

  if (error) {
    console.error("Erro ao atualizar artigo:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, article: data });
}

export async function DELETE(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const slug = searchParams.get("slug");

  if (!id && !slug) {
    return NextResponse.json({ ok: false, error: "id ou slug necessario" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const query = id ? supabase.from("articles").delete().eq("id", id) : supabase.from("articles").delete().eq("slug", slug);

  const { error } = await query;

  if (error) {
    console.error("Erro ao deletar artigo:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
