import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdminClient();

    // 1. Buscar histórico de execuções da Redação (Newsletter & Portal)
    const { data: newsroomRuns, error: newsroomErr } = await supabase
      .from("newsroom_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    // 2. Buscar histórico de postagens e carrosséis do Instagram
    const { data: socialPosts, error: socialErr } = await supabase
      .from("social_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      ok: true,
      newsroomRuns: newsroomRuns || [],
      socialPosts: socialPosts || [],
      newsroomError: newsroomErr ? newsroomErr.message : null,
      socialError: socialErr ? socialErr.message : null,
    });
  } catch (err) {
    console.error("[PIPELINE LOGS ERROR]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
