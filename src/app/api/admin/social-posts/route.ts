import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireActiveProject, projectToday, DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const supabase = getSupabaseAdminClient();
    const project = await requireActiveProject(DEFAULT_PROJECT_ID);
    const today = projectToday(project);

    const { data, error } = await supabase
      .from("social_posts")
      .select(
        "id, scheduled_at, published_at, status, error_message, title, caption, platform, post_type, slides_manifest",
      )
      .eq("project_id", project.id)
      .eq("edition_date", today)
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    const posts = (data || []).map((post) => {
      const slides = Array.isArray(post.slides_manifest)
        ? (post.slides_manifest as Array<{ url?: string; index?: number }>)
        : [];
      const sorted = [...slides].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      return {
        id: post.id,
        scheduled_at: post.scheduled_at,
        published_at: post.published_at,
        status: post.status as "scheduled" | "published" | "failed",
        error_message: post.error_message,
        title: post.title,
        caption: post.caption,
        platform: post.platform,
        post_type: post.post_type,
        slide_count: sorted.length,
        cover_url: sorted[0]?.url ?? null,
      };
    });

    return NextResponse.json(posts);
  } catch (err) {
    console.error("Erro ao listar posts:", err);
    return NextResponse.json(
      { error: "Não foi possível carregar os posts" },
      { status: 500 },
    );
  }
}
