import { describe, expect, it } from "vitest";
import { createAdminSessionCookie, signAdminSession, verifyAdminPassword, verifyAdminSessionToken } from "./admin-auth";

describe("admin auth", () => {
  it("aceita apenas a senha temporaria configurada", () => {
    expect(verifyAdminPassword("abc123", "abc123")).toBe(true);
    expect(verifyAdminPassword("abc123", "errada")).toBe(false);
    expect(verifyAdminPassword(undefined, "abc123")).toBe(false);
  });

  it("gera cookie httpOnly para sessao temporaria e APIs admin", () => {
    const cookie = createAdminSessionCookie("token-assinado", { secure: false });

    expect(cookie).toContain("casaloti_admin=token-assinado");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("verifica token assinado antes de liberar admin", () => {
    const token = signAdminSession("segredo", 123);

    expect(verifyAdminSessionToken("segredo", token)).toBe(true);
    expect(verifyAdminSessionToken("outro", token)).toBe(false);
  });
});
