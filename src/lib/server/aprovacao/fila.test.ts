import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DECISOR_AUTOMATICO, type Aprovacao, type Ramo } from "./contrato";
import {
  aprovar,
  aprovarEmLote,
  cancelar,
  cicloDaFila,
  editarTexto,
  enfileirar,
  instanteDeEnvioDaNewsletter,
  ordenarFila,
  reprovar,
  taxaSemRetrabalho,
  tentarLiberar,
  type AdaptadorDePecas,
  type DepsDaFila,
  type PecaLida,
  type ProjetoDaFila,
} from "./fila";
import { criarFilaEmMemoria } from "./fila-memoria";
import { errosRecentesDaEtapa } from "./memoria-de-reprovacao";
import type { GanchosDeRefazer } from "./refazer";
import { processarRefacoes } from "./refacao-assincrona";

/**
 * A fila contra uma memória e um adaptador de peças de mentira.
 *
 * O adaptador guarda o texto de cada peça e calcula o hash a partir dele, como
 * o de verdade faz a partir da linha do banco. Trocar o texto por fora é como
 * se simula "a peça mudou depois de entrar na fila".
 */

const TZ = "America/Sao_Paulo";

function projeto(settings: Record<string, unknown> = {}): ProjetoDaFila {
  return { id: "proj-1", timezone: TZ, settings: { capacidades: { aprovacao: "enforce" }, ...settings } };
}

function h(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

function pecasFalsas() {
  const textos = new Map<string, string>();
  const despachos: Array<{ ramo: Ramo; pecaId: string; em: number }> = [];
  const retiradas: Array<{ ramo: Ramo; pecaId: string; tipo: string; motivo: string }> = [];
  let relogio = () => Date.now();

  const adaptador: AdaptadorDePecas = {
    async ler(ramo, pecaId): Promise<PecaLida | null> {
      const t = textos.get(`${ramo}:${pecaId}`);
      if (t === undefined) return null;
      return { hashAtual: h(t), texto: t, titulo: t.slice(0, 40), material: ["O prazo é de 30 dias."], keyword: "NEWS" };
    },
    async gravarTexto(ramo, pecaId, novo) {
      textos.set(`${ramo}:${pecaId}`, novo);
      return { hashNovo: h(novo) };
    },
    async despachar(ramo, pecaId) {
      despachos.push({ ramo, pecaId, em: relogio() });
      return { ok: true, detalhe: "despachada" };
    },
    async retirar(ramo, pecaId, tipo, motivo) {
      retiradas.push({ ramo, pecaId, tipo, motivo });
    },
  };

  return {
    adaptador,
    textos,
    despachos,
    retiradas,
    usarRelogio(r: () => number) {
      relogio = r;
    },
    criar(ramo: Ramo, pecaId: string, texto: string) {
      textos.set(`${ramo}:${pecaId}`, texto);
      return h(texto);
    },
  };
}

function montar(agoraInicial = Date.parse("2026-10-09T08:00:00.000Z"), ganchos: GanchosDeRefazer = {}) {
  let agora = agoraInicial;
  const relogio = () => agora;
  const store = criarFilaEmMemoria(relogio);
  const pecas = pecasFalsas();
  pecas.usarRelogio(relogio);
  const alertas: Array<{ titulo: string; detalhe: string }> = [];
  const deps: DepsDaFila = {
    store,
    pecas: pecas.adaptador,
    ganchos,
    agora: relogio,
    alertar: async (_n, titulo, detalhe) => {
      alertas.push({ titulo, detalhe });
    },
  };
  return {
    store,
    pecas,
    deps,
    alertas,
    avancarPara(iso: string) {
      agora = Date.parse(iso);
    },
  };
}

async function enfileirarTexto(
  p: ProjetoDaFila,
  m: ReturnType<typeof montar>,
  ramo: Ramo,
  pecaId: string,
  texto: string,
  extra: { avisos?: Aprovacao["avisos"]; publicarEm?: string | null } = {},
) {
  const hash = m.pecas.criar(ramo, pecaId, texto);
  return enfileirar(
    p,
    {
      ramo,
      pecaId,
      hash,
      publicarEm: extra.publicarEm ?? null,
      avisos: extra.avisos ?? [],
      resumo: { titulo: texto.slice(0, 40), texto },
    },
    m.deps,
  );
}

describe("enfileirar", () => {
  it("com a fila desligada não grava nada: o dia de amanhã é igual ao de hoje", async () => {
    const m = montar();
    const r = await enfileirarTexto({ id: "proj-1", timezone: TZ, settings: {} }, m, "post", "p1", "texto");
    expect(r).toBeNull();
    expect(m.store.aprovacoes).toHaveLength(0);
  });

  it("cenário 1: terminada a produção, a fila de sexta tem newsletter, 3 artigos e os posts esperando", async () => {
    const m = montar();
    const p = projeto();
    await enfileirarTexto(p, m, "newsletter", "ed-1", "Assunto da sexta");
    for (const id of ["a1", "a2", "a3"]) await enfileirarTexto(p, m, "artigo", id, `Artigo ${id}`);
    for (const id of ["p1", "p2", "p3", "p4"]) await enfileirarTexto(p, m, "post", id, `Post ${id}`);

    const fila = await m.store.abertas("proj-1");
    expect(fila.filter((a) => a.ramo === "newsletter")).toHaveLength(1);
    expect(fila.filter((a) => a.ramo === "artigo")).toHaveLength(3);
    expect(fila.filter((a) => a.ramo === "post")).toHaveLength(4);
    expect(fila.every((a) => a.estado === "aguardando")).toBe(true);
    expect(m.pecas.despachos).toHaveLength(0);
  });

  it("cenário 7: em manual a peça espera", async () => {
    const m = montar();
    const r = await enfileirarTexto(projeto({ aprovacao: { post: "manual" } }), m, "post", "p1", "Post");
    expect(r?.estado).toBe("aguardando");
    expect(r?.automatica).toBe(false);
  });

  it("cenário 7: em automático a máquina aprova, e o registro diz que foi ela", async () => {
    const m = montar();
    const r = await enfileirarTexto(projeto({ aprovacao: { post: "automatico" } }), m, "post", "p1", "Post");
    expect(r?.estado).toBe("aprovada");
    expect(r?.automatica).toBe(true);
    expect(r?.decididoPor).toBe(DECISOR_AUTOMATICO);
    expect(r?.motivo).toMatch(/automaticamente/);
  });

  it("nem o automático aprova peça com aviso de QA", async () => {
    const m = montar();
    const r = await enfileirarTexto(projeto({ aprovacao: { post: "automatico" } }), m, "post", "p1", "Post", {
      avisos: [{ codigo: "RISCO_DE_ALUCINACAO", detalhe: "x" }],
    });
    expect(r?.estado).toBe("aguardando");
  });

  it("valor torto no modo do ramo cai em manual, nunca em automático", async () => {
    const m = montar();
    const r = await enfileirarTexto(projeto({ aprovacao: { post: "AUTOMATICO!" } }), m, "post", "p1", "Post");
    expect(r?.estado).toBe("aguardando");
  });

  it("versão nova da peça volta para aguardando, e a cancelada não ressuscita", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "v1");
    await aprovar(p, a!.id, "dono", m.deps);
    const v2 = await enfileirarTexto(p, m, "post", "p1", "v2");
    expect(v2?.estado).toBe("aguardando");
    expect(v2?.decididoPor).toBeNull();

    await cancelar(p, a!.id, "pauta caiu", "dono", m.deps);
    const v3 = await enfileirarTexto(p, m, "post", "p1", "v3");
    expect(v3?.estado).toBe("cancelada");
  });
});

describe("aprovar", () => {
  it("recusa aprovar se a peça mudou depois de entrar na fila", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "original");
    m.pecas.textos.set("post:p1", "trocado por fora");
    const r = await aprovar(p, a!.id, "dono", m.deps);
    expect(r.ok).toBe(false);
    expect(m.store.aprovacoes[0].estado).toBe("aguardando");
  });

  it("aprovação sem autor não é aprovação registrada", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "x");
    const r = await aprovar(p, a!.id, "  ", m.deps);
    expect(r.ok).toBe(false);
  });

  it("dois cliques ao mesmo tempo: só um vence", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "x");
    const [r1, r2] = await Promise.all([aprovar(p, a!.id, "dono", m.deps), aprovar(p, a!.id, "dono", m.deps)]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
  });

  it("post aprovado sem horário vai para a vaga do worker na hora", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "x");
    const r = await aprovar(p, a!.id, "dono", m.deps);
    expect(r.ok && r.liberacao?.liberada).toBe(true);
    expect(m.pecas.despachos).toHaveLength(1);
  });
});

describe("lote (RF-21)", () => {
  it("cenário 5: o lote não aprova a peça com aviso, e ela aparece primeiro na fila", async () => {
    const m = montar();
    const p = projeto();
    await enfileirarTexto(p, m, "post", "p1", "sem aviso 1", { publicarEm: "2026-10-09T12:00:00.000Z" });
    await enfileirarTexto(p, m, "post", "p2", "com aviso", {
      publicarEm: "2026-10-09T20:00:00.000Z",
      avisos: [{ codigo: "SOCIAL_GUARD", detalhe: "número sem lastro" }],
    });
    await enfileirarTexto(p, m, "post", "p3", "sem aviso 2", { publicarEm: "2026-10-09T15:00:00.000Z" });

    const ordem = ordenarFila(await m.store.abertas("proj-1"));
    expect(ordem[0].pecaId).toBe("p2");
    expect(ordem.map((a) => a.pecaId)).toEqual(["p2", "p1", "p3"]);

    const r = await aprovarEmLote(p, { ramo: "post" }, "dono", m.deps);
    expect(r.aprovadas.map((a) => a.pecaId).sort()).toEqual(["p1", "p3"]);
    expect(r.comAviso.map((a) => a.pecaId)).toEqual(["p2"]);
    expect(m.store.aprovacoes.find((a) => a.pecaId === "p2")?.estado).toBe("aguardando");
  });

  it("o lote por ramo não toca no outro ramo", async () => {
    const m = montar();
    const p = projeto();
    await enfileirarTexto(p, m, "post", "p1", "post");
    await enfileirarTexto(p, m, "artigo", "a1", "artigo");
    const r = await aprovarEmLote(p, { ramo: "artigo" }, "dono", m.deps);
    expect(r.aprovadas.map((a) => a.pecaId)).toEqual(["a1"]);
    expect(m.store.aprovacoes.find((a) => a.pecaId === "p1")?.estado).toBe("aguardando");
  });
});

describe("reprovar e refazer (RF-22, RF-29)", () => {
  it("cenário 6: imagem chama só a resolução visual e a arte, nunca o redator", async () => {
    const texto = vi.fn(async () => ({ ok: true as const }));
    const imagem = vi.fn(async () => ({ ok: true as const }));
    const arte = vi.fn(async () => ({ ok: true as const }));
    const m = montar(undefined, { post: { texto, imagem, arte } });
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");

    const r = await reprovar(p, a!.id, "imagem", "foto não tem relação com a pauta", "dono", m.deps);
    // A reprovação só agenda (06/10/2026): nada roda no clique.
    expect(r.ok && r.desfecho).toBe("refacao_agendada");
    expect(imagem).not.toHaveBeenCalled();
    expect(m.store.aprovacoes[0].resumo.refacao).toMatchObject({ estado: "na_fila", etapa: "imagem", tentativa: 1 });

    const rodadas = await processarRefacoes(p, m.deps);
    expect(rodadas.map((x) => x.desfecho)).toEqual(["refeita"]);
    expect(imagem).toHaveBeenCalledTimes(1);
    expect(arte).toHaveBeenCalledTimes(1);
    expect(texto).not.toHaveBeenCalled();
    expect(m.store.aprovacoes[0].estado).toBe("aguardando");
    expect(m.store.aprovacoes[0].refazimentos).toBe(1);
  });

  it("cenário 6: a terceira reprovação descarta, com o motivo", async () => {
    const ok = async () => ({ ok: true as const });
    const m = montar(undefined, { post: { imagem: ok, arte: ok, texto: ok } });
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");

    await reprovar(p, a!.id, "imagem", "foto genérica", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    await reprovar(p, a!.id, "imagem", "foto genérica de novo", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    expect(m.store.aprovacoes[0].refazimentos).toBe(2);
    const terceira = await reprovar(p, a!.id, "texto", "manchete sem destinatário", "dono", m.deps);

    expect(terceira.ok && terceira.desfecho).toBe("descartada");
    const linha = m.store.aprovacoes[0];
    expect(linha.estado).toBe("descartada");
    expect(linha.motivo).toMatch(/Descartada na 3a reprovação/);
    expect(linha.motivo).toMatch(/manchete sem destinatário/);
    expect(m.pecas.retiradas).toEqual([
      expect.objectContaining({ ramo: "post", pecaId: "p1", tipo: "descartada" }),
    ]);
  });

  it("etapa sem regeneração ligada devolve a peça intacta à fila, com o motivo à vista", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");
    const r = await reprovar(p, a!.id, "texto", "tom de relatório", "dono", m.deps);
    expect(r.ok && r.desfecho).toBe("refacao_impossivel");
    // A refação conta (é uma reprovação), mas a peça não fica presa: o editor decide de novo.
    expect(m.store.aprovacoes[0].estado).toBe("aguardando");
    expect(m.store.aprovacoes[0].refazimentos).toBe(1);
    expect(m.store.aprovacoes[0].resumo.refacaoPendente).toMatch(/ETAPA_SEM_REGENERACAO/);
    expect(m.store.aprovacoes[0].resumo.refacao).toMatchObject({ estado: "impossivel" });
    // O processador não pega o que já é "não dá".
    expect(await processarRefacoes(p, m.deps)).toEqual([]);
  });

  it("reprovação sem motivo escrito é recusada", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");
    const r = await reprovar(p, a!.id, "texto", "   ", "dono", m.deps);
    expect(r.ok).toBe(false);
    expect(m.store.reprovacoes).toHaveLength(0);
  });

  it("etapa que não existe no ramo é recusada: e-mail não tem arte", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "Assunto");
    const r = await reprovar(p, a!.id, "arte", "x", "dono", m.deps);
    expect(r.ok).toBe(false);
  });

  it("a refação recebe os erros recentes da etapa como 'não repetir'", async () => {
    const vistos: string[] = [];
    const texto = vi.fn(async (ctx: { naoRepetir: string }) => {
      vistos.push(ctx.naoRepetir);
      return { ok: true as const };
    });
    const ok = async () => ({ ok: true as const });
    const m = montar(undefined, { post: { texto, arte: ok } });
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post original");
    await reprovar(p, a!.id, "texto", "sigla em inglês na manchete", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    expect(vistos[0]).toMatch(/NÃO REPETIR/);
    expect(vistos[0]).toMatch(/sigla em inglês na manchete/);
    expect(vistos[0]).toMatch(/Post original/);
  });

  it("o mesmo erro três vezes vira PROPOSTA, e só entra como regra depois de aprovada", async () => {
    const m = montar();
    const p = projeto();
    for (const [i, motivo] of [
      "sigla em inglês na manchete",
      "manchete com sigla em inglês de novo",
      "de novo sigla em inglês na manchete",
    ].entries()) {
      const a = await enfileirarTexto(p, m, "post", `p${i}`, `Post ${i}`);
      await reprovar(p, a!.id, "texto", motivo, "dono", m.deps);
    }

    const propostas = await m.store.regras("proj-1", { etapa: "texto" });
    expect(propostas).toHaveLength(1);
    expect(propostas[0].estado).toBe("proposta");
    expect(propostas[0].ocorrencias).toBe(3);

    const antes = await errosRecentesDaEtapa("proj-1", "post", "texto", 5, m.store);
    expect(antes).not.toMatch(/REGRAS FIXAS/);

    await m.store.decidirRegra(propostas[0].id, "aprovada", "dono");
    const depois = await errosRecentesDaEtapa("proj-1", "post", "texto", 5, m.store);
    expect(depois).toMatch(/REGRAS FIXAS/);
    expect(depois).toMatch(/sigla em inglês/);
  });

  it("erros diferentes não viram proposta", async () => {
    const m = montar();
    const p = projeto();
    for (const [i, motivo] of ["sigla em inglês", "número sem fonte no segundo parágrafo", "tom de relatório"].entries()) {
      const a = await enfileirarTexto(p, m, "post", `p${i}`, `Post ${i}`);
      await reprovar(p, a!.id, "texto", motivo, "dono", m.deps);
    }
    expect(await m.store.regras("proj-1")).toHaveLength(0);
  });
});

describe("cancelar e editar", () => {
  it("cancelar é estado próprio e retira a peça (RF-28)", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");
    const r = await cancelar(p, a!.id, "a notícia foi desmentida", "dono", m.deps);
    expect(r.ok).toBe(true);
    expect(m.store.aprovacoes[0].estado).toBe("cancelada");
    expect(m.pecas.retiradas[0]).toMatchObject({ tipo: "cancelada", motivo: "a notícia foi desmentida" });
  });

  it("edição com travessão não passa na guarda", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "O prazo é de 30 dias");
    // O travessão vai escapado: a regra da casa vale até para o arquivo de teste.
    const r = await editarTexto(p, a!.id, "O prazo \u2014 que mudou \u2014 é de 30 dias", "dono", m.deps);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problemas?.map((x) => x.codigo)).toContain("TRAVESSAO");
    expect(m.pecas.textos.get("newsletter:ed")).toBe("O prazo é de 30 dias");
  });

  it("edição com número sem lastro não passa na guarda", async () => {
    const m = montar();
    const p = projeto();
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "O prazo é de 30 dias");
    const r = await editarTexto(p, a!.id, "O prazo é de 45 dias", "dono", m.deps);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problemas?.map((x) => x.codigo)).toContain("NUMERO_SEM_LASTRO");
  });

  it("edição boa grava, troca o hash e volta para aguardando mesmo se já estava aprovada", async () => {
    const m = montar(Date.parse("2026-10-09T05:00:00.000Z"));
    const p = projeto();
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "O prazo é de 30 dias", {
      publicarEm: "2026-10-09T09:07:00.000Z",
    });
    await aprovar(p, a!.id, "dono", m.deps);
    expect(m.store.aprovacoes[0].estado).toBe("aprovada");

    const r = await editarTexto(p, a!.id, "Prazo de 30 dias para quem pediu", "dono", m.deps);
    expect(r.ok).toBe(true);
    const linha = m.store.aprovacoes[0];
    expect(linha.estado).toBe("aguardando");
    expect(linha.hashArtefato).toBe(h("Prazo de 30 dias para quem pediu"));
  });
});

describe("cenário 4: a newsletter e o relógio", () => {
  it("às 06:00 sem aprovação avisa no Telegram uma vez; aprovada às 07:30, sai às 07:30", async () => {
    const m = montar(Date.parse("2026-10-09T08:00:00.000Z")); // 05:00 em Brasília
    const p = projeto();
    const envio = instanteDeEnvioDaNewsletter(p, "2026-10-09");
    expect(envio).toBe("2026-10-09T09:07:00.000Z");
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "Assunto", { publicarEm: envio });

    m.avancarPara("2026-10-09T08:59:00.000Z");
    expect((await cicloDaFila(p, m.deps)).avisos).toHaveLength(0);

    m.avancarPara("2026-10-09T09:00:00.000Z"); // 06:00
    expect((await cicloDaFila(p, m.deps)).avisos).toEqual([a!.id]);
    expect(m.alertas[0].titulo).toMatch(/não aprovada/);

    m.avancarPara("2026-10-09T09:07:00.000Z");
    await cicloDaFila(p, m.deps);
    expect(m.alertas).toHaveLength(1);
    expect(m.pecas.despachos).toHaveLength(0);

    m.avancarPara("2026-10-09T10:30:00.000Z"); // 07:30
    const r = await aprovar(p, a!.id, "dono", m.deps);
    expect(r.ok && r.liberacao?.liberada).toBe(true);
    expect(m.pecas.despachos).toEqual([{ ramo: "newsletter", pecaId: "ed", em: Date.parse("2026-10-09T10:30:00.000Z") }]);
  });

  it("aprovada às 05:00, espera e sai às 06:07 pelo ciclo, uma vez só", async () => {
    const m = montar(Date.parse("2026-10-09T08:00:00.000Z"));
    const p = projeto();
    const envio = instanteDeEnvioDaNewsletter(p, "2026-10-09");
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "Assunto", { publicarEm: envio });
    const r = await aprovar(p, a!.id, "dono", m.deps);
    expect(r.ok && r.liberacao?.liberada).toBe(false);
    expect(m.pecas.despachos).toHaveLength(0);

    m.avancarPara("2026-10-09T09:07:00.000Z");
    const c1 = await cicloDaFila(p, m.deps);
    const c2 = await cicloDaFila(p, m.deps);
    expect(c1.liberadas).toEqual([a!.id]);
    expect(c2.liberadas).toHaveLength(0);
    expect(m.pecas.despachos).toHaveLength(1);
    expect(m.alertas).toHaveLength(0);
  });

  it("dois liberadores ao mesmo tempo despacham uma vez só", async () => {
    const m = montar(Date.parse("2026-10-09T10:00:00.000Z"));
    const p = projeto();
    const a = await enfileirarTexto(p, m, "newsletter", "ed", "Assunto", { publicarEm: "2026-10-09T09:07:00.000Z" });
    await m.store.atualizar(a!.id, { estado: "aprovada", decididoPor: "dono", decididoEm: "2026-10-09T10:00:00.000Z" });
    const linha = (await m.store.porId(a!.id))!;
    await Promise.all([tentarLiberar(p, linha, m.deps), tentarLiberar(p, linha, m.deps)]);
    expect(m.pecas.despachos).toHaveLength(1);
  });

  it("em ensaio a fila não despacha: quem publica são os caminhos de sempre", async () => {
    const m = montar();
    const p = projeto({ capacidades: { aprovacao: "dry_run" } });
    const a = await enfileirarTexto(p, m, "post", "p1", "Post");
    const r = await aprovar(p, a!.id, "dono", m.deps);
    expect(r.ok).toBe(true);
    expect(m.pecas.despachos).toHaveLength(0);
  });
});

describe("taxa de aprovação sem retrabalho (RF-25)", () => {
  it("conta as aprovadas de primeira sobre as decididas, por ramo", async () => {
    const ok = async () => ({ ok: true as const });
    const m = montar(undefined, { post: { imagem: ok, arte: ok } });
    const p = projeto();
    const a1 = await enfileirarTexto(p, m, "post", "p1", "1");
    const a2 = await enfileirarTexto(p, m, "post", "p2", "2");
    await aprovar(p, a1!.id, "dono", m.deps);
    await reprovar(p, a2!.id, "imagem", "foto ruim", "dono", m.deps);
    await processarRefacoes(p, m.deps);
    await aprovar(p, a2!.id, "dono", m.deps);

    const taxa = (await taxaSemRetrabalho(p, m.deps)).find((t) => t.ramo === "post")!;
    expect(taxa.decididas).toBe(2);
    expect(taxa.dePrimeira).toBe(1);
    expect(taxa.taxa).toBe(0.5);
  });
});
