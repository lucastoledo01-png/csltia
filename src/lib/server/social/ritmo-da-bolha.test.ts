import { describe, expect, it } from "vitest";
import { alternarBolha, ultimaTeveBolha } from "./ritmo-da-bolha";

describe("o ritmo da bolha", () => {
  it("alterna dentro da mesma leva", () => {
    const todos = Array.from({ length: 5 }, () => ({ temSegundaFoto: true }));
    expect(alternarBolha(todos, false)).toEqual([true, false, true, false, true]);
  });

  it("continua o ritmo do feed, e não recomeça a cada leva", () => {
    const todos = Array.from({ length: 3 }, () => ({ temSegundaFoto: true }));
    // O último post do feed já tinha bolha: o primeiro desta leva sai sem.
    expect(alternarBolha(todos, true)).toEqual([false, true, false]);
  });

  it("não inventa bolha onde não há segunda foto", () => {
    const pedidos = [
      { temSegundaFoto: false },
      { temSegundaFoto: false },
      { temSegundaFoto: true },
    ];
    expect(alternarBolha(pedidos, false)).toEqual([false, false, true]);
  });

  /**
   * Sem segunda foto não há bolha, e a peça seguinte não é penalizada por
   * isso: o que bloqueia a próxima é a bolha ter SAÍDO, não ter sido pedida.
   */
  it("uma capa sem bolha libera a seguinte", () => {
    const pedidos = [
      { temSegundaFoto: false },
      { temSegundaFoto: true },
      { temSegundaFoto: true },
    ];
    expect(alternarBolha(pedidos, true)).toEqual([false, true, false]);
  });

  it("leva vazia devolve lista vazia", () => {
    expect(alternarBolha([], true)).toEqual([]);
  });

  it("lê o estado do feed pela peça mais recente", () => {
    expect(ultimaTeveBolha([{ bolha: true }, { bolha: false }])).toBe(true);
    expect(ultimaTeveBolha([{ bolha: false }, { bolha: true }])).toBe(false);
    // Conta nova, sem histórico: a bolha pode entrar.
    expect(ultimaTeveBolha([])).toBe(false);
  });
});
