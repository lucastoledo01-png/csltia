import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Portão da entrega (etapa 12).
 *
 * Depois de se cadastrar, a pessoa recebe um cookie assinado que libera o
 * material daquela campanha. Mesma abordagem do `admin-auth.ts`, com duas
 * diferenças que vêm do que está sendo protegido:
 *
 * 1. **O cookie vale para uma keyword só.** A keyword faz parte do payload
 *    assinado, então um cookie de `GTA26` não abre o material de `VICE26`.
 *    Sem isso, um cadastro daria acesso a tudo que fosse publicado depois.
 * 2. **Não há registro no banco.** O acesso ao material não precisa de
 *    revogação individual — quem se cadastrou pode voltar. Um lead legítimo
 *    perdendo acesso porque o servidor não respondeu seria pior que o risco.
 *
 * O prazo é longo de propósito: a pessoa costuma abrir o Direct, salvar para
 * depois e voltar dias depois.
 */

export const MATERIAL_COOKIE_PREFIX = "csl_mat_";
export const MATERIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Um cookie por campanha: o nome carrega a keyword, o valor a assina. */
export function materialCookieName(keyword: string): string {
  return `${MATERIAL_COOKIE_PREFIX}${keyword.toLowerCase()}`;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signMaterialAccess(
  secret: string,
  keyword: string,
  now = Date.now(),
  ttlMs = MATERIAL_TTL_MS,
): string {
  const body = `${keyword}.${now + ttlMs}`;
  return `${body}.${sign(secret, body)}`;
}

/**
 * Libera só quando a assinatura confere, o prazo não venceu **e** a keyword do
 * token é a da página pedida. O `Max-Age` do cookie é sugestão ao navegador e
 * não protege nada — a validade é conferida aqui.
 */
export function verifyMaterialAccess(
  secret: string | undefined,
  token: string | undefined,
  keyword: string,
  now = Date.now(),
): boolean {
  if (!secret || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [tokenKeyword, expiresAtRaw, signature] = parts;
  if (!tokenKeyword || !expiresAtRaw || !signature) return false;

  // Comparação da keyword antes da assinatura: um token válido de outra
  // campanha não pode abrir esta.
  if (tokenKeyword !== keyword) return false;

  const expected = Buffer.from(sign(secret, `${tokenKeyword}.${expiresAtRaw}`));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  if (!timingSafeEqual(expected, provided)) return false;

  const expiresAt = Number(expiresAtRaw);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function materialCookie(
  keyword: string,
  token: string,
  options: { secure?: boolean } = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";

  return [
    `${materialCookieName(keyword)}=${token}`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    "Path=/ultraprompts",
    `Max-Age=${Math.floor(MATERIAL_TTL_MS / 1000)}`,
  ]
    .filter(Boolean)
    .join("; ");
}
