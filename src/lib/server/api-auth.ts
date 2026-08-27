import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "./admin-auth";
import { isAdminSessionActive } from "./admin-session";
import { MissingEnvError, getAdminSessionSecret, getCronSecret } from "./env";

/**
 * Autorização das rotas administrativas e automáticas.
 *
 * Duas regras que valem para tudo aqui:
 *
 * 1. Nega por padrão, em qualquer ambiente. A checagem antiga só bloqueava
 *    quando NODE_ENV era exatamente "production", o que deixava preview e
 *    staging abertos — falando com o banco e as contas de produção.
 * 2. Segredo ausente responde 500, não 200. Configuração incompleta é falha
 *    de operação e precisa aparecer, não virar liberação silenciosa.
 */

function unauthorized() {
  return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

function misconfigured(err: MissingEnvError) {
  console.error("[AUTH] Configuração ausente:", err.message);
  return NextResponse.json(
    { error: "Serviço indisponível por configuração incompleta." },
    { status: 500 },
  );
}

function bearerMatches(authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authHeader.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Libera quem apresenta um cookie de sessão assinado, dentro do prazo e ainda
 * ativo no banco. Devolve `null` quando autorizado.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  let sessionSecret: string;
  try {
    sessionSecret = getAdminSessionSecret();
  } catch (err) {
    if (err instanceof MissingEnvError) return misconfigured(err);
    throw err;
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const payload = verifyAdminSessionToken(sessionSecret, token);
  if (!payload) return unauthorized();

  const active = await isAdminSessionActive(payload.sessionId);
  if (!active) return unauthorized();

  return null;
}

/**
 * Libera o disparo automático da redação. Só aceita o segredo no cabeçalho
 * Authorization — nunca na query string, que vaza em log de acesso, histórico
 * de navegador e cabeçalho Referer.
 */
export function requireCron(req: NextRequest): NextResponse | null {
  let cronSecret: string;
  try {
    cronSecret = getCronSecret();
  } catch (err) {
    if (err instanceof MissingEnvError) return misconfigured(err);
    throw err;
  }

  if (!bearerMatches(req.headers.get("authorization"), cronSecret)) {
    return unauthorized();
  }

  return null;
}

/** Aceita tanto a sessão de admin no navegador quanto o segredo do agendador. */
export async function requireAdminOrCron(req: NextRequest): Promise<NextResponse | null> {
  if (requireCron(req) === null) return null;
  return requireAdmin(req);
}
