import { describe, expect, it, vi } from "vitest";
import { LeituraFalhou, comRetentativa } from "./leitura";

/**
 * Consertar o caso em vez da classe custou dois dias seguidos.
 *
 *   13/09  getProjectById          "Projeto ... não encontrado"   Gateway Timeout
 *   14/09  getProjectNewsSources   "Falha ao carregar fontes"     Gateway Timeout
 *
 * Em 13 eu blindei a primeira leitura. No dia seguinte o problema andou uma
 * casa, para a leitura imediatamente posterior, que não tinha proteção.
 */

const semDormir = { dormir: async () => {} };

describe("releitura das consultas que decidem o dia", () => {
  it("devolve na primeira quando dá certo, e não relê à toa", async () => {
    const ler = vi.fn().mockResolvedValue("ok");
    expect(await comRetentativa("x", ler, semDormir)).toBe("ok");
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("soluço que passa na segunda não derruba o dia", async () => {
    const ler = vi.fn().mockRejectedValueOnce(new LeituraFalhou("Gateway Timeout")).mockResolvedValue("ok");
    expect(await comRetentativa("x", ler, semDormir)).toBe("ok");
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("indisponibilidade real sobe com o motivo, depois das tentativas", async () => {
    const ler = vi.fn().mockRejectedValue(new LeituraFalhou("Gateway Timeout"));
    await expect(comRetentativa("x", ler, semDormir)).rejects.toThrow("Gateway Timeout");
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it("erro que NÃO é de leitura não é relido", async () => {
    /*
     * "O projeto não tem fonte habilitada" é configuração: a resposta seria a
     * mesma, e repetir só atrasaria o alerta de algo que precisa de ação humana.
     */
    const ler = vi.fn().mockRejectedValue(new Error("nenhuma fonte habilitada"));
    await expect(comRetentativa("x", ler, semDormir)).rejects.toThrow("nenhuma fonte");
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("a pausa cresce a cada rodada", async () => {
    const pausas: number[] = [];
    const ler = vi.fn().mockRejectedValue(new LeituraFalhou("timeout"));
    await comRetentativa("x", ler, {
      pausaBaseMs: 100,
      dormir: async (ms) => {
        pausas.push(ms);
      },
    }).catch(() => {});
    expect(pausas).toEqual([100, 200]);
  });

  it("uma tentativa só continua sendo uma tentativa", async () => {
    const ler = vi.fn().mockRejectedValue(new LeituraFalhou("timeout"));
    await expect(comRetentativa("x", ler, { tentativas: 1, ...semDormir })).rejects.toThrow();
    expect(ler).toHaveBeenCalledTimes(1);
  });
});
