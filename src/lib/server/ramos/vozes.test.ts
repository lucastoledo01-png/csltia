import { describe, expect, it, vi } from "vitest";
import { vozesComMemoria, vozesDosRamosComMemoria, type VozesDosRamos } from "./vozes";

/**
 * A memória de reprovação nos redatores dos ramos (RF-29, integração de
 * 05/10/2026): só entra com a fila fora de `off`, e com ela desligada a voz
 * sai exatamente como antes, sem nem ler a memória.
 */

const VOZES: VozesDosRamos = { newsletter: "VOZ N", artigo: "VOZ A", post: "VOZ P" };

function projeto(aprovacao?: string) {
  return { id: "proj-1", settings: aprovacao ? { capacidades: { aprovacao } } : {} };
}

describe("a memória de reprovação nas vozes", () => {
  it("fila desligada: a memória NÃO é lida e as vozes saem idênticas", async () => {
    const memoria = vi.fn(async () => "NÃO REPETIR: x");
    const v = await vozesDosRamosComMemoria(projeto(), { vozes: async () => VOZES, memoria });
    expect(v).toEqual(VOZES);
    expect(memoria).not.toHaveBeenCalled();
  });

  it("fila em off declarada: idem", async () => {
    const memoria = vi.fn(async () => "NÃO REPETIR: x");
    expect(await vozesDosRamosComMemoria(projeto("off"), { vozes: async () => VOZES, memoria })).toEqual(VOZES);
    expect(memoria).not.toHaveBeenCalled();
  });

  it("fila ligada: o bloco da etapa texto entra no fim das três vozes", async () => {
    const memoria = vi.fn(async () => "NÃO REPETIR: sigla no título");
    const v = await vozesDosRamosComMemoria(projeto("dry_run"), { vozes: async () => VOZES, memoria });
    expect(memoria).toHaveBeenCalledWith("proj-1", "texto");
    expect(v.artigo).toBe("VOZ A\n\nNÃO REPETIR: sigla no título");
    expect(v.post.endsWith("NÃO REPETIR: sigla no título")).toBe(true);
    expect(v.newsletter.startsWith("VOZ N")).toBe(true);
  });

  it("memória vazia não acrescenta bloco vazio", () => {
    expect(vozesComMemoria(VOZES, "  ")).toBe(VOZES);
  });
});
