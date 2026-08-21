import { createHmac, timingSafeEqual } from "node:crypto";

function cleanValue(val: string | undefined): string {
  if (!val) return "";
  let clean = val.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

export function verifyAdminPassword(configuredPassword: string | undefined, candidatePassword: string | undefined) {
  const cleanConfigured = cleanValue(configuredPassword);
  const cleanCandidate = cleanValue(candidatePassword);

  if (!cleanConfigured || !cleanCandidate) {
    return false;
  }

  const configured = Buffer.from(cleanConfigured);
  const candidate = Buffer.from(cleanCandidate);

  if (configured.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(configured, candidate);
}

export function signAdminSession(secret: string, issuedAt = Date.now()) {
  const payload = String(issuedAt);
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(secret: string | undefined, token: string | undefined) {
  if (!secret || !token || !token.includes(".")) {
    return false;
  }

  const [issuedAt] = token.split(".");
  const expected = signAdminSession(secret, Number(issuedAt));
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  if (expectedBuffer.length !== tokenBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, tokenBuffer);
}

export function createAdminSessionCookie(token: string, options: { secure?: boolean } = {}) {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  return [`casaloti_admin=${token}`, "HttpOnly", secure ? "Secure" : "", "SameSite=Lax", "Path=/", "Max-Age=28800"].filter(Boolean).join("; ");
}
