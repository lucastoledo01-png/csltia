import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_news_sources")
    .select("*")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .order("priority")
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sources: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { source_key, name, company_name, type, url, priority, category, region, keywords } = body;

  if (!source_key || !name || !type || !url) {
    return NextResponse.json(
      { ok: false, error: "source_key, name, type e url são obrigatórios." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_news_sources")
    .insert({
      project_id: DEFAULT_PROJECT_ID,
      source_key,
      name,
      company_name: company_name || null,
      type,
      url,
      priority: priority || 2,
      category: category || "general_ai",
      region: region || "global",
      keywords: Array.isArray(keywords) ? keywords : [],
      enabled: true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: data });
}
