import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { criarFilaEmMemoria } from "../aprovacao/fila-memoria";
import { editarTexto, enfileirar, reprovar, type AdaptadorDePecas, type DepsDaFila, type PecaLida, type ProjetoDaFila } from "../aprovacao/fila";
import { processarRefacoes } from "../aprovacao/refacao-assincrona";
import { errosRecentesDaEtapa } from "../aprovacao/memoria-de-reprovacao";
import type { Aprovacao, Ramo } from "../aprovacao/contrato";
import type { ContextoDaRefacao } from "../aprovacao/refazer";
import type { EdicaoDoEditor } from "../aprovacao/fila-store";
import type { PautaAvaliada } from "../editorial/guarda";
import type { ResultadoVisual } from "../visual/tipos";
import { criarFotosDoDia } from "../ramos/sem-foto";
import { trechoDasRecusas } from "../visual/cena-da-pauta";
import { aprendizadoDasReprovacoes, aprendizadoDoCanal } from "./do-canal";
import { aprenderNaSelecao, padroesDaSelecao } from "./selecao";
import { comFotoDoCanal, fotosDoCanal } from "./imagem";
import { arteNaRefacao, aprendizadoDaArte, moldesComAprendizado } from "./arte";
import { escolherExemplos, montarBlocoDeExemplos, exemplosAprovadosDoCanal } from "./exemplos";
import { EXEMPLOS_POR_TIPO, ORCAMENTO_DOS_EXEMPLOS } from "./contrato";
import { resumirEdicoesDaSemana, validarPropostasDasEdicoes, MINIMO_DE_EXEMPLOS_DA_EDICAO } from "./edicoes";
import { visaoDoAprendizado, segundaDaSemana } from "./painel";
import { TODOS_OS_MOLDES } from "../social/moldes-do-feed";

/**
 * O aprendizado da fila, por peça e por canal (06/10/2026).
 *
 * O que estes testes provam é o "nunca" de cada regra: a memória de um canal
 * nunca chega a outro, o exemplo nunca é da era da imigração nem de peça
 * editada, e a proposta das edições nunca nasce aprovada.
 */

const AGORA = Date.parse("2026-10-20T12:00:00.000Z");
const projeto: ProjetoDaFila = {
  id: "proj-1",
  timezone: "America/Sao_Paulo",
  settings: { capacidades: { aprovacao: "enforce" } },
};

/** Peças em memória: texto, hash e o que a reprovação grava (foto, arte). */
function pecasFalsas() {
  const pecas = new Map<string, PecaLida>();
  const adaptador: AdaptadorDePecas = {
    ler: async (_ramo, id) => pecas.get(id) ?? null,
    gravarTexto: async (_ramo, id, novo) => {
      const p = pecas.get(id)!;
      const hashNovo = `h-${novo.length}-${Math.random()}`;
      pecas.set(id, { ...p, texto: novo, hashAtual: hashNovo });
      return { hashNovo };
    },
    despachar: async () => ({ ok: true, detalhe: "" }),
    retirar: async () => undefined,
  };
  return { pecas, adaptador };
}

function montar() {
  const store = criarFilaEmMemoria(() => AGORA);
  const { pecas, adaptador } = pecasFalsas();
  const deps: DepsDaFila = { store, pecas: adaptador, agora: () => AGORA };
  async function peca(ramo: Ramo, id: string, texto: string, extras: PecaLida["extras"] = {}, resumo: Aprovacao["resumo"] = {}) {
    pecas.set(id, { hashAtual: `h-${id}`, texto, titulo: texto, material: [], extras });
    return (await enfileirar(
      projeto,
      { ramo, pecaId: id, hash: `h-${id}`, publicarEm: null, avisos: [], resumo: { titulo: texto, texto, ...resumo } },
      deps,
    ))!;
  }
  return { store, pecas, deps, peca };
}

function pautaDoContexto(storyId: string, url: string, atores: string[], eixo = "economia") {
  return {
    storyId,
    titulo: `Pauta ${storyId}`,
    url,
    fonteNome: "fonte",
    publicadoEm: "",
    resumo: "",
    categoria: eixo,
    eixo,
    pais: "EUA",
    atores,
    lugares: [],
    acontecimento: [],
  };
}

describe("cada etapa aprende com a reprovação DELA, no canal DELA", () => {
  it("o texto: a memória do post não entra na newsletter, e vice-versa", async () => {
    const m = montar();
    const post = await m.peca("post", "p1", "Legenda do post");
    const nl = await m.peca("newsletter", "n1", "Assunto da edição");
    await reprovar(projeto, post.id, "texto", "manchete com sigla em inglês", "dono", m.deps);
    await reprovar(projeto, nl.id, "texto", "assunto longo demais", "dono", m.deps);

    const doPost = await errosRecentesDaEtapa("proj-1", "post", "texto", 5, m.store);
    const daNewsletter = await errosRecentesDaEtapa("proj-1", "newsletter", "texto", 5, m.store);
    expect(doPost).toMatch(/sigla em inglês/);
    expect(doPost).not.toMatch(/assunto longo/);
    expect(daNewsletter).toMatch(/assunto longo/);
    expect(daNewsletter).not.toMatch(/sigla/);
    expect(await errosRecentesDaEtapa("proj-1", "artigo", "texto", 5, m.store)).toBe("");
  });

  it("três reprovações iguais viram proposta em QUALQUER etapa, do canal certo", async () => {
    const m = montar();
    for (const i of [1, 2, 3]) {
      const a = await m.peca("post", `p${i}`, `Post ${i}`, { fotos: [`https://img.example/foto-${i}.jpg`] });
      await reprovar(projeto, a.id, "imagem", "skyline genérico sem relação com a pauta", "dono", m.deps);
    }
    const nl = await m.peca("newsletter", "n1", "Edição");
    await reprovar(projeto, nl.id, "imagem", "skyline genérico sem relação com a pauta", "dono", m.deps);

    const propostas = await m.store.regras("proj-1");
    expect(propostas).toHaveLength(1);
    expect(propostas[0]).toMatchObject({ ramo: "post", etapa: "imagem", estado: "proposta", origem: "reprovacoes", ocorrencias: 3 });
    // Proposta não é regra: o bloco da etapa só a recebe depois de aprovada.
    expect(await errosRecentesDaEtapa("proj-1", "post", "imagem", 5, m.store)).not.toMatch(/REGRAS FIXAS/);
    await m.store.decidirRegra(propostas[0].id, "aprovada", "dono");
    expect(await errosRecentesDaEtapa("proj-1", "post", "imagem", 5, m.store)).toMatch(/REGRAS FIXAS/);
    expect(await errosRecentesDaEtapa("proj-1", "newsletter", "imagem", 5, m.store)).not.toMatch(/REGRAS FIXAS/);
  });

  it("a reprovação grava o que a peça tinha, e o canal aprende só com as dele", async () => {
    const m = montar();
    const post = await m.peca(
      "post",
      "p1",
      "Post",
      { fotos: ["https://img.example/fed.jpg?w=600"], arte: { molde: "recorte", gramatica: "recorte", bolha: false } },
      { contexto: { versao: 1, data: "2026-10-20", pautas: [pautaDoContexto("s1", "https://www.axios.com/a", ["Fed"])] } },
    );
    await reprovar(projeto, post.id, "imagem", "foto do Fed repetida", "dono", m.deps);
    const nl = await m.peca("newsletter", "n1", "Edição", {}, {
      contexto: {
        versao: 1,
        data: "2026-10-20",
        pautas: [pautaDoContexto("s2", "https://g1.globo.com/x", ["Lula"])],
        imagens: { s2: "https://img.example/lula.jpg" },
      },
    });
    await reprovar(projeto, nl.id, "selecao", "pauta fraca", "dono", m.deps, { alvo: "s2" });

    const r = m.store.reprovacoes;
    expect(r[0].detalhes).toMatchObject({ fotos: ["https://img.example/fed.jpg?w=600"], pautas: [{ storyId: "s1", fonte: "axios.com" }] });
    expect(r[1].detalhes).toMatchObject({ pautas: [{ storyId: "s2", fonte: "g1.globo.com", atores: ["Lula"] }] });

    const doPost = await aprendizadoDoCanal(m.store, "proj-1", "post", AGORA);
    const daNewsletter = await aprendizadoDoCanal(m.store, "proj-1", "newsletter", AGORA);
    expect(doPost.imagem.evitar).toEqual(["img.example/fed.jpg"]);
    expect(doPost.selecao.storyIds.size).toBe(0);
    expect(daNewsletter.imagem.evitar).toEqual([]);
    expect([...daNewsletter.selecao.storyIds]).toEqual(["s2"]);
  });

  it("a refação recebe o aprendizado do CANAL da peça, e a imagem leva o motivo à cena", async () => {
    const m = montar();
    const vistos: ContextoDaRefacao[] = [];
    m.deps.ganchos = {
      post: {
        imagem: async (ctx) => {
          vistos.push(ctx);
          return { ok: true };
        },
        arte: async (ctx) => {
          vistos.push(ctx);
          return { ok: true };
        },
      },
    };
    const outro = await m.peca("newsletter", "n0", "Edição", {}, {
      contexto: { versao: 1, data: "2026-10-20", pautas: [], imagens: { x: "https://img.example/da-newsletter.jpg" } },
    });
    await reprovar(projeto, outro.id, "imagem", "foto da newsletter recusada", "dono", m.deps);
    const a = await m.peca("post", "p1", "Post", { fotos: ["https://img.example/do-post.jpg"] });
    await reprovar(projeto, a.id, "imagem", "foto escura demais", "dono", m.deps);
    await processarRefacoes(projeto, m.deps, { ids: [a.id] });

    expect(vistos.map((c) => c.etapa)).toEqual(["imagem", "arte"]);
    expect(vistos[0].aprendizado?.ramo).toBe("post");
    expect(vistos[0].aprendizado?.imagem.evitar).toEqual(["img.example/do-post.jpg"]);
    expect(vistos[0].naoRepetir).toMatch(/foto escura/);
    expect(vistos[0].naoRepetir).not.toMatch(/newsletter recusada/);
    expect(vistos[1].culpada).toBe("imagem");
  });
});

function pautaAvaliada(storyId: string, url: string, atores: string[], nota: number, eixo = "economia"): PautaAvaliada {
  return {
    storyId,
    grupo: { primary: { title: `T ${storyId}`, url } },
    classificacao: { atores, eixo, lugares: [], acontecimento: [], pais: "EUA" },
    pontuacao: { total: nota, partes: {}, explicacao: `${nota}` },
  } as unknown as PautaAvaliada;
}

describe("a seleção do canal", () => {
  const recusa = (atores: string[], fonte: string, storyId: string) => ({
    etapa: "selecao" as const,
    motivo: "não é para este canal",
    detalhes: { pautas: [{ storyId, titulo: "", fonte, atores, eixo: "politica" }] },
  });

  it("sem reprovação de seleção, o pool é o mesmo array", () => {
    const pool = [pautaAvaliada("a", "https://x.com/1", [], 50)];
    expect(aprenderNaSelecao(pool, padroesDaSelecao([]), "post").pool).toBe(pool);
  });

  it("penaliza o parecido, bloqueia a fonte recusada três vezes e a pauta já recusada", () => {
    const padroes = padroesDaSelecao([
      recusa(["Trump"], "foxnews.com", "r1"),
      recusa(["Musk"], "foxnews.com", "r2"),
      recusa(["Trump"], "foxnews.com", "r3"),
      // Outra etapa não ensina a seleção.
      { etapa: "texto", motivo: "x", detalhes: { pautas: [{ storyId: "a", titulo: "", fonte: "axios.com", atores: [], eixo: "" }] } },
    ]);
    const pool = [
      pautaAvaliada("r1", "https://axios.com/0", [], 90),
      pautaAvaliada("a", "https://axios.com/1", ["Trump"], 60),
      pautaAvaliada("b", "https://www.foxnews.com/2", [], 80),
      pautaAvaliada("c", "https://axios.com/3", [], 55),
    ];
    const r = aprenderNaSelecao(pool, padroes, "post");
    expect(r.bloqueadas.map((b) => b.storyId).sort()).toEqual(["b", "r1"]);
    const a = r.pool.find((p) => p.storyId === "a")!;
    expect(a.pontuacao.total).toBe(60 - 16);
    expect(r.pool.map((p) => p.storyId)).toEqual(["c", "a"]);
    // A pauta original não foi tocada: os outros canais a leem com a nota de antes.
    expect(pool[1].pontuacao.total).toBe(60);
  });

  it("o aprendizado de um canal não vem das reprovações de outro", () => {
    const ap = aprendizadoDasReprovacoes("newsletter", [
      { id: "1", projectId: "proj-1", aprovacaoId: null, ramo: "post", etapa: "selecao", motivo: "x", textoReprovado: "", decididoPor: "d", createdAt: "", detalhes: { pautas: [{ storyId: "s", titulo: "", fonte: "a.com", atores: ["Musk"], eixo: "" }] } },
    ]);
    expect(ap.selecao.storyIds.size).toBe(0);
    expect(ap.selecao.atores.size).toBe(0);
  });
});

function visual(url: string | null): ResultadoVisual {
  return {
    storyId: "s",
    entidade: null,
    asset: url ? ({ imageUrl: url, source: "pexels" } as ResultadoVisual["asset"]) : null,
    assetSecundario: null,
    status: url ? "SELECTED" : "NO_VALID_IMAGE",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
  };
}

describe("a imagem do canal", () => {
  it("a foto compartilhada recusada no canal é trocada só nele", async () => {
    const base = criarFotosDoDia<{ storyId: string }>((p) => p.storyId, async () => visual("https://img.example/a.jpg?w=1"));
    const reresolver = vi.fn(async () => visual("https://img.example/b.jpg"));
    const canal = fotosDoCanal(base, (p) => p.storyId, { evitar: ["img.example/a.jpg"], motivos: [] }, reresolver);
    expect((await canal.resultado({ storyId: "s" })).visual?.asset?.imageUrl).toBe("https://img.example/b.jpg");
    expect((await base.resultado({ storyId: "s" })).visual?.asset?.imageUrl).toBe("https://img.example/a.jpg?w=1");
    expect(canal.jaResolvido("s")?.asset?.imageUrl).toBe("https://img.example/b.jpg");
  });

  it("sem nada a evitar, o canal lê a mesma memória", () => {
    const base = criarFotosDoDia<{ storyId: string }>((p) => p.storyId, async () => visual(null));
    expect(fotosDoCanal(base, (p) => p.storyId, { evitar: [], motivos: [] }, async () => null)).toBe(base);
  });

  it("se a outra também foi recusada, a pauta fica sem foto neste canal", async () => {
    const r = await comFotoDoCanal(visual("https://img.example/a.jpg"), { evitar: ["img.example/a.jpg"], motivos: [] }, async () =>
      visual("https://img.example/a.jpg?w=2"),
    );
    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.asset).toBeNull();
  });

  it("o motivo do editor entra na pergunta da cena, e sem motivo nada entra", () => {
    expect(trechoDasRecusas(undefined)).toBe("");
    expect(trechoDasRecusas([])).toBe("");
    expect(trechoDasRecusas(["skyline genérico"])).toMatch(/RECUSOU[\s\S]*skyline genérico/);
  });
});

describe("a arte do post", () => {
  const recusasDeRecorte = [1, 2, 3].map(() => ({
    etapa: "arte" as const,
    motivo: "recorte ilegível",
    detalhes: { arte: { molde: "recorte" as const, gramatica: "recorte", bolha: false } },
  }));

  it("o molde recusado três vezes sai da escolha; o jornal nunca sai", () => {
    const ap = aprendizadoDaArte([
      ...recusasDeRecorte,
      ...[1, 2, 3].map(() => ({ etapa: "arte" as const, motivo: "x", detalhes: { arte: { molde: "jornal" as const, gramatica: "jornal", bolha: false } } })),
    ]);
    const r = moldesComAprendizado(TODOS_OS_MOLDES, ap);
    expect(r.moldes.recorte).toBe(false);
    expect(r.moldes.jornal).toBe(true);
    expect(r.linhas[0]).toMatch(/recorte fora da escolha/);
  });

  it("a refação da arte troca a decisão recusada", () => {
    const vazio = aprendizadoDaArte([]);
    expect(arteNaRefacao({ gramatica: "recorte", bolha: false }, vazio, TODOS_OS_MOLDES).gramatica).toBe("jornal");
    expect(arteNaRefacao({ gramatica: "jornal", bolha: true }, vazio, TODOS_OS_MOLDES)).toMatchObject({ gramatica: "jornal", bolha: false });
    expect(arteNaRefacao({ gramatica: "jornal", bolha: false }, vazio, TODOS_OS_MOLDES).gramatica).toBe("recorte");
    expect(arteNaRefacao({ gramatica: "jornal", bolha: false }, aprendizadoDaArte(recusasDeRecorte), TODOS_OS_MOLDES).gramatica).toBe("jornal");
    expect(arteNaRefacao({ gramatica: "jornal", bolha: false }, vazio, { ...TODOS_OS_MOLDES, recorte: false }).gramatica).toBe("jornal");
  });
});

function aprovada(ramo: Ramo, id: string, decididoEm: string, resumo: Aprovacao["resumo"], extra: Partial<Aprovacao> = {}): Aprovacao {
  return {
    id,
    projectId: "proj-1",
    ramo,
    pecaId: `peca-${id}`,
    hashArtefato: "h",
    publicarEm: null,
    estado: "aprovada",
    automatica: false,
    decididoPor: "dono",
    decididoEm,
    motivo: null,
    etapaCulpada: null,
    refazimentos: 0,
    avisos: [],
    resumo,
    avisadoEm: null,
    liberadoEm: null,
    createdAt: decididoEm,
    updatedAt: decididoEm,
    ...extra,
  };
}

describe("a aprovação de primeira vira exemplo do canal", () => {
  const recente = "2026-10-19T12:00:00.000Z";

  it("só do canal, só de primeira, só do editor, sem edição, sem imigração e na janela", () => {
    const lista = [
      aprovada("post", "1", recente, { titulo: "Fed corta juros e o dólar cai no Brasil", texto: "O Fed cortou.\n\nComente" }),
      aprovada("post", "2", recente, { titulo: "Refeita: não pode virar exemplo", texto: "x" }, { refazimentos: 1 }),
      aprovada("post", "3", recente, { titulo: "Automática: não pode virar exemplo", texto: "x" }, { automatica: true }),
      aprovada("post", "4", recente, { titulo: "Editada à mão: não pode virar exemplo", texto: "x" }),
      aprovada("post", "5", recente, { titulo: "USCIS muda regra do green card para brasileiros", texto: "x" }),
      aprovada("post", "6", "2026-10-04T12:00:00.000Z", { titulo: "Antes da saída da imigração", texto: "x" }),
      aprovada("post", "7", "2026-09-01T12:00:00.000Z", { titulo: "Velha demais para servir", texto: "x" }),
      aprovada("newsletter", "8", recente, { titulo: "Assunto da newsletter que não é post", texto: "x" }),
    ];
    const ex = escolherExemplos("post", lista, { editadas: new Set(["peca-4"]), agora: AGORA });
    const textos = ex.map((e) => e.texto).join(" | ");
    expect(textos).toMatch(/Fed corta juros/);
    expect(textos).toMatch(/O Fed cortou\./);
    expect(textos).not.toMatch(/Comente|Refeita|Automática|Editada|USCIS|Antes da saída|Velha|newsletter/);
  });

  it("limitado: cinco por tipo e dentro do orçamento, e vazio quando não há nada", () => {
    const muitas = Array.from({ length: 20 }, (_, i) =>
      aprovada("artigo", `${i}`, `2026-10-19T12:${String(i).padStart(2, "0")}:00.000Z`, {
        titulo: `Título de matéria número ${i} sobre juros e inflação nos EUA ${"x".repeat(100)}`,
        linhaFina: `Linha fina ${i} ${"y".repeat(200)}`,
      }),
    );
    const ex = escolherExemplos("artigo", muitas, { agora: AGORA });
    expect(ex.filter((e) => e.tipo === "titulo")).toHaveLength(EXEMPLOS_POR_TIPO);
    expect(ex.filter((e) => e.tipo === "linha_fina")).toHaveLength(EXEMPLOS_POR_TIPO);
    const bloco = montarBlocoDeExemplos("artigo", ex);
    expect(bloco.length).toBeLessThanOrEqual(ORCAMENTO_DOS_EXEMPLOS);
    expect(bloco).toMatch(/EXEMPLOS APROVADOS PELO EDITOR neste canal \(Portal\)/);
    expect(montarBlocoDeExemplos("artigo", [])).toBe("");
    // Exemplo de outro canal não entra no bloco, nem passado à mão.
    expect(montarBlocoDeExemplos("newsletter", ex)).toBe("");
  });

  it("lido do banco, a peça editada fica de fora pela tabela das edições", async () => {
    const store = criarFilaEmMemoria(() => AGORA);
    store.aprovacoes.push(
      aprovada("newsletter", "1", "2026-10-19T12:00:00.000Z", { titulo: "Juros sobem e o crédito encarece no Brasil" }),
      aprovada("newsletter", "2", "2026-10-19T13:00:00.000Z", { titulo: "Assunto reescrito pelo editor na fila" }),
    );
    store.edicoes.push({ id: "e", projectId: "proj-1", ramo: "newsletter", pecaId: "peca-2", aprovacaoId: "2", etapa: "texto", antes: "a", depois: "b", editadoPor: "dono", criadoEm: "2026-10-19T12:30:00.000Z" });
    const bloco = await exemplosAprovadosDoCanal(store, "proj-1", "newsletter", AGORA);
    expect(bloco).toMatch(/Juros sobem/);
    expect(bloco).not.toMatch(/reescrito/);
  });
});

describe("a edição à mão vira aprendizado", () => {
  it("o antes e o depois ficam gravados, por canal", async () => {
    const m = montar();
    const a = await m.peca("newsletter", "n1", "Assunto antigo da edição");
    const r = await editarTexto(projeto, a.id, "Assunto novo, mais curto", "dono", m.deps);
    expect(r.ok).toBe(true);
    expect(m.store.edicoes).toHaveLength(1);
    expect(m.store.edicoes[0]).toMatchObject({
      ramo: "newsletter",
      pecaId: "n1",
      etapa: "texto",
      antes: "Assunto antigo da edição",
      depois: "Assunto novo, mais curto",
      editadoPor: "dono",
    });
  });

  it("falha ao gravar a edição não desfaz a edição", async () => {
    const m = montar();
    m.store.registrarEdicao = async () => {
      throw new Error("relation edicoes_do_editor does not exist");
    };
    const a = await m.peca("newsletter", "n1", "Assunto antigo");
    expect((await editarTexto(projeto, a.id, "Assunto novo", "dono", m.deps)).ok).toBe(true);
  });
});

function edicao(id: string, ramo: Ramo, antes: string, depois: string): EdicaoDoEditor {
  return { id, projectId: "proj-1", ramo, pecaId: `p-${id}`, aprovacaoId: null, etapa: "texto", antes, depois, editadoPor: "dono", criadoEm: "2026-10-19T12:00:00.000Z" };
}

describe("o resumo semanal das edições", () => {
  it("cria PROPOSTAS com os exemplos que as sustentam, e nunca aplica nada", async () => {
    const store = criarFilaEmMemoria(() => AGORA);
    store.edicoes.push(
      edicao("a", "post", "Confira as novidades do Fed hoje!", "O Fed cortou os juros."),
      edicao("b", "post", "Confira o que muda no aluguel!", "O aluguel subiu 4%."),
      edicao("c", "newsletter", "Assunto A", "Assunto A curto"),
    );
    const chamarModelo = vi.fn(async () => ({
      regras: [
        { ramo: "post", regra: "Abra a legenda pelo fato, nunca por 'Confira'.", exemplos: ["a", "b", "c"] },
        // Citação cruzada: a edição "c" é da newsletter e não sustenta regra de post.
        { ramo: "post", regra: "Regra sustentada só por edição de outro canal.", exemplos: ["c"] },
      ],
    }));
    const r = await resumirEdicoesDaSemana({ id: "proj-1" }, { store, chamarModelo, agora: AGORA });
    expect(chamarModelo).toHaveBeenCalledTimes(1);
    // Só o post tinha edições suficientes; a newsletter nem foi ao modelo.
    expect(chamarModelo.mock.calls[0][1]).not.toMatch(/Assunto A/);
    expect(r.propostas).toHaveLength(1);
    const [p] = await store.regras("proj-1");
    expect(p).toMatchObject({ ramo: "post", etapa: "texto", origem: "edicoes", estado: "proposta", ocorrencias: 2 });
    expect(p.exemplos).toHaveLength(2);
    expect(p.exemplos[0]).toMatch(/Antes: .* \| Depois: /);
    expect(await errosRecentesDaEtapa("proj-1", "post", "texto", 5, store)).not.toMatch(/Confira/);
  });

  it("sem edição suficiente, nem chama o modelo", async () => {
    const store = criarFilaEmMemoria(() => AGORA);
    store.edicoes.push(edicao("a", "post", "x", "y"));
    const chamarModelo = vi.fn();
    const r = await resumirEdicoesDaSemana({ id: "proj-1" }, { store, chamarModelo, agora: AGORA });
    expect(chamarModelo).not.toHaveBeenCalled();
    expect(r.chamouModelo).toBe(false);
  });

  it("a validação descarta canal inventado e apoio abaixo do mínimo", () => {
    const grupos = { post: [edicao("a", "post", "x", "y"), edicao("b", "post", "x", "z")] };
    const r = validarPropostasDasEdicoes(
      { regras: [{ ramo: "reels", regra: "qualquer coisa longa", exemplos: ["a", "b"] }, { ramo: "post", regra: "Regra com uma edição só", exemplos: ["a"] }] },
      grupos,
    );
    expect(r.propostas).toHaveLength(0);
    expect(r.descartadas.join(" ")).toMatch(new RegExp(`mínimo ${MINIMO_DE_EXEMPLOS_DA_EDICAO}`));
  });
});

describe("o painel de aprendizado", () => {
  it("separa a taxa por canal e por semana, e conta a editada como retrabalho", async () => {
    const store = criarFilaEmMemoria(() => AGORA);
    store.aprovacoes.push(
      aprovada("post", "1", "2026-10-20T10:00:00.000Z", {}),
      aprovada("post", "2", "2026-10-20T10:00:00.000Z", {}),
      aprovada("post", "3", "2026-10-13T10:00:00.000Z", {}, { refazimentos: 1 }),
      aprovada("newsletter", "4", "2026-10-20T10:00:00.000Z", {}),
    );
    store.edicoes.push({ ...edicao("e", "post", "a", "b"), pecaId: "peca-2" });
    const v = await visaoDoAprendizado({ id: "proj-1", timezone: "America/Sao_Paulo" }, store, AGORA);
    const post = v.semanas.post;
    expect(post).toHaveLength(8);
    expect(post[7]).toMatchObject({ semana: "2026-10-19", decididas: 2, dePrimeira: 1 });
    expect(post[6]).toMatchObject({ semana: "2026-10-12", decididas: 1, dePrimeira: 0 });
    expect(v.semanas.newsletter[7]).toMatchObject({ decididas: 1, dePrimeira: 1 });
    expect(segundaDaSemana("2026-10-25")).toBe("2026-10-19");
  });
});

const TRAVESSAO = String.fromCharCode(0x2014);

describe("a esteira de verdade passa pelo aprendizado do canal", () => {
  const ler = (f: string) => readFileSync(join(process.cwd(), f), "utf-8");

  it("o Instagram seleciona, escolhe molde e resolve foto pelo aprendizado do post", () => {
    const ciclo = ler("src/lib/server/social/ciclo-do-dia.ts");
    expect(ciclo).toContain('aprenderNaSelecao(conferencia.confirmadas, aprendizado.selecao, "post")');
    expect(ciclo).toContain("moldes: moldesDoDia.moldes,");
    expect(ciclo).toContain("rodarCicloSocial(doPool.pool,");
    expect(ciclo).toContain("comFotoDoCanal(");
  });

  it("a newsletter e o portal leem cada um o seu aprendizado", () => {
    const servico = ler("src/lib/server/newsroom/newsroom-service.ts");
    expect(servico).toContain('aprendizadoDoCanal(lojaDaFila, project.id, "newsletter")');
    expect(servico).toContain('aprendizadoDoCanal(lojaDaFila, project.id, "artigo")');
    expect(servico).toContain("pool: doPoolDoPortal.pool,");
  });

  it("nenhum travessão no código do aprendizado", () => {
    const dir = join(process.cwd(), "src/lib/server/aprendizado");
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), "utf-8"), f).not.toContain(TRAVESSAO);
    expect(ler("supabase/migrations/20261006120000_aprendizado_da_fila.sql")).not.toContain(TRAVESSAO);
    expect(ler("src/components/admin/PainelDeAprendizado.tsx")).not.toContain(TRAVESSAO);
  });
});
