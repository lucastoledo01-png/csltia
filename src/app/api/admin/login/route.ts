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

function getTargetUrl(path: string, request: Request): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const host = (forwardedHost ?? hostHeader ?? "").split(",")[0].trim();

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ?? "").split(",")[0].trim() || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");

  if (host && !host.startsWith("0.0.0.0")) {
    return new URL(path, `${proto}://${host}`);
  }

  const origin = request.headers.get("origin");
  if (origin && !origin.includes("0.0.0.0")) {
    return new URL(path, origin);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (!refUrl.host.startsWith("0.0.0.0")) {
        return new URL(path, refUrl.origin);
      }
    } catch {
      // ignora falha de parse
    }
  }

  return new URL(path, request.url);
}

export async function POST(request: Request) {
  const password = await getPassword(request);
  const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  if (!verifyAdminPassword(process.env.ADMIN_TEMP_PASSWORD, password)) {
    if (acceptsHtml) {
      return NextResponse.redirect(getTargetUrl("/admin?erro=senha", request), { status: 303 });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionSecret) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const token = signAdminSession(sessionSecret);
  const response = acceptsHtml
    ? NextResponse.redirect(getTargetUrl("/admin", request), { status: 303 })
    : NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", createAdminSessionCookie(token));

  return response;
}

