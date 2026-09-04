import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** Tendências coletadas, candidatas primeiro — são as que viram conceito. */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_trends")
    .select("id, raw_title, source, category, opportunity_score, visual_hook, status, notes, captured_at")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .order("status")
    .order("opportunity_score", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trends: data ?? [] });
}
