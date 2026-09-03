import { describe, expect, it } from "vitest";
import {
  KEYWORD_MAX_LENGTH,
  KEYWORD_PATTERN,
  normalizeKeyword,
  validateKeyword,
} from "./keyword";

describe("normalização da keyword", () => {
  it("tira acento, espaço e símbolo e sobe para maiúscula", () => {
    // O worker do OpenReply casa o comentário por texto. Qualquer um destes
    // sobrevivendo vira um post cujo CTA não dispara Direct nenhum.
    expect(normalizeKeyword("gta 26")).toBe("GTA26");
    expect(normalizeKeyword("Ação!")).toBe("ACAO");
    expect(normalizeKeyword("foto-87")).toBe("FOTO87");
    expect(normalizeKeyword("  vice26  ")).toBe("VICE26");
    expect(normalizeKeyword("coração")).toBe("CORACAO");
  });

  it("preserva o que já está canônico", () => {
    expect(normalizeKeyword("PIXEL31")).toBe("PIXEL31");
  });

  it("devolve string vazia quando não sobra nada aproveitável", () => {
    expect(normalizeKeyword("!!! ###")).toBe("");
  });
});

describe("validação da keyword", () => {
  it("aceita e devolve a forma canônica", () => {
    expect(validateKeyword("gta 26")).toEqual({ ok: true, keyword: "GTA26" });
  });

  it("recusa o que fica curto demais depois da limpeza", () => {
    const resultado = validateKeyword("a!");
    expect(resultado.ok).toBe(false);
  });

  it("recusa acima do limite", () => {
    const resultado = validateKeyword("A".repeat(KEYWORD_MAX_LENGTH + 1));
    expect(resultado.ok).toBe(false);
  });

  it("aceita exatamente nos limites", () => {
    expect(validateKeyword("ABC").ok).toBe(true);
    expect(validateKeyword("A".repeat(KEYWORD_MAX_LENGTH)).ok).toBe(true);
  });

  it("recusa entrada que não é texto", () => {
    expect(validateKeyword(undefined).ok).toBe(false);
    expect(validateKeyword("").ok).toBe(false);
    expect(validateKeyword(42).ok).toBe(false);
  });
});

describe("contrato com o banco", () => {
  it("o padrão é o mesmo do CHECK de prompt_campaigns.keyword", () => {
    // Se este teste falhar, a migração e o código discordam sobre o que é uma
    // keyword válida — e o erro só aparece como violação de CHECK em produção.
    expect(KEYWORD_PATTERN.source).toBe("^[A-Z0-9]{3,20}$");
  });

  it("toda keyword aprovada passa no padrão do banco", () => {
    for (const entrada of ["gta 26", "Ação total", "pixel-31", "FOTO87", "abc"]) {
      const resultado = validateKeyword(entrada);
      if (resultado.ok) expect(KEYWORD_PATTERN.test(resultado.keyword)).toBe(true);
    }
  });
});
