import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Ramo } from "./contrato";
import { aprovar, enfileirar, type AdaptadorDePecas, type DepsDaFila, type ProjetoDaFila } from "./fila";
import { criarFilaEmMemoria } from "./fila-memoria";
import { decidirManutencaoNaFila, gravarComAFila } from "./manutencao";

/**
 * O script de manutenção não pode quebrar a aprovação (06/10/2026).
 *
 * O caso real: `consertar-capas.ts` acrescentou crédito e legenda ao HTML da
 * matéria do diesel enquanto ela esperava aprovação, e o hash da fila deixou
 * de bater. Aqui a matéria é um texto num mapa, e o hash sai dele, como o
 * adaptador de verdade faz a partir da linha de `articles`.
 */

const PROJETO: ProjetoDaFila = { id: "proj-1", timezone: "America/Sao_Paulo", settings: { capacidades: { aprovacao: "dry_run" } } };

function h(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

function mundo() {
  const textos = new Map<string, string>();
  const pecas: AdaptadorDePecas = {
    async ler(ramo: Ramo, id: string) {
      const t = textos.get(`${ramo}:${id}`);
      return t === undefined ? null : { hashAtual: h(t), texto: t, titulo: t, material: [] };
    },
    async gravarTexto() {
      throw new Error("a manutenção não edita texto pela fila");
    },
    async despachar() {
      return { ok: true, detalhe: "despachada" };
    },
    async retirar() {},
  };
  const store = criarFilaEmMemoria();
  const deps: DepsDaFila = { store, pecas };
  const HTML = "<p>O diesel chegou a US$ 6,32.</p>";
  textos.set("artigo:art-1", HTML);
  const consertar = async () => {
    textos.set("artigo:art-1", `<p class="credito-da-foto">Foto: Fulano</p>${HTML}`);
    return null;
  };
  return { textos, store, deps, consertar, HTML };
}

async function naFila(m: ReturnType<typeof mundo>) {
  return (await enfileirar(
    PROJETO,
    { ramo: "artigo", pecaId: "art-1", hash: h(m.HTML), publicarEm: "2026-10-07T09:07:00Z", avisos: [], resumo: { titulo: "Diesel" } },
    m.deps,
  ))!;
}

describe("conserto de capa numa matéria que espera aprovação", () => {
  it("aguardando: grava, a fila recebe o hash novo, e a matéria continua aprovável", async () => {
    const m = mundo();
    const linha = await naFila(m);

    const d = await gravarComAFila({ projeto: PROJETO, ramo: "artigo", pecaId: "art-1", deps: m.deps, gravar: m.consertar });

    expect(d).toMatchObject({ gravou: true, filaAtualizada: true });
    const depois = (await m.store.porId(linha.id))!;
    expect(depois.estado).toBe("aguardando");
    expect(depois.hashArtefato).toBe(h(m.textos.get("artigo:art-1")!));
    expect(depois.publicarEm).toBe("2026-10-07T09:07:00Z");
    expect(depois.resumo.titulo).toBe("Diesel");

    // O que quebrou em 06/10: aprovar depois do conserto.
    const r = await aprovar(PROJETO, linha.id, "dono", m.deps);
    expect(r.ok).toBe(true);
  });

  it("sem a fila, o conserto quebraria a aprovação (o defeito de 06/10)", async () => {
    const m = mundo();
    const linha = await naFila(m);
    await m.consertar();

    const r = await aprovar(PROJETO, linha.id, "dono", m.deps);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("a peça mudou") });
  });

  it("refazendo: não grava, e diz por quê", async () => {
    const m = mundo();
    const linha = await naFila(m);
    await m.store.atualizar(linha.id, { estado: "refazendo" });
    let gravou = false;

    const d = await gravarComAFila({
      projeto: PROJETO, ramo: "artigo", pecaId: "art-1", deps: m.deps,
      gravar: async () => { gravou = true; return null; },
    });

    expect(gravou).toBe(false);
    expect(d).toMatchObject({ gravou: false, motivo: expect.stringContaining("sendo refeita") });
    expect((await m.store.porId(linha.id))!.hashArtefato).toBe(h(m.HTML));
  });

  it("aprovada e não liberada: não grava, para não desfazer a decisão do dono", async () => {
    const m = mundo();
    const linha = await naFila(m);
    await m.store.atualizar(linha.id, { estado: "aprovada", decididoPor: "dono" });

    const d = await gravarComAFila({ projeto: PROJETO, ramo: "artigo", pecaId: "art-1", deps: m.deps, gravar: m.consertar });

    expect(d.gravou).toBe(false);
    expect(m.textos.get("artigo:art-1")).toBe(m.HTML);
    expect((await m.store.porId(linha.id))!.estado).toBe("aprovada");
  });

  it("fora da fila: grava como antes, sem tocar em aprovacoes", async () => {
    const m = mundo();
    const d = await gravarComAFila({ projeto: PROJETO, ramo: "artigo", pecaId: "art-1", deps: m.deps, gravar: m.consertar });

    expect(d).toMatchObject({ gravou: true, filaAtualizada: false });
    expect(await m.store.porPeca(PROJETO.id, "artigo", "art-1")).toBeNull();
  });

  it("erro do banco ao gravar: nada muda na fila", async () => {
    const m = mundo();
    const linha = await naFila(m);

    const d = await gravarComAFila({
      projeto: PROJETO, ramo: "artigo", pecaId: "art-1", deps: m.deps,
      gravar: async () => "permission denied",
    });

    expect(d).toMatchObject({ gravou: false, motivo: "NÃO GRAVOU: permission denied" });
    expect((await m.store.porId(linha.id))!.hashArtefato).toBe(h(m.HTML));
  });

  it("decisão por estado", () => {
    const base = { liberadoEm: null } as never as Parameters<typeof decidirManutencaoNaFila>[0];
    const com = (estado: string, liberadoEm: string | null = null) =>
      decidirManutencaoNaFila({ ...(base as object), estado, liberadoEm } as never);
    expect(com("aguardando")).toMatchObject({ acao: "gravar", reentrar: true });
    expect(com("refazendo").acao).toBe("pular");
    expect(com("aprovada").acao).toBe("pular");
    expect(com("aprovada", "2026-10-06T09:07:00Z")).toMatchObject({ acao: "gravar", reentrar: false });
    expect(com("cancelada")).toMatchObject({ acao: "gravar", reentrar: false });
    expect(decidirManutencaoNaFila(null)).toMatchObject({ acao: "gravar", reentrar: false });
  });
});
