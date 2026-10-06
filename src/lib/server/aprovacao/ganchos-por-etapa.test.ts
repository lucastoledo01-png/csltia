import { describe, expect, it, vi } from "vitest";
import type { Project } from "../projects";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { ResultadoVisual } from "../visual/tipos";
import type { PostGerado } from "../social/gerador";
import { carregarConfigEditorial } from "../editorial/config";
import { papeisPara } from "../social/carrossel/estrutura";
import type { Aprovacao, ContextoDeProducao, Etapa, PautaDoContexto, Ramo } from "./contrato";
import { criarGanchosDeProducao, type MundoDosGanchos } from "./ganchos-de-producao";
import { CARROSSEL_SEM_FORMA, type MundoDaRefacao } from "./ganchos-por-etapa";
import { executarRefacao } from "./refazer";
import { supabaseFalso, type Operacao, type Resposta } from "./supabase-falso";

/**
 * Os ganchos de 06/10/2026, contra um banco de mentira e dublês das funções
 * do ciclo. Cada um tem o seu "sim" e o seu "não", e todo "não" diz por quê.
 *
 * As escritas são conferidas pela lista de operações do banco falso: a
 * refação de uma peça só escreve na linha DELA (decisão do dono, refação por
 * peça e por canal).
 */

const PROJETO = {
  id: "proj-1",
  slug: "desbuguei",
  name: "eua",
  niche: "EUA",
  timezone: "America/Sao_Paulo",
  editorialPromptExtra: "",
  brand: { displayName: "eua.journal" },
  settings: {},
} as unknown as Project;

const PACOTE = { verified_facts: ["O Fed cortou os juros."], source_urls: [], texto_de_origem: "" } as unknown as PacoteFactual;

function pauta(id: string, titulo = `Pauta ${id}`): PautaDoContexto {
  return {
    storyId: id,
    titulo,
    url: `https://fonte.com/${id}`,
    fonteNome: "fonte.com",
    publicadoEm: "",
    resumo: `Texto da pauta ${id}.`,
    categoria: "economia",
    eixo: "economia",
    pais: "EUA",
    atores: ["Fed"],
    lugares: [],
    acontecimento: [],
  };
}

function candidata(id: string, extra: Partial<CandidataPersistida> = {}): CandidataPersistida {
  return {
    id: `c-${id}`,
    projectId: "proj-1",
    storyId: id,
    url: `https://fonte.com/${id}`,
    canonicalUrl: null,
    sourceDomain: "fonte.com",
    sourceKey: null,
    title: `Pauta ${id}`,
    summary: `Texto da pauta ${id}.`,
    status: "approved",
    classificacao: {
      pais: "EUA",
      imigracao: false,
      eixo: "economia",
      atores: [],
      lugares: [],
      acontecimento: [],
      relevancia: 7,
    } as unknown as CandidataPersistida["classificacao"],
    classificationStatus: "done",
    classifiedAt: null,
    eventFingerprint: null,
    topicId: null,
    editorialScore: 60,
    decisionReason: null,
    sourceResolved: true,
    enrichmentStatus: "done",
    factualPackage: PACOTE,
    embedding: null,
    verificacao: null,
    assinatura: null,
    ...extra,
  };
}

function aprovacao(ramo: Ramo, resumo: Aprovacao["resumo"] = {}, pecaId = `${ramo}-1`): Aprovacao {
  return {
    id: `ap-${ramo}`,
    projectId: "proj-1",
    ramo,
    pecaId,
    hashArtefato: "h",
    publicarEm: "2026-10-07T14:45:00.000Z",
    estado: "refazendo",
    automatica: false,
    decididoPor: null,
    decididoEm: null,
    motivo: null,
    etapaCulpada: null,
    refazimentos: 1,
    avisos: [],
    resumo,
    avisadoEm: null,
    liberadoEm: null,
    createdAt: "",
    updatedAt: "",
  };
}

function foto(url: string): ResultadoVisual {
  return { storyId: "x", status: "SELECTED", asset: { imageUrl: url, attribution: "Foto: Fulano", metadata: {} } } as unknown as ResultadoVisual;
}

function postGerado(headline: string, carrossel = false): PostGerado {
  return {
    pauta: {} as PostGerado["pauta"],
    copy: { headline, gancho: "g", cta: "Comente NEWS", slides: carrossel ? [{ titulo: "s1" }, { titulo: "s2" }] : undefined } as never,
    ...(carrossel
      ? { carrossel: { estrutura: "explainer", papeis: papeisPara("explainer", 4, true), slides: [{}, {}] as never, claims: [], removidos: [] } }
      : {}),
    veredicto: {
      passed: true,
      issues: [],
      repairableIssues: [],
      fatalIssues: [],
      attempts: 1,
      finalDecision: "publicar",
      legendaFinal: "Legenda nova",
      hashtagsFinais: ["#EUA"],
    },
    tentativas: 1,
    tokens: 0,
    custoUsd: 0,
    reparosAplicados: [],
  };
}

type Tabelas = Record<string, Record<string, unknown>[]>;

/**
 * O mundo inteiro de mentira. O banco responde pelas linhas de `tabelas`
 * (filtrando por `id` quando a consulta pede) e aplica as escritas nelas, para
 * a etapa seguinte (a arte, depois do texto) ler o que a anterior gravou.
 */
function mundo(tabelas: Tabelas, extra: Partial<MundoDosGanchos & MundoDaRefacao> = {}) {
  const responder = (op: Operacao): Resposta => {
    const linhas = tabelas[op.tabela] ?? [];
    const porId = op.filtros.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
    const alvo = porId !== undefined ? linhas.filter((l) => l.id === porId) : linhas;
    if (op.tipo === "update") {
      for (const l of alvo) Object.assign(l, op.valores as Record<string, unknown>);
      return { data: alvo.map((l) => ({ id: l.id })) };
    }
    if (op.unico) return { data: alvo[0] ?? null };
    return { data: alvo };
  };
  const banco = supabaseFalso(responder);
  const candidatas = new Map<string, CandidataPersistida>(
    ["a", "b", "c", "d", "imig", "e"].map((id) => [id, candidata(id)] as const),
  );
  candidatas.set(
    "imig",
    candidata("imig", { classificacao: { ...candidata("imig").classificacao!, imigracao: true, eixo: "imigracao" } as never }),
  );
  const m: MundoDosGanchos & MundoDaRefacao = {
    client: () => banco.client,
    projeto: async () => PROJETO,
    vozDoArtigo: async () => "VOZ",
    escrever: vi.fn(async () => {
      throw new Error("o redator do artigo não devia ser chamado aqui");
    }),
    renderizarHtml: () => "<p/>",
    imagem: vi.fn(async () => foto("https://x/nova.jpg")),
    congelar: vi.fn(async () => ({
      ok: true as const,
      artefato: { url: "https://x/arte.png", path: "p", filename: "f", mime: "image/png", sha256: "b".repeat(64), bytes: 1, largura: 1, altura: 1, otimizado: false },
    })),
    congelarCarrossel: vi.fn(async (e: { slides: unknown[] }) => ({
      ok: true as const,
      artefatos: e.slides.map((_, i) => ({
        index: i + 1,
        url: `https://x/s${i + 1}.png`,
        path: "p",
        filename: `s${i + 1}.png`,
        mime: "image/png",
        sha256: String(i + 1).repeat(64),
        bytes: 1,
        largura: 1,
        altura: 1,
        otimizado: false,
      })),
    })),
    candidatasPorStory: vi.fn(async (_p: string, ids: string[]) => new Map(ids.filter((i) => candidatas.has(i)).map((i) => [i, candidatas.get(i)!]))),
    candidatasPorUrl: vi.fn(async (_p: string, urls: string[]) => {
      const mapa = new Map<string, CandidataPersistida>();
      for (const u of urls) for (const c of candidatas.values()) if (c.url === u) mapa.set(u, c);
      return mapa;
    }),
    poolDoDia: vi.fn(async () => [...candidatas.values()]),
    historico: vi.fn(async () => []),
    config: () => carregarConfigEditorial({}),
    montarPacote: vi.fn(async () => PACOTE),
    fotoDaPauta: vi.fn(async () => foto("https://x/da-pauta.jpg")),
    marcaDoPost: vi.fn(async (_p: Project, instrucao: string) => ({ nome: "eua", nicho: "EUA", extra: `VOZ DO POST\n\n${instrucao}`, keyword: "NEWS" })),
    gerarPost: vi.fn(async () => ({ post: postGerado("Manchete nova sobre o Fed nos EUA"), descarte: null })),
    produzirPost: vi.fn(async ({ pool }: { pool: Array<{ storyId: string }> }) => ({
      ok: true as const,
      storyId: pool[0].storyId,
      linha: {
        id: "post-novo",
        title: "Post novo",
        caption: "Legenda",
        scheduled_at: "2026-10-07T11:00:00.000Z",
        slides_manifest: [{ index: 1, sha256: "c".repeat(64), url: "https://x/n.png" }],
        content_json: {},
      },
    })),
    produzirArtigo: vi.fn(async () => ({ ok: false as const, motivo: "não usado" })),
    reescreverNewsletter: vi.fn(async () => ({
      ok: true as const,
      edicao: { subject: "Assunto novo da edição", stories: [{ title: "h1" }, { title: "h2" }] },
      html: "<html>nova</html>",
      avisos: [],
    })),
    renderizarNewsletter: vi.fn(async () => "<html>fotos novas</html>"),
    agora: () => 2_000,
    ...extra,
  };
  return { m, ops: banco.ops, tabelas };
}

const escritas = (ops: Operacao[]) => ops.filter((o) => o.tipo !== "select");

function ctx(a: Aprovacao, etapa: Etapa, extra: { alvo?: string; motivo?: string } = {}) {
  return { aprovacao: a, etapa, motivo: extra.motivo ?? "manchete sem destinatário", naoRepetir: "NÃO REPETIR: sigla solta", alvo: extra.alvo ?? null };
}

const CONTEXTO_POST: ContextoDeProducao = { versao: 1, data: "2026-10-07", pautas: [pauta("a")], pacotes: { a: PACOTE }, pool: ["a", "b", "c"], posicao: 2 };

function linhaDoPost(extra: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    story_id: "a",
    title: "Manchete velha",
    caption: "Legenda velha",
    edition_date: "2026-10-07",
    status: "draft",
    asset_paths: ["https://x/velha.png"],
    content_json: { copy: { headline: "Manchete velha", gancho: "g" }, arte: { eixo: "economia" }, visual: { imageUrl: "https://x/foto.jpg", attribution: "Foto: Ciclana" } },
    ...extra,
  };
}

describe("texto do post", () => {
  it("reescreve pelo gerador do ciclo com a memória e o motivo, grava só o post e a arte recongela", async () => {
    const tabelas: Tabelas = { social_posts: [linhaDoPost()] };
    const { m, ops } = mundo(tabelas);
    const r = await executarRefacao(
      { ...ctx(aprovacao("post", { contexto: CONTEXTO_POST }), "texto") },
      criarGanchosDeProducao(m),
    );
    expect(r).toMatchObject({ ok: true, executadas: ["texto", "arte"] });

    const instrucao = (m.marcaDoPost as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(instrucao).toContain("NÃO REPETIR: sigla solta");
    expect(instrucao).toContain("manchete sem destinatário");
    const [, posicao, opcoes] = (m.gerarPost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(posicao).toBe(2);
    expect(opcoes).toMatchObject({ pacote: PACOTE, carrossel: null });

    // O crédito da foto continua no fim da legenda, e a manchete nova vai para a arte.
    expect(tabelas.social_posts[0].caption).toMatch(/^Legenda nova/);
    expect(tabelas.social_posts[0].caption).toContain("Ciclana");
    const congelado = (m.congelar as ReturnType<typeof vi.fn>).mock.calls[0][0] as { capa: { headline: string; asset: { attribution: string } } };
    expect(congelado.capa.headline).toBe("Manchete nova sobre o Fed nos EUA");
    expect(congelado.capa.asset.attribution).toBe("Foto: Ciclana");

    // Só a linha deste post foi escrita: nenhuma matéria, nenhuma edição.
    expect(new Set(escritas(ops).map((o) => o.tabela))).toEqual(new Set(["social_posts"]));
    expect(m.imagem).not.toHaveBeenCalled();
  });

  it("guarda do post recusou a reescrita: nada é gravado, e o motivo vem junto", async () => {
    const { m, ops } = mundo(
      { social_posts: [linhaDoPost()] },
      { gerarPost: vi.fn(async () => ({ post: null, descarte: { motivo: "descartada sem reparo: PAIS_AMBIGUO" } as never })) },
    );
    const r = await criarGanchosDeProducao(m).post!.texto!(ctx(aprovacao("post", { contexto: CONTEXTO_POST }), "texto"));
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("PAIS_AMBIGUO") });
    expect(escritas(ops)).toHaveLength(0);
  });

  it("post antigo sem contexto: remonta a pauta de news_candidates e guarda o contexto remontado", async () => {
    const { m } = mundo({ social_posts: [linhaDoPost()] });
    const r = await criarGanchosDeProducao(m).post!.texto!(ctx(aprovacao("post"), "texto"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resumo?.contexto?.reconstruido).toMatch(/news_candidates/);
  });

  it("post antigo cuja pauta não está mais em news_candidates: diz por quê, sem escrever", async () => {
    const { m, ops } = mundo({ social_posts: [linhaDoPost({ story_id: "sumiu" })] });
    const r = await criarGanchosDeProducao(m).post!.texto!(ctx(aprovacao("post"), "texto"));
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("não está em news_candidates") });
    expect(escritas(ops)).toHaveLength(0);
  });
});

describe("carrossel", () => {
  const forma = { estrutura: "explainer", slides: 4, papeis: papeisPara("explainer", 4, true) };
  const carrossel = (cj: Record<string, unknown> = {}) =>
    linhaDoPost({
      asset_paths: ["1", "2", "3", "4"],
      content_json: {
        formato: "carousel",
        copy: { headline: "Manchete velha", gancho: "g", cta: "Comente NEWS", slides: [{ titulo: "a" }, { titulo: "b" }] },
        arte: { eixo: "economia" },
        visual: { imageUrl: "https://x/foto.jpg", attribution: "" },
        ...cj,
      },
    });

  it("gravado antes de 06/10/2026, sem a forma: texto, imagem e arte dizem que não dá", async () => {
    const { m, ops } = mundo({ social_posts: [carrossel()] });
    const g = criarGanchosDeProducao(m);
    for (const etapa of ["texto", "imagem", "arte"] as const) {
      const r = await g.post![etapa]!(ctx(aprovacao("post", { contexto: CONTEXTO_POST }), etapa));
      expect(r).toEqual({ ok: false, motivo: CARROSSEL_SEM_FORMA });
    }
    expect(escritas(ops)).toHaveLength(0);
  });

  it("texto: reescreve slide a slide na mesma estrutura, e a arte recongela TODAS as telas", async () => {
    const tabelas: Tabelas = { social_posts: [carrossel({ carrossel: forma })] };
    const { m } = mundo(tabelas, {
      gerarPost: vi.fn(async () => ({ post: postGerado("Manchete nova do carrossel sobre os EUA", true), descarte: null })),
    });
    const r = await executarRefacao(ctx(aprovacao("post", { contexto: CONTEXTO_POST }), "texto"), criarGanchosDeProducao(m));
    expect(r).toMatchObject({ ok: true, executadas: ["texto", "arte"] });
    const opcoes = (m.gerarPost as ReturnType<typeof vi.fn>).mock.calls[0][2] as { carrossel: { formato: string; estrutura: string; slides: number } };
    expect(opcoes.carrossel).toMatchObject({ formato: "carousel", estrutura: "explainer", slides: 4 });
    const telas = (m.congelarCarrossel as ReturnType<typeof vi.fn>).mock.calls[0][0] as { slides: unknown[] };
    expect(telas.slides).toHaveLength(papeisPara("explainer", 4, true).length);
    expect((tabelas.social_posts[0].slides_manifest as unknown[]).length).toBe(telas.slides.length);
    expect(m.congelar).not.toHaveBeenCalled();
  });

  it("imagem: troca a foto da capa e recongela as telas, sem chamar o redator", async () => {
    const tabelas: Tabelas = { social_posts: [carrossel({ carrossel: forma })] };
    const { m } = mundo(tabelas);
    const r = await executarRefacao(ctx(aprovacao("post", { contexto: CONTEXTO_POST }), "imagem"), criarGanchosDeProducao(m));
    expect(r).toMatchObject({ ok: true, executadas: ["imagem", "arte"] });
    expect(m.gerarPost).not.toHaveBeenCalled();
    expect(m.congelarCarrossel).toHaveBeenCalledTimes(1);
  });
});

describe("imagem nunca chama o redator", () => {
  it("post de peça única: imagem e arte, e nem o gerador do post nem o do artigo são chamados", async () => {
    const { m } = mundo({ social_posts: [linhaDoPost()] });
    const r = await executarRefacao(ctx(aprovacao("post", { contexto: CONTEXTO_POST }), "imagem"), criarGanchosDeProducao(m));
    expect(r).toMatchObject({ ok: true, executadas: ["imagem", "arte"] });
    expect(m.gerarPost).not.toHaveBeenCalled();
    expect(m.escrever).not.toHaveBeenCalled();
    // A foto nova é da peça (`imagem`, com ignorarReuso), e não a compartilhada da pauta.
    expect(m.imagem).toHaveBeenCalledTimes(1);
    expect(m.fotoDaPauta).not.toHaveBeenCalled();
  });

  it("newsletter: só o HTML é redesenhado, a redação não roda", async () => {
    const contexto: ContextoDeProducao = {
      versao: 1,
      data: "2026-10-07",
      pautas: [pauta("a", "Fed corta juros"), pauta("b", "Desemprego cai no Brasil")],
      imagens: { a: "https://x/a.jpg", b: "https://x/b.jpg" },
      legendas: {},
    };
    const tabelas: Tabelas = { news_editions: [{ id: "newsletter-1", subject: "s", stories: [] }] };
    const { m, ops } = mundo(tabelas);
    const r = await criarGanchosDeProducao(m).newsletter!.imagem!(ctx(aprovacao("newsletter", { contexto }), "imagem", { alvo: "b" }));
    expect(r.ok).toBe(true);
    expect(m.reescreverNewsletter).not.toHaveBeenCalled();
    expect(m.imagem).toHaveBeenCalledTimes(1);
    expect((m.imagem as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ storyId: "b" });
    if (r.ok) expect(r.resumo?.contexto?.imagens).toEqual({ a: "https://x/a.jpg", b: "https://x/nova.jpg" });
    expect(tabelas.news_editions[0].content_html).toBe("<html>fotos novas</html>");
    expect(escritas(ops).map((o) => o.tabela)).toEqual(["news_editions"]);
  });
});

describe("seleção do post: outra pauta, pelo ciclo social", () => {
  it("passa ao ciclo só as pautas que servem ao canal, e devolve a substituta com o hash da linha", async () => {
    const { m } = mundo({
      social_posts: [
        { id: "post-1", story_id: "a", event_fingerprint: null },
        { id: "post-2", story_id: "b", event_fingerprint: null },
      ],
    });
    const r = await criarGanchosDeProducao(m).post!.selecao!(
      ctx(aprovacao("post", { contexto: { ...CONTEXTO_POST, pool: ["a", "b", "imig", "c", "d"] } }), "selecao"),
    );
    expect(r.ok).toBe(true);
    const pool = (m.produzirPost as ReturnType<typeof vi.fn>).mock.calls[0][0].pool as Array<{ storyId: string }>;
    // Fora: a reprovada (a), a que o canal já tem (b) e a de imigração.
    expect(pool.map((p) => p.storyId)).toEqual(["c", "d"]);
    if (r.ok) {
      expect(r.substituta).toMatchObject({ ramo: "post", pecaId: "post-novo", publicarEm: "2026-10-07T14:45:00.000Z" });
      expect(r.substituta!.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.substituta!.resumo.contexto?.recusadas).toContain("a");
    }
  });

  it("mesmo acontecimento de um post do dia (cosseno acima de 0.70) não entra", async () => {
    const { m } = mundo({ social_posts: [{ id: "post-1", story_id: "a" }] });
    const vetor = [1, 0, 0];
    (m.candidatasPorStory as ReturnType<typeof vi.fn>).mockImplementation(async (_p: string, ids: string[]) =>
      new Map(ids.map((i) => [i, candidata(i, { embedding: i === "c" ? [0, 1, 0] : vetor })])),
    );
    const r = await criarGanchosDeProducao(m).post!.selecao!(ctx(aprovacao("post", { contexto: { ...CONTEXTO_POST, pool: ["b", "c"] } }), "selecao"));
    expect(r.ok).toBe(true);
    const pool = (m.produzirPost as ReturnType<typeof vi.fn>).mock.calls[0][0].pool as Array<{ storyId: string }>;
    expect(pool.map((p) => p.storyId)).toEqual(["c"]);
  });

  it("nenhuma pauta serve: diz quantas foram conferidas e por que caíram", async () => {
    const { m } = mundo({ social_posts: [{ id: "post-1", story_id: "a" }] });
    const r = await criarGanchosDeProducao(m).post!.selecao!(ctx(aprovacao("post", { contexto: { ...CONTEXTO_POST, pool: ["a", "imig"] } }), "selecao"));
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/nenhuma outra pauta.*1 já no canal, 1 imigração/) });
    expect(m.produzirPost).not.toHaveBeenCalled();
  });
});

describe("seleção do artigo", () => {
  it("tenta a seguinte quando a primeira não vira matéria, e devolve a substituta", async () => {
    const produzir = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, motivo: "REJECT_NO_PHOTO" })
      .mockResolvedValueOnce({
        ok: true,
        linha: { id: "art-novo", title: "Matéria nova", content_html: "<p>x</p>", cover_image: "https://x/c.jpg" },
        peca: {
          ramo: "artigo",
          referenciaId: "materia-nova-2026-10-07",
          storyIds: ["c"],
          titulo: "Matéria nova",
          avisos: [],
          aprovadaPeloAuditor: true,
          bloqueios: [],
          hashDoArtefato: "x",
          conteudo: { slug: "materia-nova-2026-10-07", artigo: { titulo: "Matéria nova" }, fonte: { url: "u" }, publicarEm: "p", capa: "https://x/c.jpg" },
        },
      });
    const { m } = mundo({ articles: [{ id: "artigo-1", slug: "velha-2026-10-07", source_urls: ["https://fonte.com/a"] }] }, { produzirArtigo: produzir });
    const contexto: ContextoDeProducao = { versao: 1, data: "2026-10-07", pautas: [pauta("a")], pool: ["a", "b", "c"] };
    const r = await criarGanchosDeProducao(m).artigo!.selecao!(ctx(aprovacao("artigo", { contexto }), "selecao"));
    expect(produzir).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: true, substituta: { ramo: "artigo", pecaId: "art-novo" } });
  });

  it("a matéria que é a edição da newsletter (antiga): não dá, e diz o que fazer", async () => {
    const { m } = mundo({ articles: [{ id: "artigo-1", slug: "edicao-2026-10-01", source_urls: [] }] });
    const r = await criarGanchosDeProducao(m).artigo!.selecao!(ctx(aprovacao("artigo"), "selecao"));
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("edição da newsletter") });
  });
});

describe("newsletter", () => {
  const contexto: ContextoDeProducao = {
    versao: 1,
    data: "2026-10-07",
    pautas: [pauta("a", "Fed corta juros nos EUA"), pauta("b", "Desemprego cai no Brasil")],
    pacotes: { a: PACOTE, b: PACOTE },
    imagens: { a: "https://x/a.jpg", b: "https://x/b.jpg" },
    legendas: {},
    pool: ["a", "b", "c", "d"],
  };

  it("texto: a redação de novo, com a memória e o motivo, e o Listmonk não é tocado", async () => {
    const tabelas: Tabelas = { news_editions: [{ id: "newsletter-1" }] };
    const { m, ops } = mundo(tabelas);
    const r = await criarGanchosDeProducao(m).newsletter!.texto!(ctx(aprovacao("newsletter", { contexto }), "texto", { alvo: "b" }));
    expect(r.ok).toBe(true);
    const e = (m.reescreverNewsletter as ReturnType<typeof vi.fn>).mock.calls[0][0] as { instrucao: string; pautas: PautaDoContexto[] };
    expect(e.instrucao).toContain("NÃO REPETIR: sigla solta");
    expect(e.instrucao).toContain("manchete sem destinatário");
    expect(e.instrucao).toContain("Desemprego cai no Brasil");
    expect(e.pautas.map((p) => p.storyId)).toEqual(["a", "b"]);
    expect(tabelas.news_editions[0]).toMatchObject({ subject: "Assunto novo da edição", content_html: "<html>nova</html>" });
    expect(escritas(ops).map((o) => o.tabela)).toEqual(["news_editions"]);
  });

  it("edição antiga sem a foto gravada: o texto não é refeito, e a tela diz o que fazer", async () => {
    const { m, ops } = mundo({ news_editions: [{ id: "newsletter-1" }] });
    const r = await criarGanchosDeProducao(m).newsletter!.texto!(
      ctx(aprovacao("newsletter", { contexto: { ...contexto, imagens: { a: "https://x/a.jpg" } } }), "texto"),
    );
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("reprove a IMAGEM dessa pauta primeiro") });
    expect(escritas(ops)).toHaveLength(0);
  });

  it("seleção sem dizer qual pauta sai: não troca nenhuma no escuro", async () => {
    const { m } = mundo({ news_editions: [{ id: "newsletter-1" }] });
    const r = await criarGanchosDeProducao(m).newsletter!.selecao!(
      ctx(aprovacao("newsletter", { contexto }), "selecao", { motivo: "uma das pautas não é para nós" }),
    );
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("QUAL pauta sai") });
    expect(m.reescreverNewsletter).not.toHaveBeenCalled();
  });

  it("seleção com a pauta apontada: entra a próxima com foto e pacote, no MESMO lugar, e a que saiu não volta", async () => {
    const tabelas: Tabelas = { news_editions: [{ id: "newsletter-1" }] };
    const { m } = mundo(tabelas, {
      fotoDaPauta: vi.fn(async (p: { storyId: string }) => (p.storyId === "c" ? ({ status: "NO_VALID_IMAGE" } as never) : foto(`https://x/${p.storyId}.jpg`))),
    });
    const r = await criarGanchosDeProducao(m).newsletter!.selecao!(ctx(aprovacao("newsletter", { contexto }), "selecao", { alvo: "a" }));
    expect(r.ok).toBe(true);
    const e = (m.reescreverNewsletter as ReturnType<typeof vi.fn>).mock.calls[0][0] as { pautas: PautaDoContexto[]; imagens: Record<string, string>; instrucao: string };
    // c caiu por falta de foto; d entra no lugar de a, na primeira posição.
    expect(e.pautas.map((p) => p.storyId)).toEqual(["d", "b"]);
    expect(e.imagens).toEqual({ b: "https://x/b.jpg", d: "https://x/d.jpg" });
    expect(e.instrucao).toContain("saiu da edição por decisão do editor");
    if (r.ok) expect(r.resumo?.contexto?.recusadas).toEqual(["a"]);
  });
});
