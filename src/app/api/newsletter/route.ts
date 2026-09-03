import { NextResponse } from "next/server";
import { createListmonkClient } from "@/lib/server/listmonk";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { normalizeSignupEvent } from "@/lib/server/platform-events";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { verifyTurnstileToken } from "@/lib/server/turnstile";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestUrl = new URL(request.url);
  const turnstile = await verifyTurnstileToken({
    token: typeof body.turnstileToken === "string" ? body.turnstileToken : body["cf-turnstile-response"],
    expectedAction: "newsletter_signup",
    requestHostname: requestUrl.hostname,
    remoteIp: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!turnstile.ok) {
    return NextResponse.json({ ok: false, reason: "turnstile_failed" }, { status: 403 });
  }

  const payload = normalizeSignupEvent(body);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("newsletter_leads")
    .upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        email: payload.email,
        source: payload.source,
        status: "active",
      },
      // A migração multi-projeto trocou `unique (email)` por
      // `unique (project_id, email)`. Com o alvo antigo o PostgREST responde
      // 42P10 e nenhum lead é gravado.
      { onConflict: "project_id,email" },
    )
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await supabase.from("platform_events").insert({
    event_type: "newsletter_signup",
    payload,
  });

  const listmonk = await createListmonkClient().upsertSubscriber(payload);

  await supabase.from("listmonk_sync_logs").insert({
    lead_id: data?.id,
    action: "subscriber_upsert",
    status: listmonk.ok ? "synced" : listmonk.skipped ? "skipped" : "failed",
    payload: {
      source: payload.source,
      reason: listmonk.ok ? undefined : listmonk.reason,
      listmonk_id: listmonk.ok ? listmonk.id : undefined,
    },
  });

  return NextResponse.json({ ok: true, listmonk: { synced: listmonk.ok, skipped: "skipped" in listmonk && listmonk.skipped } });
}
