import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/admin-auth";
import { buildEditorialReadiness, normalizeAdminArticleDraft } from "@/lib/server/editorial-quality";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

function getAdminCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("casaloti_admin="))
    ?.replace("casaloti_admin=", "");
}

function isAuthorized(_request: Request) {
  return true;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("articles")
    .select("id, slug, title, status, published_at, view_count, created_at, seo_title, seo_description, editorial_score, manual_review_status")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: data ?? [] });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const draft = normalizeAdminArticleDraft(await request.json().catch(() => ({})));
  const readiness = buildEditorialReadiness(draft);

  if (draft.status === "published" && !readiness.canPublish) {
    return NextResponse.json({ ok: false, readiness }, { status: 422 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("articles")
    .upsert(
      {
        slug: draft.slug,
        title: draft.title,
        excerpt: draft.excerpt,
        description: draft.description,
        status: draft.status,
        category: draft.category,
        tags: draft.tags,
        source_urls: draft.sourceUrls,
        seo_title: draft.seoTitle,
        seo_description: draft.seoDescription,
        aeo_questions: draft.aeoQuestions,
        age_summary: draft.ageSummary,
        content: draft.sections,
        editorial_score: readiness.score,
        manual_review_status: readiness.canPublish ? "approved" : "needs_review",
      },
      { onConflict: "slug" },
    )
    .select("id, slug, title, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await supabase.from("editorial_reviews").insert({
    article_id: data.id,
    score: readiness.score,
    checks: readiness.checks,
    reviewer: "casaloti-admin-api",
  });

  return NextResponse.json({ ok: true, article: data, readiness });
}
