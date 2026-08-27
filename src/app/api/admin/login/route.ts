import { NextResponse } from "next/server";
import {
  createAdminSessionCookie,
  createAdminSessionPayload,
  signAdminSession,
  verifyAdminPassword,
} from "@/lib/server/admin-auth";
import { persistAdminSession } from "@/lib/server/admin-session";
import { MissingEnvError, getAdminPassword, getAdminSessionSecret } from "@/lib/server/env";

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
  const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  let configuredPassword: string;
  let sessionSecret: string;
  try {
    configuredPassword = getAdminPassword();
    sessionSecret = getAdminSessionSecret();
  } catch (err) {
    if (err instanceof MissingEnvError) {
      console.error("[ADMIN LOGIN] Configuração ausente:", err.message);
      return NextResponse.json(
        { ok: false, error: "Login indisponível por configuração incompleta." },
        { status: 500 },
      );
    }
    throw err;
  }

  const password = await getPassword(request);

  if (!verifyAdminPassword(configuredPassword, password)) {
    if (acceptsHtml) {
      return NextResponse.redirect(getTargetUrl("/admin?erro=senha", request), { status: 303 });
    }

    return NextResponse.json({ ok: false, error: "Senha incorreta" }, { status: 401 });
  }

  const payload = createAdminSessionPayload();

  // Sem o registro no banco a sessão não teria como ser revogada depois, então
  // o login falha em vez de emitir um cookie que ninguém consegue encerrar.
  const persisted = await persistAdminSession(payload);
  if (!persisted) {
    if (acceptsHtml) {
      return NextResponse.redirect(getTargetUrl("/admin?erro=sessao", request), { status: 303 });
    }

    return NextResponse.json(
      { ok: false, error: "Não foi possível abrir a sessão. Tente novamente." },
      { status: 503 },
    );
  }

  const token = signAdminSession(sessionSecret, payload);
  const response = acceptsHtml
    ? NextResponse.redirect(getTargetUrl("/admin", request), { status: 303 })
    : NextResponse.json({ ok: true });

  response.headers.set("Set-Cookie", createAdminSessionCookie(token));

  return response;
}
