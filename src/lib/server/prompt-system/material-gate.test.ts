import { describe, expect, it } from "vitest";
import {
  MATERIAL_TTL_MS,
  materialCookie,
  materialCookieName,
  signMaterialAccess,
  verifyMaterialAccess,
} from "./material-gate";

const SEGREDO = "segredo-de-teste-longo-o-suficiente";
const AGORA = 1_770_000_000_000;

describe("acesso ao material", () => {
  it("libera quem tem o token assinado da própria campanha", () => {
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    expect(verifyMaterialAccess(SEGREDO, token, "GTA26", AGORA + 1000)).toBe(true);
  });

  it("um cookie de uma campanha NÃO abre o material de outra", () => {
    // É o ponto do portão: sem isso, um cadastro daria acesso a tudo que
    // fosse publicado depois.
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    expect(verifyMaterialAccess(SEGREDO, token, "VICE26", AGORA + 1000)).toBe(false);
  });

  it("recusa depois do prazo", () => {
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    expect(verifyMaterialAccess(SEGREDO, token, "GTA26", AGORA + MATERIAL_TTL_MS + 1)).toBe(false);
  });

  it("recusa assinatura adulterada", () => {
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    const partes = token.split(".");
    const adulterado = `${partes[0]}.${partes[1]}.${"x".repeat(partes[2].length)}`;
    expect(verifyMaterialAccess(SEGREDO, adulterado, "GTA26", AGORA + 1000)).toBe(false);
  });

  it("recusa prazo esticado à mão", () => {
    // Trocar só a data invalida a assinatura, que cobre data e keyword.
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    const partes = token.split(".");
    const esticado = `${partes[0]}.${AGORA + MATERIAL_TTL_MS * 10}.${partes[2]}`;
    expect(verifyMaterialAccess(SEGREDO, esticado, "GTA26", AGORA + 1000)).toBe(false);
  });

  it("recusa token de outro segredo", () => {
    const token = signMaterialAccess("outro-segredo-qualquer", "GTA26", AGORA);
    expect(verifyMaterialAccess(SEGREDO, token, "GTA26", AGORA + 1000)).toBe(false);
  });

  it("fecha quando falta segredo ou token", () => {
    const token = signMaterialAccess(SEGREDO, "GTA26", AGORA);
    expect(verifyMaterialAccess(undefined, token, "GTA26", AGORA)).toBe(false);
    expect(verifyMaterialAccess(SEGREDO, undefined, "GTA26", AGORA)).toBe(false);
    expect(verifyMaterialAccess(SEGREDO, "lixo", "GTA26", AGORA)).toBe(false);
    expect(verifyMaterialAccess(SEGREDO, "a.b.c.d", "GTA26", AGORA)).toBe(false);
  });
});

describe("cookie", () => {
  it("tem um nome por campanha", () => {
    expect(materialCookieName("GTA26")).not.toBe(materialCookieName("VICE26"));
  });

  it("é HttpOnly, SameSite e limitado ao caminho da entrega", () => {
    const cookie = materialCookie("GTA26", "tok", { secure: true });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    // Escopo estreito: o cookie não acompanha requisições do resto do site.
    expect(cookie).toContain("Path=/ultraprompts");
  });
});
