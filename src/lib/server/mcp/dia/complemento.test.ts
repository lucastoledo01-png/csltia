import { describe, expect, it } from "vitest";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { Project } from "@/lib/server/projects";
import { tarefasEmMemoria } from "../tarefas-store";
import { idDoYoutube, videoDoLink } from "../reels/servico";
import { conferirComplemento, entregarComplemento, itensComComplemento, type MaterialDoComplemento } from "./complemento";
import { pedirComplemento, proximoPassoDoDia, type DepsDoDiretor } from "./diretor";
import { etapaDepoisDoLink, itensComLink, lerPedidoDoLink } from "./link";
import { comExtrasDe } from "./plano";
import { artigosDoPlano, newsletterDoPlano, planosEmMemoria, PLANO_VAZIO, postsDoPlano } from "./plano-store";

/*
 * O dia que não fecha (10/11/2026): o complemento quando o Instagram fica
 * abaixo do alvo, o link que o dono manda fora do plano, e a regra de que todo
 * post vira matéria e entra na newsletter até o teto.
 */

const projeto = { id: "p1", slug: "teste", timezone: "America/Sao_Paulo", settings: {} } as unknown as Project;

function candidata(storyId: string, comPacote = true): CandidataPersistida {
  return { storyId, title: `Pauta ${storyId}`, factualPackage: comPacote ? { verified_facts: ["x"] } : null, id: `c-${storyId}`, projectId: "p1" } as unknown as CandidataPersistida;
}

function deps(over: Partial<DepsDoDiretor> = {}) {
  const tarefas = tarefasEmMemoria();
  const planos = planosEmMemoria();
  const pool = new Map(["s1", "s2", "s3", "x1"].map((id) => [id, candidata(id)]));
  const agendados = new Set<string>();
  const abrir = (p: Project, data: string, tipo: string, chave: string, material: Record<string, unknown> = {}) =>
    tarefas.abrir({ projectId: p.id, editionDate: data, tipo: tipo as never, chave, instrucao: {}, material, esquema: {} });
  const d: DepsDoDiretor = {
    tarefas,
    planos,
    abrirTriagem: async (p, data, rodada) => [await abrir(p, data, "classificar", `triagem-${rodada ? `${rodada}-` : ""}1`)],
    abrirPlano: async (p, plano) => abrir(p, plano.data, "propor_plano", `plano-${plano.data}`, { planoId: plano.id }),
    abrirComplemento: async (p, plano, rodada, faltam) => abrir(p, plano.data, "propor_complemento", `complemento-${rodada}`, { planoId: plano.id, faltam }),
    pecasDoInstagram: async () => agendados.size,
    candidatas: async (_p, ids) => new Map(ids.filter((id) => pool.has(id)).map((id) => [id, pool.get(id)!])),
    foto: async () => ({ status: "SELECTED" }) as never,
    abrirFoto: async (p, plano, c) => abrir(p, plano.data, "escolher_foto", c.storyId),
    abrirPacote: async (p, data, c) => abrir(p, data, "extrair_pacote", c.storyId),
    reels: async () => [],
    escolherReel: async () => true,
    verificarPeloPlano: async () => {},
    postAgendado: async (_p, _d, id) => agendados.has(id),
    iniciarPost: async (p, data, id) => abrir(p, data, "escrever_post", id),
    agendarPost: async (_p, _d, id) => (agendados.add(id), { ok: true }),
    artigoGravado: async () => true,
    iniciarArtigo: async () => ({ erro: "sem" }),
    newsletterGravada: async () => true,
    avancarNewsletter: async () => ({ pronta: true }),
    ...over,
  };
  return { d, tarefas, planos, agendados };
}

describe("todo post do MCP vira matéria e entra na newsletter", () => {
  const itens = { ...PLANO_VAZIO, newsletter: ["n1", "n2"], artigos: ["a1"], posts: ["p1", "p2", "p3"], extras: ["e1"] };

  it("os extras contam como posts, e todo post vira matéria", () => {
    expect(postsDoPlano(itens)).toEqual(["p1", "p2", "p3", "e1"]);
    expect(artigosDoPlano(itens)).toEqual(["a1", "p1", "p2", "p3", "e1"]);
  });

  it("a newsletter leva as do plano e depois os posts, até o teto; o resto fica de fora", () => {
    expect(newsletterDoPlano(itens, 4)).toEqual(["n1", "n2", "p1", "p2"]);
    expect(newsletterDoPlano({ ...PLANO_VAZIO, posts: ["p1"] }, 4)).toEqual(["p1"]);
  });

  it("o plano proposto depois do link não apaga o link", () => {
    const anterior = itensComLink({ ...PLANO_VAZIO }, "link1", { formato: "carrossel", cena: "white house" });
    const novo = comExtrasDe({ ...PLANO_VAZIO, posts: ["s1"], formatos: { s1: "reel" } }, anterior);
    expect(novo.extras).toEqual(["link1"]);
    expect(novo.formatos).toEqual({ link1: "carrossel", s1: "reel" });
    expect(novo.cenas.link1?.consulta).toBe("white house");
    // O plano que já põe a pauta do link nos posts a absorve.
    expect(comExtrasDe({ ...PLANO_VAZIO, posts: ["link1"] }, anterior).extras).toBeUndefined();
  });
});

describe("o complemento do dia", () => {
  const material: MaterialDoComplemento = {
    data: "2026-11-10",
    planoId: "plano-1",
    rodada: 1,
    faltam: 2,
    pautas: [
      { storyId: "s1", titulo: "Musk processa a OpenAI", fonte: "a.com", publicadoEm: null, eixo: "tecnologia", pais: "EUA", relevancia: 8, veiculos: 4, resumo: "" },
      { storyId: "s2", titulo: "Fed mantém os juros", fonte: "b.com", publicadoEm: null, eixo: "economia", pais: "EUA", relevancia: 7, veiculos: 2, resumo: "" },
      { storyId: "s3", titulo: "Pauta usada", fonte: "c.com", publicadoEm: null, eixo: "economia", pais: "EUA", relevancia: 7, veiculos: 1, resumo: "" },
    ],
    reels: [{ id: "r1", fonte: "youtube", autor: "CNBC", titulo: "x", nota: 80, link: null }],
    noDia: ["d1"],
    jaUsadasNoInstagram: ["s3"],
  };
  const bom = { posts: ["s1"], reels: ["r1"], formatos: { s1: "reel" as const }, cenas: { s1: { consulta: "court building", objeto: "" } }, porque: { s1: "quente", r1: "fala do CEO" } };

  it("aceita o complemento dentro das regras, e o vazio também", () => {
    expect(conferirComplemento(bom, material)).toEqual([]);
    expect(conferirComplemento({ posts: [], reels: [], formatos: {}, cenas: {}, porque: {} }, material)).toEqual([]);
  });

  it("recusa passar do que falta, pauta fora do pool, já usada, sem formato e sem cena", () => {
    const m = conferirComplemento({ ...bom, posts: ["s1", "s3", "zz"], formatos: { s1: "reel" }, cenas: {} }, material).join(" | ");
    expect(m).toContain("até 2 peça(s)");
    expect(m).toContain("zz não está entre as pautas");
    expect(m).toContain("s3 já saiu no Instagram");
    expect(m).toContain("falta o formato do post s3");
    expect(m).toContain("falta a busca da foto de contexto de s1");
  });

  it("os posts entram como extras, com formato e cena, e o dia volta ao preparo", async () => {
    const { tarefas, planos } = deps();
    const plano = await planos.doDia("p1", "2026-11-10");
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "pronto", itens: { ...PLANO_VAZIO, posts: ["d1"] } });
    const t = await tarefas.abrir({ projectId: "p1", editionDate: "2026-11-10", tipo: "propor_complemento", chave: "complemento-1", instrucao: {}, material: { ...material, planoId: plano.id } as never, esquema: {} });
    const r = await entregarComplemento(t, bom, "claude", { tarefas, planos });
    expect(r.desfecho).toBe("complemento_no_dia");
    const depois = (await planos.porId(plano.id))!;
    expect(depois.etapa).toBe("preparo");
    expect(depois.itens.extras).toEqual(["s1"]);
    expect(depois.itens.reels).toEqual(["r1"]);
    expect(depois.itens.formatos?.s1).toBe("reel");
    expect(itensComComplemento(depois.itens, bom).extras).toEqual(["s1"]);
  });

  it("o dia pronto com peça a menos abre o complemento sozinho, e para depois de duas rodadas", async () => {
    const { d, tarefas, planos, agendados } = deps();
    const plano = await planos.doDia("p1", "2026-11-10");
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "pronto", itens: { ...PLANO_VAZIO, posts: ["s1"] } });
    agendados.add("s1");
    let passo = await proximoPassoDoDia(projeto, "2026-11-10", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("propor_complemento");
    expect(passo.tipo === "tarefa" && (passo.tarefa.material as { faltam: number }).faltam).toBe(4);
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    passo = await proximoPassoDoDia(projeto, "2026-11-10", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.chave).toBe("complemento-2");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    passo = await proximoPassoDoDia(projeto, "2026-11-10", d);
    expect(passo.tipo).toBe("pronto");
    expect(passo.avisos?.join(" ")).toContain("1 de 5 peças");
  });

  it("com o pool seco, abre uma triagem nova para o complemento, uma vez", async () => {
    const { d, tarefas, planos } = deps({ abrirComplemento: async () => null });
    const plano = await planos.doDia("p1", "2026-11-10");
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "pronto", itens: { ...PLANO_VAZIO } });
    let passo = await proximoPassoDoDia(projeto, "2026-11-10", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.chave).toBe("triagem-c1-1");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    passo = await proximoPassoDoDia(projeto, "2026-11-10", d);
    expect(passo.tipo).toBe("pronto");
  });

  it("complementar_o_dia: recusa dia sem plano aprovado, e abre num dia fechado", async () => {
    const { d, planos } = deps();
    expect(await pedirComplemento(projeto, "2026-11-08", d)).toHaveProperty("erro");
    const plano = await planos.doDia("p1", "2026-11-08");
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "pronto" });
    const r = await pedirComplemento(projeto, "2026-11-08", d, { quantas: 2, texto: "algo de tecnologia" });
    expect("tipo" in r && r.tipo === "tarefa" && r.tarefa.tipo).toBe("propor_complemento");
    expect("tipo" in r && r.tipo === "tarefa" && (r.tarefa.material as { faltam: number }).faltam).toBe(2);
  });
});

describe("a pauta do link, fora do plano", () => {
  it("confere os argumentos", () => {
    expect(lerPedidoDoLink({ url: "ftp://x" })).toHaveProperty("erro");
    expect(lerPedidoDoLink({ url: "https://cnbc.com/a" })).toHaveProperty("erro");
    const p = lerPedidoDoLink({ url: "https://cnbc.com/a", titulo: "Nvidia bate recorde de valor", eixo: "tecnologia", atores: ["Jensen Huang", 3] });
    expect(p).toMatchObject({ eixo: "tecnologia", pais: "EUA", formato: "reel", atores: ["Jensen Huang"], cena: "Nvidia bate recorde de valor" });
  });

  it("entra como extra uma vez, e o dia aprovado que já tinha produzido volta ao preparo", () => {
    const itens = itensComLink({ ...PLANO_VAZIO, posts: ["s1"] }, "l1", { formato: "estatico", cena: "nvidia hq" });
    expect(itens.extras).toEqual(["l1"]);
    expect(itensComLink(itens, "l1", { formato: "reel", cena: "x" })).toBe(itens);
    expect(itensComLink(itens, "s1", { formato: "reel", cena: "x" })).toBe(itens);
    expect(etapaDepoisDoLink({ estado: "aprovado", etapa: "pronto" })).toBe("preparo");
    expect(etapaDepoisDoLink({ estado: "rascunho", etapa: "triagem" })).toBe("triagem");
  });

  it("antes do plano, o link é produzido sem começar o dia, e termina em pronto", async () => {
    const { d, tarefas, planos } = deps({ postAgendado: async () => false });
    const plano = await planos.doDia("p1", "2026-11-14");
    await planos.atualizar(plano.id, { itens: itensComLink({ ...PLANO_VAZIO }, "x1", { formato: "reel", cena: "x" }) });
    let passo = await proximoPassoDoDia(projeto, "2026-11-14", d, { comecarODia: false });
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("escrever_post");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, { pronto: {} }, "claude");
    d.postAgendado = async () => true;
    passo = await proximoPassoDoDia(projeto, "2026-11-14", d, { comecarODia: false });
    expect(passo.tipo).toBe("pronto");
    expect((await tarefas.doDia("p1", "2026-11-14")).some((t) => t.tipo === "classificar")).toBe(false);
    // O fazer_o_dia, esse sim, começa o dia.
    passo = await proximoPassoDoDia(projeto, "2026-11-14", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("classificar");
  });
});

describe("o Reel do link", () => {
  it("acha o id do vídeo do YouTube em toda forma de link", () => {
    expect(idDoYoutube("https://www.youtube.com/watch?v=Y-5Qxu900sw&si=abc")).toBe("Y-5Qxu900sw");
    expect(idDoYoutube("https://youtu.be/Y-5Qxu900sw?si=abc")).toBe("Y-5Qxu900sw");
    expect(idDoYoutube("https://youtube.com/shorts/abcdef123")).toBe("abcdef123");
    expect(idDoYoutube("https://www.instagram.com/reel/x")).toBeNull();
  });

  it("do YouTube, com o canal como crédito e o idioma da fala; de fora, pede o crédito", () => {
    const v = videoDoLink("https://youtu.be/Y-5Qxu900sw", { titulo: "Trump on Dana White", canal: "C-SPAN" }, {});
    expect(v).toMatchObject({ fonte: "youtube", origemId: "Y-5Qxu900sw", credito: "C-SPAN", idioma: "en", permalink: "https://www.youtube.com/watch?v=Y-5Qxu900sw" });
    expect(videoDoLink("https://www.instagram.com/reel/abc", null, {})).toHaveProperty("erro");
    expect(videoDoLink("https://www.instagram.com/reel/abc", null, { credito: "cnnbrasil", idioma: "pt" })).toMatchObject({ fonte: "link", autor: "cnnbrasil", idioma: "pt" });
  });
});
