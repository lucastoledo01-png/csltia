import { describe, expect, it } from "vitest";
import { BANDEIRAS, ehUltimoRecurso, escolherBandeira } from "./bandeira";

/**
 * Nenhuma peça fica sem foto.
 *
 * Regra do dono, de 17/09/2026, depois de um post sair como peça de texto
 * puro numa pauta sobre ações judiciais, que é o tipo de assunto sem rosto,
 * sem lugar e sem marca.
 *
 * A saída não é afrouxar a régua da foto da pauta, é ter um último recurso com
 * IDENTIDADE: bandeira americana em fachada, em janela, na rua, em Wall
 * Street. Ela não finge ser da pauta; diz "Estados Unidos", que é o assunto de
 * toda edição desta publicação.
 */

describe("o acervo da bandeira", () => {
  it("tem imagem suficiente para alternar", () => {
    expect(BANDEIRAS.length).toBeGreaterThanOrEqual(4);
  });

  it("toda imagem carrega licença, autor e link para o crédito", () => {
    for (const b of BANDEIRAS) {
      expect(b.asset.license, b.id).toBeTruthy();
      expect(b.asset.author, b.id).toBeTruthy();
      expect(b.asset.attribution, b.id).toContain(b.asset.license);
      expect(b.asset.sourcePageUrl, b.id).toContain("commons.wikimedia.org");
      expect(b.asset.imageUrl, b.id).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    }
  });

  it("toda imagem tem resolução de capa", () => {
    for (const b of BANDEIRAS) {
      expect(b.asset.width, b.id).toBeGreaterThanOrEqual(2000);
      expect(b.asset.height, b.id).toBeGreaterThanOrEqual(1500);
    }
  });

  /**
   * `place`, e não `conceptual`, e a diferença tem consequência: a bolha da
   * capa recusa imagem conceitual. A bandeira entra como fundo, nunca como o
   * círculo, que é onde a peça promete identidade do assunto.
   */
  it("não se apresenta como imagem conceitual", () => {
    for (const b of BANDEIRAS) {
      expect(b.asset.imageContextType, b.id).not.toBe("conceptual");
      expect(b.asset.source, b.id).toBe("wikimedia_commons");
    }
  });

  it("fica marcada como último recurso, para o relatório distinguir", () => {
    for (const b of BANDEIRAS) expect(ehUltimoRecurso(b.asset), b.id).toBe(true);
    expect(ehUltimoRecurso(null)).toBe(false);
    expect(ehUltimoRecurso({ metadata: {} } as never)).toBe(false);
  });
});

describe("a escolha da bandeira", () => {
  it("evita a que já saiu", () => {
    const primeira = escolherBandeira();
    const segunda = escolherBandeira({ evitar: new Set([primeira.imageUrl]) });

    expect(segunda.imageUrl).not.toBe(primeira.imageUrl);
  });

  it("prefere a que combina com o eixo da pauta", () => {
    // Wall Street para economia; a rua da cidade pequena para cultura.
    expect(escolherBandeira({ eixo: "economia" }).metadata?.descricao).toContain("Wall Street");
    expect(escolherBandeira({ eixo: "cultura" }).metadata?.descricao).toMatch(/Quinta Avenida|Main Street/);
  });

  /**
   * Repetir bandeira é melhor do que publicar peça sem foto. É a regra toda em
   * uma frase, e é por isso que a função nunca devolve nulo.
   */
  it("com todas já usadas, ainda devolve uma", () => {
    const todas = new Set(BANDEIRAS.map((b) => b.asset.imageUrl));
    const escolhida = escolherBandeira({ evitar: todas });

    expect(escolhida).toBeTruthy();
    expect(todas.has(escolhida.imageUrl)).toBe(true);
  });

  it("devolve cópia, e não a referência do acervo", () => {
    const a = escolherBandeira();
    a.imageRelevanceScore = 99;
    expect(escolherBandeira().imageRelevanceScore).toBe(0);
  });
});
