import { NextResponse } from "next/server";
import { createAdminSessionCookie, signAdminSession, verifyAdminPassword } from "@/lib/server/admin-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!verifyAdminPassword(process.env.ADMIN_TEMP_PASSWORD, password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionSecret) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const token = signAdminSession(sessionSecret);
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", createAdminSessionCookie(token));

  return response;
}
