import { describe, expect, it } from "vitest";
import { textoDoErro } from "./texto-do-erro";

/*
 * O texto do erro tem de levar a parte que diz o que aconteceu: o `details` e
 * o `code` do PostgREST, a causa do `fetch failed`. Em 06/10/2026 só o
 * `message` existia, e nem ele foi gravado.
 */
describe("textoDoErro", () => {
  it("erro do PostgREST leva code, details e hint", () => {
    const t = textoDoErro({
      message: "duplicate key value violates unique constraint",
      code: "23505",
      details: "Key (project_id, url)=(p, u) already exists.",
      hint: "",
    });
    expect(t).toContain("duplicate key");
    expect(t).toContain("code: 23505");
    expect(t).toContain("details: Key (project_id, url)");
    expect(t).not.toContain("hint:");
  });

  it("fetch failed leva a causa", () => {
    const t = textoDoErro(new TypeError("fetch failed", { cause: new Error("Connect Timeout Error") }));
    expect(t).toBe("fetch failed causa: Connect Timeout Error");
  });

  it("corta o que passa do limite", () => {
    expect(textoDoErro(new Error("x".repeat(2000)), 100)).toHaveLength(100);
  });

  it("valor que não é erro vira texto", () => {
    expect(textoDoErro("banco fora")).toBe("banco fora");
    expect(textoDoErro(null)).toBe("erro sem texto");
  });
});
