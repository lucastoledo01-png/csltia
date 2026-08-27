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
      .select("id, scheduled_at, status, error_message")
      .eq("project_id", project.id)
      .eq("edition_date", today)
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    const postsWithCounts = await Promise.all(
      (data || []).map(async (post) => {
        const { count } = await supabase
          .from("carousel_slides")
          .select("id", { count: "exact" })
          .eq("social_post_id", post.id);

        return {
          ...post,
          slide_count: count || 0,
        };
      })
    );

    return NextResponse.json(postsWithCounts);
  } catch (err) {
    console.error("Erro ao listar posts:", err);
    return NextResponse.json(
      { error: "Não foi possível carregar os posts" },
      { status: 500 }
    );
  }
}
