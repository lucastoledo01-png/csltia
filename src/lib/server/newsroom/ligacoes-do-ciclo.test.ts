import { describe, expect, it, vi } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import { montarPeca } from "../ramos/peca";
import { ligacoesDoCiclo } from "./ligacoes-do-ciclo";

/**
 * As ligações do ciclo de verdade (integração de 05/10/2026): com as
 * capacidades desligadas o objeto é vazio, e a chamada da redação é a de
 * antes; ligadas, nada do que falha aqui chega ao ciclo.
 */

function projeto(capacidades: Record<string, string> = {}) {
  return { id: "proj-1", timezone: "America/Sao_Paulo", settings: { capacidades } };
}

const PAUTA = { storyId: "s1" } as unknown as PautaAvaliada;

const peca = montarPeca({
  ramo: "artigo",
  referenciaId: "slug",
  storyIds: ["s1"],
  titulo: "t",
  conteudo: {},
  avisos: [],
  aprovadaPeloAuditor: true,
  bloqueios: [],
});

describe("as ligações do ciclo", () => {
  it("tudo desligado: objeto vazio, a redação recebe exatamente o que recebia", async () => {
    const candidatos = vi.fn(async () => []);
    const l = await ligacoesDoCiclo(projeto(), { deps: { candidatos } });
    expect(l).toEqual({});
  });

  it("sem projeto (leitura falhou): objeto vazio, e o ciclo segue", async () => {
    expect(await ligacoesDoCiclo(null)).toEqual({});
  });

  it("perfis em enforce: as pautas dos perfis vão para o pool do Instagram", async () => {
    const l = await ligacoesDoCiclo(projeto({ perfis_referencia: "enforce" }), { deps: { candidatos: async () => [PAUTA] } });
    expect(l.candidatasExtrasDoInstagram).toEqual([PAUTA]);
  });

  it("perfis que LANÇAM não derrubam o ciclo: viram nenhuma candidata", async () => {
    const l = await ligacoesDoCiclo(projeto({ perfis_referencia: "enforce" }), {
      deps: {
        candidatos: async () => {
          throw new Error("Graph API fora");
        },
      },
    });
    expect(l.candidatasExtrasDoInstagram).toBeUndefined();
  });

  it("fila desligada: nenhum gancho de entrada na fila", async () => {
    const fabricar = vi.fn();
    const l = await ligacoesDoCiclo(projeto({ aprovacao: "off" }), { deps: { candidatos: async () => [], aoProduzirPeca: fabricar } });
    expect(l.aoProduzirPeca).toBeUndefined();
    expect(fabricar).not.toHaveBeenCalled();
  });

  it("fila ligada: as peças vão para a fila, e uma falha dela vira log e não exceção", async () => {
    const entrar = vi.fn(async () => {
      throw new Error("aprovacoes não existe");
    });
    const l = await ligacoesDoCiclo(projeto({ aprovacao: "dry_run" }), {
      deps: { candidatos: async () => [], aoProduzirPeca: () => entrar },
    });
    await expect(l.aoProduzirPeca!(peca)).resolves.toBeUndefined();
    expect(entrar).toHaveBeenCalledWith(peca);
  });
});
