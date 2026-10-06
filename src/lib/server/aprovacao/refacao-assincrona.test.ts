import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Ramo } from "./contrato";
import { MINUTOS_PARA_REFACAO_TRAVADA } from "./contrato";
import { enfileirar, reprovar, type AdaptadorDePecas, type DepsDaFila, type ProjetoDaFila } from "./fila";
import { criarFilaEmMemoria } from "./fila-memoria";
import { processarRefacoes } from "./refacao-assincrona";
import type { GanchosDeRefazer } from "./refazer";

/**
 * A refação fora do clique (06/10/2026): agendar, reivindicar, rodar e sempre
 * dizer o desfecho. E a regra do dono do mesmo dia: a refação é da PEÇA e do
 * CANAL, e nunca encosta nas peças irmãs da mesma pauta.
 */

const p: ProjetoDaFila = { id: "proj-1", timezone: "America/Sao_Paulo", settings: { capacidades: { aprovacao: "enforce" } } };
const h = (t: string) => createHash("sha256").update(t).digest("hex");

function montar(ganchos: GanchosDeRefazer, inicio = Date.parse("2026-10-06T22:00:00.000Z")) {
  let agora = inicio;
  const store = criarFilaEmMemoria(() => agora);
  const textos = new Map<string, string>();
  const retiradas: Array<{ ramo: Ramo; pecaId: string; tipo: string }> = [];
  const pecas: AdaptadorDePecas = {
    async ler(ramo, id) {
      const t = textos.get(`${ramo}:${id}`);
      return t === undefined ? null : { hashAtual: h(t), texto: t, titulo: t, material: [] };
    },
    async gravarTexto(ramo, id, novo) {
      textos.set(`${ramo}:${id}`, novo);
      return { hashNovo: h(novo) };
    },
    async despachar() {
      return { ok: true, detalhe: "ok" };
    },
    async retirar(ramo, pecaId, tipo) {
      retiradas.push({ ramo, pecaId, tipo });
    },
  };
  const alertas: string[] = [];
  const deps: DepsDaFila = {
    store,
    pecas,
    ganchos,
    agora: () => agora,
    alertar: async (_n, titulo, detalhe) => {
      alertas.push(`${titulo}: ${detalhe}`);
    },
  };
  const entrar = async (ramo: Ramo, id: string, texto: string) => {
    textos.set(`${ramo}:${id}`, texto);
    return (await enfileirar(p, { ramo, pecaId: id, hash: h(texto), publicarEm: null, avisos: [], resumo: { texto } }, deps))!;
  };
  return {
    store,
    deps,
    textos,
    retiradas,
    alertas,
    entrar,
    avancar(min: number) {
      agora += min * 60_000;
    },
  };
}

describe("a reprovação agenda, o processador refaz", () => {
  it("o clique não roda gancho nenhum; o processador roda, e a peça volta com hash novo", async () => {
    const texto = vi.fn(async () => ({ ok: true as const }));
    const arte = vi.fn(async () => ({ ok: true as const }));
    const m = montar({ post: { texto, arte } });
    const a = await m.entrar("post", "p1", "Manchete velha");
    const r = await reprovar(p, a.id, "texto", "manchete sem destinatário", "dono", m.deps);
    expect(r).toMatchObject({ ok: true, desfecho: "refacao_agendada" });
    expect(texto).not.toHaveBeenCalled();

    // O gancho de verdade reescreve a linha; aqui, o dublê troca o texto da peça.
    texto.mockImplementation(async () => {
      m.textos.set("post:p1", "Manchete nova");
      return { ok: true as const };
    });
    const feitas = await processarRefacoes(p, m.deps);
    expect(feitas).toEqual([expect.objectContaining({ desfecho: "refeita" })]);
    const linha = m.store.aprovacoes[0];
    expect(linha.estado).toBe("aguardando");
    expect(linha.hashArtefato).toBe(h("Manchete nova"));
    expect(linha.resumo.refacao).toBeNull();
    expect(linha.resumo.ultimaRefacao).toMatchObject({ etapa: "texto", executadas: ["texto", "arte"] });
  });

  it("dois processos ao mesmo tempo: só um reivindica, e o gancho roda uma vez", async () => {
    let soltar: () => void = () => {};
    const imagem = vi.fn(() => new Promise<{ ok: true }>((ok) => (soltar = () => ok({ ok: true }))));
    const m = montar({ post: { imagem, arte: async () => ({ ok: true as const }) } });
    const a = await m.entrar("post", "p1", "x");
    await reprovar(p, a.id, "imagem", "foto genérica", "dono", m.deps);
    const primeiro = processarRefacoes(p, m.deps);
    await new Promise((r) => setTimeout(r, 0));
    const segundo = await processarRefacoes(p, m.deps);
    expect(segundo).toEqual([]);
    soltar();
    await primeiro;
    expect(imagem).toHaveBeenCalledTimes(1);
  });

  it("falha técnica volta para a fila com o erro à vista; na terceira vira 'não dá', com alerta", async () => {
    const imagem = vi.fn(async () => {
      throw new Error("Gateway Timeout");
    });
    const m = montar({ post: { imagem, arte: async () => ({ ok: true as const }) } });
    const a = await m.entrar("post", "p1", "x");
    await reprovar(p, a.id, "imagem", "foto genérica", "dono", m.deps);

    expect((await processarRefacoes(p, m.deps))[0].desfecho).toBe("de_volta_a_fila");
    expect(m.store.aprovacoes[0].resumo.refacao).toMatchObject({ estado: "na_fila", erro: "Gateway Timeout", execucoes: 1 });
    await processarRefacoes(p, m.deps);
    const terceira = await processarRefacoes(p, m.deps);
    expect(terceira[0].desfecho).toBe("impossivel");
    expect(m.store.aprovacoes[0].resumo.refacao).toMatchObject({ estado: "impossivel" });
    // Nada foi escrito na peça: ela volta à fila como estava.
    expect(m.store.aprovacoes[0].estado).toBe("aguardando");
    expect(m.store.aprovacoes[0].resumo.refacaoPendente).toMatch(/falhou 3 vezes.*Gateway Timeout/);
    expect(m.alertas.join()).toMatch(/Refação não deu/);
    // E o processador não volta a pegar o que já é "não dá".
    expect(await processarRefacoes(p, m.deps)).toEqual([]);
  });

  it("o gancho diz 'não dá' sem ter mexido na peça: ela volta intacta à fila, com o motivo", async () => {
    const m = montar({ newsletter: { selecao: async () => ({ ok: false as const, motivo: "a troca precisa saber QUAL pauta sai" }) } });
    const a = await m.entrar("newsletter", "ed", "Assunto");
    await reprovar(p, a.id, "selecao", "pauta fraca", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    expect(m.store.aprovacoes[0]).toMatchObject({ estado: "aguardando", refazimentos: 1 });
    expect(m.store.aprovacoes[0].resumo.refacao).toMatchObject({ estado: "impossivel", motivoImpossivel: expect.stringContaining("QUAL pauta") });
    // O editor pode reprovar de novo, agora apontando a pauta.
    const de_novo = await reprovar(p, a.id, "selecao", "sai a do Brasil", "dono", m.deps, { alvo: "s2" });
    expect(de_novo).toMatchObject({ ok: true, desfecho: "refacao_agendada" });
  });

  it("'não dá' depois de a peça mudar pela metade: fica parada em refazendo, e só cancelar resolve", async () => {
    const m = montar({
      post: {
        texto: async () => {
          m.textos.set("post:p1", "Texto novo sem arte nova");
          return { ok: true as const };
        },
        arte: async () => ({ ok: false as const, motivo: "a arte não fechou: timeout no render" }),
      },
    });
    const a = await m.entrar("post", "p1", "Texto velho");
    await reprovar(p, a.id, "texto", "manchete fraca", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    expect(m.store.aprovacoes[0]).toMatchObject({ estado: "refazendo" });
    expect(m.store.aprovacoes[0].resumo.refacaoPendente).toMatch(/a arte não fechou/);
    expect(m.alertas.join()).toMatch(/mudou pela metade/);
  });

  it("processo que morreu no meio: 'rodando' antigo volta a ser pego depois do prazo, e não antes", async () => {
    const imagem = vi.fn(async () => ({ ok: true as const }));
    const m = montar({ post: { imagem, arte: async () => ({ ok: true as const }) } });
    const a = await m.entrar("post", "p1", "x");
    await reprovar(p, a.id, "imagem", "foto", "dono", m.deps);
    const linha = m.store.aprovacoes[0];
    linha.resumo = { ...linha.resumo, refacao: { ...linha.resumo.refacao!, estado: "rodando", iniciadaEm: new Date(Date.parse("2026-10-06T22:00:00.000Z")).toISOString(), execucoes: 1 } };

    m.avancar(MINUTOS_PARA_REFACAO_TRAVADA - 1);
    expect(await processarRefacoes(p, m.deps)).toEqual([]);
    m.avancar(2);
    expect((await processarRefacoes(p, m.deps))[0].desfecho).toBe("refeita");
  });

  it("peça reprovada ANTES desta mudança (refazendo sem refação gravada) também ganha desfecho", async () => {
    const imagem = vi.fn(async () => ({ ok: true as const }));
    const m = montar({ post: { imagem, arte: async () => ({ ok: true as const }) } });
    const a = await m.entrar("post", "p1", "x");
    await m.store.atualizar(a.id, { estado: "refazendo", etapaCulpada: "imagem", motivo: "foto velha", refazimentos: 1 });
    expect((await processarRefacoes(p, m.deps))[0].desfecho).toBe("refeita");
    expect(imagem).toHaveBeenCalledWith(expect.objectContaining({ motivo: "foto velha", etapa: "imagem" }));
  });

  it("fila em ensaio: nada roda (quem publica são os caminhos de sempre)", async () => {
    const imagem = vi.fn(async () => ({ ok: true as const }));
    const m = montar({ post: { imagem } });
    expect(await processarRefacoes({ ...p, settings: { capacidades: { aprovacao: "dry_run" } } }, m.deps)).toEqual([]);
    expect(imagem).not.toHaveBeenCalled();
  });
});

describe("seleção: a peça nova entra, a reprovada sai", () => {
  it("descarta a velha com o motivo, enfileira a substituta com a mesma contagem de refações", async () => {
    const m = montar({
      post: {
        selecao: async () => {
          m.textos.set("post:p-novo", "Post novo");
          return {
            ok: true as const,
            detalhe: "nova pauta: Post novo",
            substituta: { ramo: "post" as const, pecaId: "p-novo", hash: h("Post novo"), publicarEm: "2026-10-07T14:45:00.000Z", avisos: [], resumo: { titulo: "Post novo" } },
          };
        },
      },
    });
    const a = await m.entrar("post", "p1", "Post velho");
    await reprovar(p, a.id, "selecao", "pauta fora da linha", "dono", m.deps);
    expect((await processarRefacoes(p, m.deps))[0]).toMatchObject({ desfecho: "substituida" });

    const velha = m.store.aprovacoes.find((x) => x.pecaId === "p1")!;
    const nova = m.store.aprovacoes.find((x) => x.pecaId === "p-novo")!;
    expect(velha.estado).toBe("descartada");
    expect(velha.motivo).toMatch(/Substituída por outra pauta.*pauta fora da linha/);
    expect(velha.resumo.substituidaPor).toBe(nova.id);
    expect(nova).toMatchObject({ estado: "aguardando", refazimentos: 1, publicarEm: "2026-10-07T14:45:00.000Z" });
    expect(nova.resumo.substituiu).toBe(velha.id);
    expect(m.retiradas).toEqual([{ ramo: "post", pecaId: "p1", tipo: "descartada" }]);
  });

  it("a terceira reprovação da vaga descarta, mesmo depois de trocar de pauta", async () => {
    const ok = async () => ({ ok: true as const });
    const m = montar({ post: { imagem: ok, arte: ok, texto: ok } });
    const a = await m.entrar("post", "p1", "x");
    await reprovar(p, a.id, "imagem", "foto 1", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    await reprovar(p, a.id, "texto", "texto 2", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    const terceira = await reprovar(p, a.id, "arte", "arte 3", "dono", m.deps);
    expect(terceira).toMatchObject({ ok: true, desfecho: "descartada" });
    expect(m.store.aprovacoes[0].motivo).toMatch(/Descartada na 3a reprovação.*arte 3/);
  });
});

describe("por peça e por canal (decisão do dono, 06/10/2026)", () => {
  it("reprovar o texto do post não toca a matéria nem a newsletter da mesma pauta", async () => {
    const chamadas: string[] = [];
    const gancho = (nome: string) => async () => {
      chamadas.push(nome);
      return { ok: true as const };
    };
    const m = montar({
      post: { texto: gancho("post.texto"), arte: gancho("post.arte") },
      artigo: { texto: gancho("artigo.texto"), imagem: gancho("artigo.imagem") },
      newsletter: { texto: gancho("newsletter.texto"), imagem: gancho("newsletter.imagem") },
    });
    const post = await m.entrar("post", "p1", "Post do Fed");
    await m.entrar("artigo", "a1", "Matéria do Fed");
    await m.entrar("newsletter", "n1", "Edição com o Fed");
    const antes = JSON.stringify(m.store.aprovacoes.filter((x) => x.ramo !== "post"));

    await reprovar(p, post.id, "texto", "manchete sem destinatário", "dono", m.deps);
    await processarRefacoes(p, m.deps);

    expect(chamadas).toEqual(["post.texto", "post.arte"]);
    expect(JSON.stringify(m.store.aprovacoes.filter((x) => x.ramo !== "post"))).toBe(antes);
    expect(m.textos.get("artigo:a1")).toBe("Matéria do Fed");
    expect(m.textos.get("newsletter:n1")).toBe("Edição com o Fed");
  });
});
