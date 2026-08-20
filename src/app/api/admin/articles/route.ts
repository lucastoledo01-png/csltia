import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/admin-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("casaloti_admin="))
    ?.replace("casaloti_admin=", "");

  if (!verifyAdminSessionToken(process.env.ADMIN_SESSION_SECRET, cookie)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("articles")
    .select("id, slug, title, status, published_at, view_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: data ?? [] });
}
