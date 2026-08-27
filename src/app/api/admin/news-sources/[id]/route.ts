import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, company_name, type, url, enabled, priority, category, region, keywords } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (company_name !== undefined) updates.company_name = company_name || null;
  if (type !== undefined) updates.type = type;
  if (url !== undefined) updates.url = url;
  if (enabled !== undefined) updates.enabled = enabled;
  if (priority !== undefined) updates.priority = priority;
  if (category !== undefined) updates.category = category;
  if (region !== undefined) updates.region = region;
  if (keywords !== undefined) updates.keywords = Array.isArray(keywords) ? keywords : [];

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_news_sources")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("project_news_sources").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
