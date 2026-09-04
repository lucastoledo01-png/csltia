import { describe, expect, it } from "vitest";
import { checarPropriedadeIntelectual, INSTRUCAO_PI } from "./guardrail-pi";

/**
 * A linha que este guardrail protege é estreita: inspirar-se numa estética é
 * legítimo, reproduzir uma peça protegida não é, e dizer que o resultado é
 * oficial é pior que os dois — é afirmação falsa sobre a marca de outro.
 */

describe("o que passa", () => {
  it("aprova inspiração em características visuais gerais", () => {
    const v = checarPropriedadeIntelectual({
      conceito: "Retrato com paleta neon saturada e grão de filme dos anos 80",
      aplicacoes: ["pessoa comum", "casal", "pet"],
    });
    expect(v.aprovado).toBe(true);
    expect(v.motivos).toEqual([]);
  });

  it("aprova conceito sem referência a marca nenhuma", () => {
    expect(
      checarPropriedadeIntelectual({ conceito: "Sua rua virou cenário de cinema noir" }).aprovado,
    ).toBe(true);
  });
});

describe("o que é barrado", () => {
  it("reprova pedido de reprodução de peça protegida", () => {
    const v = checarPropriedadeIntelectual({
      conceito: "Coloque o logo do jogo no canto da imagem",
    });
    expect(v.aprovado).toBe(false);
    expect(v.correcoes.join(" ")).toMatch(/caracteristicas visuais gerais|características visuais gerais/i);
  });

  it("reprova key art e pôster oficial", () => {
    expect(checarPropriedadeIntelectual({ conceito: "recriar a key art do filme" }).aprovado).toBe(false);
    expect(checarPropriedadeIntelectual({ conceito: "no estilo do pôster oficial" }).aprovado).toBe(false);
  });

  it("reprova quando finge ser material oficial — o risco mais grave", () => {
    for (const texto of [
      "material oficial do lançamento",
      "vazamento da nova temporada",
      "em parceria com a marca",
      "arte licenciada",
    ]) {
      const v = checarPropriedadeIntelectual({ conceito: texto });
      expect(v.aprovado, texto).toBe(false);
      expect(v.correcoes.join(" ")).toMatch(/oficialidade|parceria|licen/i);
    }
  });

  it("acha o termo com acento ou sem", () => {
    expect(checarPropriedadeIntelectual({ conceito: "anuncio oficial" }).aprovado).toBe(false);
    expect(checarPropriedadeIntelectual({ conceito: "anúncio oficial" }).aprovado).toBe(false);
    expect(checarPropriedadeIntelectual({ conceito: "pôster oficial" }).aprovado).toBe(false);
  });

  it("acha o termo flexionado em gênero", () => {
    // O português flexiona e a variação natural de escrever é justamente a que
    // passaria batido: "licenciada", "autorizada", "patrocinada".
    for (const t of ["arte licenciada", "arte licenciado", "autorizada pela marca", "patrocinada pelo estúdio"]) {
      expect(checarPropriedadeIntelectual({ conceito: t }).aprovado, t).toBe(false);
    }
  });

  it("olha também as aplicações e a direção visual, não só o conceito", () => {
    // O texto problemático costuma estar na aplicação, não no conceito.
    expect(
      checarPropriedadeIntelectual({
        conceito: "Retrato estilizado",
        aplicacoes: ["com o logo da franquia ao fundo"],
      }).aprovado,
    ).toBe(false);

    expect(
      checarPropriedadeIntelectual({
        conceito: "Retrato estilizado",
        direcaoVisual: { elementos_recorrentes: "key art do jogo" },
      }).aprovado,
    ).toBe(false);
  });

  it("acumula os dois tipos de problema quando ocorrem juntos", () => {
    const v = checarPropriedadeIntelectual({
      conceito: "recriar o logo como material oficial",
    });
    expect(v.motivos).toHaveLength(2);
    expect(v.correcoes).toHaveLength(2);
  });
});

describe("instrução que vai no prompt", () => {
  it("diz o que pode e o que não pode, com exemplo dos dois lados", () => {
    // Instruir antes é mais barato que reprovar depois, e produz conceito melhor.
    expect(INSTRUCAO_PI).toMatch(/pode se inspirar/i);
    expect(INSTRUCAO_PI).toMatch(/NÃO pode/);
    expect(INSTRUCAO_PI).toMatch(/serve;/);
  });
});
