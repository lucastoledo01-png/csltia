import { describe, expect, it, vi } from "vitest";
import { vozesComMemoria, vozesDosRamosComMemoria, type VozesDosRamos } from "./vozes";
import type { Ramo } from "../aprovacao/contrato";

/**
 * A memória de reprovação nos redatores dos ramos (RF-29, integração de
 * 05/10/2026): só entra com a fila fora de `off`, e com ela desligada a voz
 * sai exatamente como antes, sem nem ler a memória.
 *
 * Desde 06/10/2026 cada voz recebe o bloco do SEU canal, e nunca o de outro.
 */

const VOZES: VozesDosRamos = { newsletter: "VOZ N", artigo: "VOZ A", post: "VOZ P" };

function projeto(aprovacao?: string) {
  return { id: "proj-1", settings: aprovacao ? { capacidades: { aprovacao } } : {} };
}

const semExemplos = async () => "";

describe("a memória de reprovação nas vozes", () => {
  it("fila desligada: a memória NÃO é lida e as vozes saem idênticas", async () => {
    const memoria = vi.fn(async () => "NÃO REPETIR: x");
    const exemplos = vi.fn(async () => "EXEMPLOS: x");
    const v = await vozesDosRamosComMemoria(projeto(), { vozes: async () => VOZES, memoria, exemplos });
    expect(v).toEqual(VOZES);
    expect(memoria).not.toHaveBeenCalled();
    expect(exemplos).not.toHaveBeenCalled();
  });

  it("fila em off declarada: idem", async () => {
    const memoria = vi.fn(async () => "NÃO REPETIR: x");
    expect(
      await vozesDosRamosComMemoria(projeto("off"), { vozes: async () => VOZES, memoria, exemplos: semExemplos }),
    ).toEqual(VOZES);
    expect(memoria).not.toHaveBeenCalled();
  });

  it("fila ligada: cada voz recebe o bloco do PRÓPRIO canal, nunca o de outro", async () => {
    const memoria = vi.fn(async (_id: string, ramo: Ramo) => `NÃO REPETIR NO ${ramo.toUpperCase()}`);
    const exemplos = vi.fn(async (_id: string, ramo: Ramo) => (ramo === "post" ? "EXEMPLOS DO POST" : ""));
    const v = await vozesDosRamosComMemoria(projeto("dry_run"), { vozes: async () => VOZES, memoria, exemplos });
    expect(memoria).toHaveBeenCalledWith("proj-1", "newsletter", "texto");
    expect(memoria).toHaveBeenCalledWith("proj-1", "artigo", "texto");
    expect(memoria).toHaveBeenCalledWith("proj-1", "post", "texto");
    expect(v.artigo).toBe("VOZ A\n\nNÃO REPETIR NO ARTIGO");
    expect(v.post).toBe("VOZ P\n\nNÃO REPETIR NO POST\n\nEXEMPLOS DO POST");
    expect(v.newsletter).toBe("VOZ N\n\nNÃO REPETIR NO NEWSLETTER");
    // O erro e o exemplo de um canal não aparecem na voz de outro.
    expect(v.newsletter).not.toMatch(/POST|ARTIGO/);
    expect(v.artigo).not.toMatch(/POST|NEWSLETTER/);
  });

  it("memória vazia não acrescenta bloco vazio", () => {
    expect(vozesComMemoria(VOZES, { newsletter: "  ", artigo: "", post: undefined })).toBe(VOZES);
  });
});
