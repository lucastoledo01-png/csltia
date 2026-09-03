import { describe, expect, it } from "vitest";
import { FONTS, FONT_KEYS, fontLinkTag, isFontKey } from "./fonts";
import { DEFAULT_TOKENS, mergeTokens } from "./tokens";

/**
 * O bug que estes testes existem para impedir: o CSS declara uma família que o
 * `<link>` não requisita. O navegador cai no fallback do sistema e o slide sai
 * com outra fonte — sem erro, sem log. Foi o que aconteceu no design de origem
 * com a `Bespoke Serif`, que o Google Fonts não serve.
 */

describe("conjunto fechado de fontes", () => {
  it("toda fonte declara a família e a especificação que a carrega", () => {
    for (const chave of FONT_KEYS) {
      const spec = FONTS[chave];
      const familia = spec.stack.split(",")[0].replace(/"/g, "");

      expect(familia.length).toBeGreaterThan(0);
      // A família da `stack` precisa ser a mesma pedida ao Google Fonts —
      // senão o link carrega uma coisa e o CSS pede outra.
      expect(spec.googleFamily.replace(/\+/g, " ")).toContain(familia);
    }
  });

  it("toda stack tem fallback da mesma classe", () => {
    // Sem fallback, um container sem a fonte instalada e sem rede renderiza
    // com o padrão do navegador, que pode ser de outra classe.
    for (const chave of FONT_KEYS) {
      expect(FONTS[chave].stack.split(",").length).toBeGreaterThan(1);
    }
  });

  it("reconhece chave válida e recusa o resto", () => {
    expect(isFontKey("epilogue")).toBe(true);
    expect(isFontKey("Bespoke Serif")).toBe(false);
    expect(isFontKey(undefined)).toBe(false);
  });
});

describe("link de fontes", () => {
  it("requisita exatamente as fontes pedidas", () => {
    const link = fontLinkTag(["epilogue", "playfair"]);

    expect(link).toContain("Epilogue");
    expect(link).toContain("Playfair+Display");
    expect(link).not.toContain("JetBrains");
  });

  it("não repete família quando a mesma chave aparece duas vezes", () => {
    const link = fontLinkTag(["epilogue", "epilogue", "epilogue"]);
    expect(link.match(/family=Epilogue/g)).toHaveLength(1);
  });

  it("é estável na ordem — o HTML de um slide não muda entre renderizações", () => {
    expect(fontLinkTag(["playfair", "epilogue"])).toBe(fontLinkTag(["epilogue", "playfair"]));
  });
});

describe("tokens em camadas", () => {
  it("o override do formato vence o tema global", () => {
    const tokens = mergeTokens(
      { colors: { bg: "#111111" } },
      { colors: { bg: "#F5F1ED" } },
    );
    expect(tokens.colors.bg).toBe("#F5F1ED");
  });

  it("camada que não declara a chave não apaga a de baixo", () => {
    // É o que permite `tutorial` trocar só o fundo e herdar o resto.
    const tokens = mergeTokens({ colors: { bg: "#111111", ink: "#eeeeee" } }, { colors: { bg: "#F5F1ED" } });
    expect(tokens.colors.bg).toBe("#F5F1ED");
    expect(tokens.colors.ink).toBe("#eeeeee");
  });

  it("sem camada nenhuma devolve o default", () => {
    expect(mergeTokens()).toEqual(DEFAULT_TOKENS);
  });

  it("camada inválida não derruba a montagem", () => {
    // Carrossel não deixa de ser gerado por causa de config de design.
    expect(mergeTokens({ colors: { bg: "não é cor" } })).toEqual(DEFAULT_TOKENS);
    expect(mergeTokens({ fonts: { display: "Bespoke Serif" } })).toEqual(DEFAULT_TOKENS);
  });

  it("a arte padrão é 1080×1440, a proporção dos designs aprovados", () => {
    expect(DEFAULT_TOKENS.canvas).toEqual({ width: 1080, height: 1440 });
  });
});
