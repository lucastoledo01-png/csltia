import { NextResponse } from "next/server";
import { createAdminSessionCookie, signAdminSession, verifyAdminPassword } from "@/lib/server/admin-auth";

async function getPassword(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body.password === "string" ? body.password : undefined;
  }

  const form = await request.formData().catch(() => null);
  const password = form?.get("password");
  return typeof password === "string" ? password : undefined;
}

export async function POST(request: Request) {
  const password = await getPassword(request);

  if (!verifyAdminPassword(process.env.ADMIN_TEMP_PASSWORD, password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionSecret) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const token = signAdminSession(sessionSecret);
  const accept = request.headers.get("accept") ?? "";
  const response = accept.includes("text/html")
    ? NextResponse.redirect(new URL("/admin", request.url), { status: 303 })
    : NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", createAdminSessionCookie(token));

  return response;
}
