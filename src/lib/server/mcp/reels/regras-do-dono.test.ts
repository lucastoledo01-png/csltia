import { describe, expect, it } from "vitest";
import { conferirEtiqueta, conferirTrechosELegendas } from "./tarefa";

/*
 * As duas regras do dono para o Reel de fala (09/11/2026), com os casos reais
 * dos Reels do Trump: a etiqueta saiu "VÍDEO: CBS NEWS", e os trechos
 * começavam na cena da apresentadora e terminavam na cena de quem respondia.
 */
describe("a etiqueta do Reel", () => {
  it("é a editoria, nunca o crédito do vídeo", () => {
    expect(conferirEtiqueta("VÍDEO: CBS NEWS", "CBS News")[0]).toMatch(/\[ETIQUETA\]/);
    expect(conferirEtiqueta("Vídeo: Bloomberg", "Bloomberg")[0]).toMatch(/\[ETIQUETA\]/);
    expect(conferirEtiqueta("ENTREVISTA À BLOOMBERG", null)[0]).toMatch(/\[ETIQUETA\]/);
    expect(conferirEtiqueta("POLÍTICA", "CBS News")).toEqual([]);
    expect(conferirEtiqueta("TECNOLOGIA", "Bloomberg")).toEqual([]);
  });
});

describe("o trecho fica na cena de quem fala", () => {
  it("começar na cena da apresentadora volta com o tempo certo", () => {
    const material = {
      original: { largura: 1920, altura: 1080, segundos: 102 },
      transcricao: [{ inicio: 16.7, fim: 32.7, texto: "I have not spoken to him about it. He has done such an incredible job." }],
      idioma: "en" as const,
      cenas: [16.42, 27.96],
    };
    const legendas = [{ inicio: 0, fim: 3, texto: "Não falei com ele sobre isso." }];
    const errado = conferirTrechosELegendas({ trechos: [{ inicio: 16.0, fim: 32.8 }], legendas }, material);
    expect(errado.some((m) => m.includes("[CENA]") && m.includes("16.46"))).toBe(true);
    const certo = conferirTrechosELegendas({ trechos: [{ inicio: 16.5, fim: 32.8 }], legendas }, material);
    expect(certo.some((m) => m.includes("[CENA]"))).toBe(false);
  });

  it("passar para a cena de quem responde também volta", () => {
    const material = {
      original: { largura: 1920, altura: 1080, segundos: 174 },
      transcricao: [{ inicio: 31.9, fim: 42.7, texto: "they came into the country illegally" }],
      idioma: "en" as const,
      cenas: [31.66, 42.61],
    };
    const motivos = conferirTrechosELegendas(
      { trechos: [{ inicio: 31.75, fim: 43.0 }], legendas: [{ inicio: 0, fim: 2, texto: "entraram no país ilegalmente." }] },
      material,
    );
    expect(motivos.some((m) => m.includes("[CENA]") && m.includes("42.57"))).toBe(true);
  });
});
