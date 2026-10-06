import { describe, expect, it } from "vitest";
import { ultimaTeveBolha } from "./ritmo-da-bolha";
import { decidirBolha, type DeteccaoDeRostos, type PedidoDaBolha } from "./bolha-sem-rosto";

/*
 * O ritmo da bolha, jogado como o ciclo joga: peça a peça, com o estado da
 * peça anterior decidindo a vez da seguinte, e a leva seguinte começando do
 * que o FEED terminou.
 */

const SEM_ROSTO: DeteccaoDeRostos = { ok: true, rostos: [], custoUsd: 0.004, tokens: 1400, emCache: false, modelo: "m" };
const ROSTO_GIGANTE: DeteccaoDeRostos = {
  ok: true,
  rostos: [{ x: 0, y: 0, largura: 1, altura: 1 }],
  custoUsd: 0.004,
  tokens: 1400,
  emCache: false,
  modelo: "m",
};

type Peca = { segunda: boolean; rostos?: DeteccaoDeRostos };

/** Roda uma leva, devolvendo quem saiu com bolha, como o laço do ciclo faz. */
async function leva(pecas: Peca[], anteriorDoFeed: boolean): Promise<boolean[]> {
  let anterior = anteriorDoFeed;
  const saida: boolean[] = [];
  for (const [i, p] of pecas.entries()) {
    const pedido: PedidoDaBolha = {
      moldeLigado: true,
      anteriorTeveBolha: anterior,
      gramatica: "jornal",
      fotoDeFundo: `https://exemplo.org/fundo-${i}.jpg`,
      segundaFoto: p.segunda ? { imageUrl: `https://exemplo.org/bolha-${i}.jpg`, attribution: "" } : null,
      canvas: { width: 1080, height: 1440 },
      detectar: async () => p.rostos ?? SEM_ROSTO,
    };
    const { decisao } = await decidirBolha(pedido);
    anterior = decisao.resultado === "com_bolha";
    saida.push(anterior);
  }
  return saida;
}

describe("o ritmo da bolha", () => {
  it("alterna dentro da mesma leva: com, sem, com", async () => {
    const todos = Array.from({ length: 5 }, () => ({ segunda: true }));
    expect(await leva(todos, false)).toEqual([true, false, true, false, true]);
  });

  it("continua o ritmo do feed de um dia para o outro, e não recomeça a cada leva", async () => {
    // Dia 1 termina COM bolha (três peças: com, sem, com).
    const dia1 = await leva([{ segunda: true }, { segunda: true }, { segunda: true }], false);
    expect(dia1).toEqual([true, false, true]);

    // Dia 2 lê o fim do feed: a primeira peça sai sem, e o ritmo segue.
    const fimDoFeed = ultimaTeveBolha([{ bolha: dia1[dia1.length - 1] }, { bolha: dia1[1] }]);
    expect(await leva([{ segunda: true }, { segunda: true }, { segunda: true }], fimDoFeed)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("a vez passa para a peça seguinte quando não há segunda foto", async () => {
    // A primeira era a vez e não tinha foto: a segunda herda a vez.
    expect(await leva([{ segunda: false }, { segunda: true }, { segunda: true }], false)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("a vez passa quando nenhuma posição fica livre de rosto", async () => {
    expect(
      await leva([{ segunda: true, rostos: ROSTO_GIGANTE }, { segunda: true }, { segunda: true }], false),
    ).toEqual([false, true, false]);
  });

  it("a vez continua passando enquanto ninguém consegue cumpri-la", async () => {
    expect(
      await leva([{ segunda: false }, { segunda: true, rostos: ROSTO_GIGANTE }, { segunda: true }], false),
    ).toEqual([false, false, true]);
  });

  it("lê o estado do feed pela peça mais recente", () => {
    expect(ultimaTeveBolha([{ bolha: true }, { bolha: false }])).toBe(true);
    expect(ultimaTeveBolha([{ bolha: false }, { bolha: true }])).toBe(false);
    // Conta nova, sem histórico: a bolha pode entrar.
    expect(ultimaTeveBolha([])).toBe(false);
  });
});
