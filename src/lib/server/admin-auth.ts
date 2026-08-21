import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyAdminPassword(configuredPassword: string | undefined, candidatePassword: string | undefined) {
  if (!configuredPassword || !candidatePassword) {
    return false;
  }

  const configured = Buffer.from(configuredPassword);
  const candidate = Buffer.from(candidatePassword);

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
