import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { runInstagramCarouselService } from "@/lib/server/social/instagram/instagram-service";

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runInstagramCarouselService({
      dryRun: body.dryRun,
      autoPost: body.autoPost,
      editionDateStr: body.editionDateStr,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API INSTAGRAM GENERATE ERROR]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
