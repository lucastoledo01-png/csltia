import { NextResponse } from "next/server";
import { normalizePageview } from "@/lib/server/platform-events";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  const payload = normalizePageview(await request.json().catch(() => ({})));
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("pageviews").insert({
    path: payload.path,
    referrer: payload.referrer,
    user_agent: request.headers.get("user-agent"),
  });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
