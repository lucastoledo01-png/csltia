import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "casaloti_admin";

/** Duração padrão de uma sessão de admin. */
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type AdminSessionPayload = {
  sessionId: string;
  expiresAt: number;
};

/**
 * Arquivos .env costumam preservar aspas e barras de escape do shell. A
 * normalização é aplicada aos dois lados da comparação para que a senha
 * digitada confira com a configurada mesmo nesses casos.
 */
function normalizePassword(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  let clean = value.trim();
  if (
    clean.length >= 2 &&
    ((clean.startsWith('"') && clean.endsWith('"')) ||
      (clean.startsWith("'") && clean.endsWith("'")))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  clean = clean.replace(/\\([$*#&])/g, "$1");

  return clean.length > 0 ? clean : undefined;
}

/**
 * Compara pelo resumo SHA-256 em vez das strings cruas: os resumos têm sempre
 * o mesmo tamanho, então a comparação não vaza o comprimento da senha.
 */
function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a, "utf8").digest(),
    createHash("sha256").update(b, "utf8").digest(),
  );
}

export function verifyAdminPassword(
  configuredPassword: string | undefined,
  candidatePassword: string | undefined,
): boolean {
  const configured = normalizePassword(configuredPassword);
  const candidate = normalizePassword(candidatePassword);

  if (!configured || !candidate) return false;

  return secretsMatch(configured, candidate);
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionPayload(
  now = Date.now(),
  ttlMs = ADMIN_SESSION_TTL_MS,
): AdminSessionPayload {
  return { sessionId: randomUUID(), expiresAt: now + ttlMs };
}

export function signAdminSession(secret: string, payload: AdminSessionPayload): string {
  const body = `${payload.sessionId}.${payload.expiresAt}`;
  return `${body}.${sign(secret, body)}`;
}

/**
 * Devolve o conteúdo do token apenas se a assinatura confere E o prazo ainda
 * não venceu. A validade é conferida aqui no servidor — o Max-Age do cookie é
 * só uma sugestão ao navegador e não protege nada.
 *
 * Um token válido ainda pode ter sido revogado; quem chama precisa confirmar
 * a sessão no banco antes de liberar acesso.
 */
export function verifyAdminSessionToken(
  secret: string | undefined,
  token: string | undefined,
  now = Date.now(),
): AdminSessionPayload | null {
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [sessionId, expiresAtRaw, signature] = parts;
  if (!sessionId || !expiresAtRaw || !signature) return null;

  const expected = sign(secret, `${sessionId}.${expiresAtRaw}`);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return { sessionId, expiresAt };
}

export function createAdminSessionCookie(token: string, options: { secure?: boolean; maxAgeSeconds?: number } = {}) {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const maxAge = options.maxAgeSeconds ?? Math.floor(ADMIN_SESSION_TTL_MS / 1000);

  return [
    `${ADMIN_COOKIE_NAME}=${token}`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function createExpiredAdminSessionCookie(options: { secure?: boolean } = {}) {
  const secure = options.secure ?? process.env.NODE_ENV === "production";

  return [
    `${ADMIN_COOKIE_NAME}=`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
