import { NextResponse } from "next/server";
import { normalizeSignupEvent } from "@/lib/server/platform-events";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  const payload = normalizeSignupEvent(await request.json().catch(() => ({})));
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("newsletter_leads").upsert(
    {
      email: payload.email,
      source: payload.source,
      status: "active",
    },
    { onConflict: "email" },
  );

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await supabase.from("platform_events").insert({
    event_type: "newsletter_signup",
    payload,
  });

  return NextResponse.json({ ok: true });
}
