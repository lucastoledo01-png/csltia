import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_MS,
  createAdminSessionCookie,
  createAdminSessionPayload,
  createExpiredAdminSessionCookie,
  signAdminSession,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "./admin-auth";

describe("admin auth", () => {
  it("aceita apenas a senha configurada", () => {
    expect(verifyAdminPassword("abc123", "abc123")).toBe(true);
    expect(verifyAdminPassword("abc123", "errada")).toBe(false);
    expect(verifyAdminPassword(undefined, "abc123")).toBe(false);
    expect(verifyAdminPassword("abc123", undefined)).toBe(false);
  });

  it("não aceita as senhas que antes estavam fixas no código", () => {
    for (const antiga of ["*4lur4F3lix$", "desbuguei2026", "desbugueiai"]) {
      expect(verifyAdminPassword("senha-real-configurada", antiga)).toBe(false);
    }
  });

  it("ignora aspas e escapes herdados do arquivo .env", () => {
    expect(verifyAdminPassword('"minha$senha"', "minha$senha")).toBe(true);
    expect(verifyAdminPassword("minha\\$senha", "minha$senha")).toBe(true);
  });

  it("gera cookie httpOnly para sessao do admin", () => {
    const cookie = createAdminSessionCookie("token-assinado", { secure: false });

    expect(cookie).toContain("casaloti_admin=token-assinado");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("gera cookie de expiração imediata no logout", () => {
    const cookie = createExpiredAdminSessionCookie({ secure: false });

    expect(cookie).toContain("casaloti_admin=;");
    expect(cookie).toContain("Max-Age=0");
  });

  it("verifica token assinado antes de liberar admin", () => {
    const payload = createAdminSessionPayload();
    const token = signAdminSession("segredo", payload);

    expect(verifyAdminSessionToken("segredo", token)?.sessionId).toBe(payload.sessionId);
    expect(verifyAdminSessionToken("outro", token)).toBeNull();
    expect(verifyAdminSessionToken("segredo", undefined)).toBeNull();
    expect(verifyAdminSessionToken("segredo", "nao-e-um-token")).toBeNull();
  });

  it("recusa token cuja validade já venceu", () => {
    const emitidoEm = Date.now() - ADMIN_SESSION_TTL_MS - 1000;
    const payload = createAdminSessionPayload(emitidoEm);
    const token = signAdminSession("segredo", payload);

    expect(verifyAdminSessionToken("segredo", token)).toBeNull();
  });

  it("recusa token com prazo adulterado, porque o prazo é assinado", () => {
    const payload = createAdminSessionPayload();
    const token = signAdminSession("segredo", payload);
    const [sessionId, , signature] = token.split(".");

    const esticado = `${sessionId}.${Date.now() + 10 * ADMIN_SESSION_TTL_MS}.${signature}`;

    expect(verifyAdminSessionToken("segredo", esticado)).toBeNull();
  });
});
