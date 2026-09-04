import { describe, expect, it } from "vitest";
import { DEFAULT_TOKENS, TokensSchema, mergeTokens, tokensToCss } from "./tokens";

describe("carousel tokens", () => {
  it("tokensToCss gera todas as variáveis --s-*", () => {
    const css = tokensToCss(DEFAULT_TOKENS);
    for (const name of [
      "--s-bg",
      "--s-ivory",
      "--s-ink",
      "--s-stone",
      "--s-accent",
      "--s-dark",
      "--s-border",
      "--s-display-lg",
      "--s-display-md",
      "--s-body",
      "--s-mono",
      "--s-radius",
      "--s-card-pad",
      "--s-eb-noticia-bg",
      "--s-eb-tutorial-fg",
      "--s-eb-prompt-bg",
    ]) {
      expect(css).toContain(name);
    }
  });

  it("mergeTokens sobrescreve só o que veio e mantém o resto do default", () => {
    const merged = mergeTokens({ colors: { accent: "#000000" }, radius: 4 });
    expect(merged.colors.accent).toBe("#000000");
    expect(merged.colors.bg).toBe(DEFAULT_TOKENS.colors.bg);
    expect(merged.radius).toBe(4);
    expect(merged.eyebrows.tutorial.label).toBe(DEFAULT_TOKENS.eyebrows.tutorial.label);
  });

  it("cascata de três camadas: o formato vence o tema sem apagar o resto dele", () => {
    // O caso real: tema global escuro, e o formato `tutorial` claro. Se a
    // terceira camada substituísse o bloco `colors` em vez de mesclar, o
    // formato herdaria as cores do default do repo e não as do tema — e o
    // painel mostraria um resultado que a produção não renderiza.
    const tema = { colors: { bg: "#080808", accent: "#FF5C00" } };
    const doFormato = { colors: { bg: "#F5F1ED" } };

    const efetivo = mergeTokens(tema, doFormato);

    expect(efetivo.colors.bg).toBe("#F5F1ED"); // o formato manda
    expect(efetivo.colors.accent).toBe("#FF5C00"); // o tema sobrevive
    expect(efetivo.colors.ink).toBe(DEFAULT_TOKENS.colors.ink); // o default preenche o resto
  });

  it("mergeTokens cai no default quando o override é inválido", () => {
    const merged = mergeTokens({ colors: { accent: "não-é-cor" } });
    expect(merged).toEqual(DEFAULT_TOKENS);
  });

  it("TokensSchema rejeita cor hex inválida", () => {
    const bad = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, ink: "azul" } };
    expect(TokensSchema.safeParse(bad).success).toBe(false);
  });
});
