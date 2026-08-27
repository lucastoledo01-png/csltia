import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createExpiredAdminSessionCookie,
  verifyAdminSessionToken,
} from "@/lib/server/admin-auth";
import { revokeAdminSession } from "@/lib/server/admin-session";
import { optionalEnv } from "@/lib/server/env";

/**
 * Encerra a sessão de verdade: revoga o registro no banco e limpa o cookie.
 * Apagar só o cookie deixaria o token continuar válido se alguém o tivesse
 * copiado.
 */
export async function POST(req: NextRequest) {
  const sessionSecret = optionalEnv("ADMIN_SESSION_SECRET");
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const payload = verifyAdminSessionToken(sessionSecret, token);

  if (payload) {
    await revokeAdminSession(payload.sessionId);
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", createExpiredAdminSessionCookie());

  return response;
}
