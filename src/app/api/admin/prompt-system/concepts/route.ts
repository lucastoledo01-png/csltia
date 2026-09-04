import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * Conceitos gerados, com o veredito do guardrail de PI.
 *
 * Os bloqueados vêm juntos de propósito: o motivo do bloqueio é o que permite
 * reformular, e esconder a reprovação faria o critério parecer arbitrário.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("prompt_concepts")
    .select("id, concept, hook, applications, visual_direction, ip_check, status, created_at, trend_id")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, concepts: data ?? [] });
}
