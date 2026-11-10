import { describe, expect, it } from "vitest";
import { caixasParaApagar, videoEmPe } from "./corte";

/** Máscara de 64 por 112 (a grade de um vídeo 9:16), com retângulos marcados. */
function mascara(marcas: Array<[number, number, number, number]>): boolean[][] {
  const m = Array.from({ length: 112 }, () => new Array<boolean>(64).fill(false));
  for (const [x0, y0, x1, y1] of marcas) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y][x] = true;
  return m;
}

describe("o vídeo que já chega em pé (10/11/2026)", () => {
  it("9:16 está em pé; deitado e 4:5 não", () => {
    expect(videoEmPe({ largura: 480, altura: 852 })).toBe(true);
    expect(videoEmPe({ largura: 720, altura: 1280 })).toBe(true);
    expect(videoEmPe({ largura: 1280, altura: 720 })).toBe(false);
    expect(videoEmPe({ largura: 1080, altura: 1350 })).toBe(false);
    expect(videoEmPe({ largura: 0, altura: 0 })).toBe(false);
  });

  it("apaga o logotipo do canto e deixa o cenário parado do meio, como no vídeo da ABC", () => {
    // Logotipo no canto de cima à direita; o painel da Casa Branca e a borda do púlpito no meio.
    const m = mascara([
      [50, 3, 60, 20],
      [20, 25, 40, 45],
      [0, 80, 63, 88],
    ]);
    const caixas = caixasParaApagar(m, { largura: 480, altura: 852 });
    expect(caixas).toHaveLength(1);
    const [c] = caixas;
    // O logotipo, em pixels do vídeo, com folga, e dentro do quadro com a margem que o delogo exige.
    expect(c.x).toBeLessThanOrEqual(50 * 7.5);
    expect(c.x + c.largura).toBeGreaterThanOrEqual(61 * 7.5 - 1);
    expect(c.y).toBeGreaterThanOrEqual(1);
    expect(c.x + c.largura).toBeLessThanOrEqual(480 - 2);
  });

  it("ruído de uma célula não vira caixa, e máscara vazia não apaga nada", () => {
    expect(caixasParaApagar(mascara([[2, 2, 2, 2]]), { largura: 480, altura: 852 })).toEqual([]);
    expect(caixasParaApagar(mascara([]), { largura: 480, altura: 852 })).toEqual([]);
  });

  it("o canto de baixo também vale (marca d'água no rodapé)", () => {
    const caixas = caixasParaApagar(mascara([[2, 100, 12, 108]]), { largura: 720, altura: 1280 });
    expect(caixas).toHaveLength(1);
    expect(caixas[0].y + caixas[0].altura).toBeLessThanOrEqual(1280 - 2);
  });
});
