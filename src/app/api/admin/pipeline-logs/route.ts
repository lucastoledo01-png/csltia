import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/admin-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("casaloti_admin")?.value;
  const adminSecret = process.env.ADMIN_SECRET || "casaloti_admin_secret_key";
  const authHeader = req.headers.get("Authorization");
  const isSecretMatch = authHeader === `Bearer ${adminSecret}` || authHeader === `Bearer ${process.env.INTERNAL_API_SECRET || "internal_secret"}`;
  const isAuthenticated = verifyAdminSessionToken(adminSecret, adminCookie) || isSecretMatch;

  if (!isAuthenticated && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

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
  } catch (err: any) {
    console.error("[PIPELINE LOGS ERROR]", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
