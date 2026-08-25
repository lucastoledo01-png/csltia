import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/server/admin-auth";
import { runInstagramCarouselService } from "@/lib/server/social/instagram/instagram-service";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("casaloti_admin")?.value;
  const adminSecret = process.env.ADMIN_SECRET || "casaloti_admin_secret_key";
  const authHeader = req.headers.get("Authorization");
  const isSecretMatch = authHeader === `Bearer ${adminSecret}` || authHeader === `Bearer ${process.env.INTERNAL_API_SECRET || "internal_secret"}`;
  const isAuthenticated = verifyAdminSessionToken(adminSecret, adminCookie) || isSecretMatch;

  if (!isAuthenticated && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runInstagramCarouselService({
      dryRun: body.dryRun,
      autoPost: body.autoPost,
      editionDateStr: body.editionDateStr,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API INSTAGRAM GENERATE ERROR]", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
