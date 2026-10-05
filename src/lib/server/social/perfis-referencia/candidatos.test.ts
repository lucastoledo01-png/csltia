import { describe, expect, it, vi } from "vitest";
import { avaliarPautas } from "../../editorial/guarda";
import { carregarConfigEditorial, MOTIVOS } from "../../editorial/config";
import type { Classificacao } from "../../editorial/classificador";
import type { NewsCandidate } from "../../newsroom/collector";
import type { NewsSourceConfig } from "../../newsroom/news-sources";
import { candidatosDosPerfisDeReferencia, lerPerfisDeReferencia, type DependenciasDosPerfis } from "./candidatos";
import type { LeituraDoPerfil, PostDoPerfil } from "./graph";
import type { LeituraParaGravar, PerfilDeReferencia, PerfisStore } from "./store";
import { ETAPA_DO_TOPICO, RAMO } from "./topico";

const AGORA = new Date("2026-10-05T18:00:00Z");
const config = carregarConfigEditorial({});

const CORPO =
  "O Federal Reserve manteve a taxa básica de juros americana nesta quarta-feira, na faixa de 4,25% a 4,5%, " +
  "e sinalizou dois cortes até o fim do ano. A decisão foi unânime entre os doze membros do comitê. O " +
  "presidente do banco central afirmou que a inflação de serviços desacelerou por três meses seguidos e que " +
  "o mercado de trabalho segue aquecido, com 210 mil vagas criadas em setembro. A bolsa de Nova York subiu " +
  "1,2% depois do anúncio, e o dólar caiu frente às principais moedas.";

function posts(): PostDoPerfil[] {
  const base = (id: string, curtidas: number, horas: number, legenda = "Legenda de um post comum do perfil"): PostDoPerfil => ({
    id,
    legenda,
    curtidas,
    comentarios: 5,
    publicadoEm: new Date(AGORA.getTime() - horas * 3600 * 1000).toISOString(),
    tipo: "IMAGE",
    permalink: `https://www.instagram.com/p/${id}/`,
  });
  return [
    base("a", 100, 10),
    base("b", 120, 20),
    base("c", 90, 30),
    base("d", 110, 40),
    base("e", 105, 50),
    base("f", 95, 60),
    base("viral1", 2000, 5, "JUROS. Fed mantém taxa e sinaliza dois cortes"),
    base("viral2", 1500, 6, "VISTOS. Mudança na loteria do H-1B"),
  ];
}

function leituraOk(handle: string): LeituraDoPerfil {
  return {
    handle,
    status: "ok",
    httpStatus: 200,
    codigoDeErro: null,
    subcodigoDeErro: null,
    mensagemDeErro: null,
    seguidores: 100000,
    posts: posts(),
  };
}

function storeFalso(perfis: PerfilDeReferencia[]) {
  const gravadas: LeituraParaGravar[] = [];
  const store: PerfisStore = {
    listar: vi.fn(async () => perfis),
    criar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
    gravarLeituras: vi.fn(async (l: LeituraParaGravar[]) => {
      gravadas.push(...l);
      return l.length;
    }),
    ultimasLeituras: vi.fn(),
  } as unknown as PerfisStore;
  return { store, gravadas };
}

function perfil(handle: string): PerfilDeReferencia {
  return { id: `id-${handle}`, projectId: "p1", handle, nota: "", ativo: true, criadoEm: "" };
}

function candidata(id: string, fonte: NewsSourceConfig, url: string, title: string): NewsCandidate {
  return {
    id,
    url,
    title,
    source_name: fonte.name,
    priority: 2,
    published_at: AGORA.toISOString(),
    description: CORPO,
    content: "",
    category: fonte.category,
    score: 0,
    dedupe_key: id,
    window_hours: 24,
  };
}

function classificacao(over: Partial<Classificacao>): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: false,
    leitura: "oportunidade",
    eixo: "economia",
    natureza: "official_action",
    relevancia: 8,
    atores: ["Federal Reserve"],
    lugares: ["EUA"],
    acontecimento: ["decisão de juros"],
    justificativa: "",
    ...over,
  };
}

function classificadorDevolve(pautas: Classificacao[]) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        id: "x",
        choices: [{ message: { content: JSON.stringify({ pautas }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch;
}

/**
 * Dependências com a guarda REAL. Só a rede é falsa: a Meta, o modelo de
 * assunto, a busca e o classificador. É o que prova que a pauta vinda do
 * perfil passa pela mesma régua de qualquer outra.
 */
function deps(over: Partial<DependenciasDosPerfis> = {}, perfis = [perfil("braziljournal")]) {
  const { store, gravadas } = storeFalso(perfis);
  const coletar = vi.fn(async (fontes: NewsSourceConfig[]) => {
    const [juros] = fontes;
    return [
      candidata("c-fed", juros, "https://www.reuters.com/markets/fed-holds-rates", "Fed holds rates, signals two cuts"),
      candidata("c-insta", juros, "https://www.instagram.com/p/viral1/", "post do perfil"),
      candidata("c-visa", juros, "https://www.cnbc.com/h1b-visa-lottery", "H-1B visa lottery changes"),
    ];
  });
  const d: DependenciasDosPerfis = {
    store,
    credencial: async () => ({ accountId: "1", accessToken: "t" }),
    lerPerfil: vi.fn(async (h: string) => leituraOk(h)),
    extrair: vi.fn(async () => ({
      topicos: [
        { postId: "viral1", assunto: "Fed mantém juros", eixo: "economia", consulta: "Fed holds rates", idioma: "en" as const, descartado: null },
        { postId: "viral2", assunto: "Loteria do H-1B muda", eixo: "trabalho", consulta: "H-1B lottery", idioma: "en" as const, descartado: "imigração está fora da linha editorial desde 05/10/2026" },
      ],
      custoUsd: 0.0003,
      tokens: 1200,
      etapa: ETAPA_DO_TOPICO,
      ramo: RAMO,
      erro: null,
    })),
    coletar,
    avaliar: (grupos) =>
      avaliarPautas(grupos, {
        canal: "instagram",
        historico: [],
        config,
        env: { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" },
        fetcher: classificadorDevolve([
          classificacao({ id: "c-fed" }),
          // O classificador rotula a pauta de visto, e `decidirPauta` recusa.
          classificacao({ id: "c-visa", imigracao: true, eixo: "imigracao", atores: ["USCIS"] }),
        ]),
      }),
    agora: () => AGORA,
    ...over,
  };
  return { d, gravadas, store, coletar };
}

const ENFORCE = { id: "p1", settings: { capacidades: { perfis_referencia: "enforce" } } };
const ENSAIO = { id: "p1", settings: { capacidades: { perfis_referencia: "dry_run" } } };

describe("perfis de referência, do sinal à pauta", () => {
  it("desligado não lê perfil, não grava e não chama ninguém", async () => {
    const { d, store, coletar } = deps();
    const r = await lerPerfisDeReferencia({ id: "p1", settings: {} }, d);
    expect(r.modo).toBe("off");
    expect(store.listar).not.toHaveBeenCalled();
    expect(coletar).not.toHaveBeenCalled();
    expect(await candidatosDosPerfisDeReferencia({ id: "p1", settings: null })).toEqual([]);
  });

  it("a pauta só nasce da fonte primária, e passa pela guarda inteira", async () => {
    const { d, gravadas, coletar } = deps();
    const r = await lerPerfisDeReferencia(ENFORCE, d);

    // Só o assunto não descartado vira busca.
    expect(r.buscas).toBe(1);
    expect(coletar.mock.calls[0][0][0].url).toContain("news.google.com");

    // NÃO: o post do Instagram que voltou na busca não vira pauta.
    expect(r.recusadasPorSerRedeSocial).toBe(1);
    expect(r.pautas.map((p) => p.grupo.primary.url)).toEqual(["https://www.reuters.com/markets/fed-holds-rates"]);
    expect(r.pautas.every((p) => !p.grupo.primary.url.includes("instagram.com"))).toBe(true);

    // NÃO: a pauta de visto que a busca trouxe é recusada pela linha editorial.
    expect(r.recusadasPelaGuarda).toBe(1);
    expect(r.motivosDaGuarda).toEqual({ [MOTIVOS.REJEITADO_IMIGRACAO]: 1 });

    // A origem fica rastreável até o post que deu o sinal.
    const origem = Object.values(r.origem)[0];
    expect(origem).toMatchObject({ handle: "braziljournal", postId: "viral1", consulta: "Fed holds rates" });

    // A leitura é gravada, com custo, etapa e ramo.
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({
      handle: "braziljournal",
      modo: "enforce",
      status: "ok",
      postsLidos: 8,
      candidatas: 2,
      aprovadas: 1,
      etapa: ETAPA_DO_TOPICO,
      ramo: RAMO,
    });
    expect(gravadas[0].custoUsd).toBeCloseTo(0.0003);
    expect(r.custos.map((c) => c.etapa)).toEqual(["perfis_referencia.topico", "perfis_referencia.classificacao"]);
  });

  it("NÃO: a guarda recusaria a pauta de visto mesmo sem a trava do assunto", async () => {
    const { d } = deps({
      coletar: async (fontes) => [
        candidata("c-visa", fontes[0], "https://www.cnbc.com/h1b-visa-lottery", "H-1B visa lottery changes"),
      ],
    });
    const fetcher = classificadorDevolve([classificacao({ id: "c-visa", imigracao: true, eixo: "imigracao" })]);
    const guarda = await avaliarPautas(
      [{ primary: candidata("c-visa", { name: "x", category: "us_media" } as NewsSourceConfig, "https://www.cnbc.com/h1b", "H-1B"), secondary_sources: [], secondary_urls: [] }],
      { canal: "instagram", historico: [], config, env: { OPENAI_API_KEY: "chave" }, fetcher },
    );
    expect(guarda.approvedEditorialPool).toEqual([]);
    expect(guarda.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_IMIGRACAO);

    const r = await lerPerfisDeReferencia(ENFORCE, { ...d, avaliar: async () => guarda });
    expect(r.pautas).toEqual([]);
  });

  it("perfil que virou conta pessoal é gravado com o motivo e não derruba os outros", async () => {
    const lerPerfil = vi.fn(async (h: string): Promise<LeituraDoPerfil> =>
      h === "contapessoal"
        ? {
            handle: h,
            status: "nao_encontrado_ou_nao_business",
            httpStatus: 400,
            codigoDeErro: 110,
            subcodigoDeErro: 2207013,
            mensagemDeErro: "Invalid user id",
            seguidores: null,
            posts: [],
          }
        : leituraOk(h),
    );
    const { d, gravadas } = deps({ lerPerfil }, [perfil("contapessoal"), perfil("braziljournal")]);
    const r = await lerPerfisDeReferencia(ENFORCE, d);

    expect(gravadas.map((g) => [g.handle, g.status])).toEqual([
      ["contapessoal", "nao_encontrado_ou_nao_business"],
      ["braziljournal", "ok"],
    ]);
    expect(gravadas[0].codigoDeErro).toBe(110);
    expect(r.pautas).toHaveLength(1);
  });

  it("busca que quebra não apaga a leitura gravada", async () => {
    const { d, gravadas } = deps({
      coletar: async () => {
        throw new Error("Google News fora do ar");
      },
    });
    const r = await lerPerfisDeReferencia(ENFORCE, d);
    expect(r.pautas).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/Google News fora do ar/);
    expect(gravadas).toHaveLength(1);
  });

  it("ensaio calcula e grava, e não entrega nada ao feed", async () => {
    const { d, gravadas } = deps();
    const r = await lerPerfisDeReferencia(ENSAIO, d);
    expect(r.modo).toBe("dry_run");
    expect(r.pautas).toHaveLength(1);
    expect(gravadas[0].modo).toBe("dry_run");

    // O contrato com o feed: em dry_run a resposta é vazia.
    const entregues = await candidatosDosPerfisDeReferencia(ENSAIO, { deps: d });
    expect(entregues).toEqual([]);
  });

  it("enforce entrega ao feed na forma do pool aprovado", async () => {
    const { d } = deps();
    const entregues = await candidatosDosPerfisDeReferencia(ENFORCE, { deps: d });
    expect(entregues).toHaveLength(1);
    expect(entregues[0]).toHaveProperty("classificacao");
    expect(entregues[0]).toHaveProperty("pontuacao");
    expect(entregues[0].classificacao.imigracao).toBe(false);
  });

  it("nunca lança: falha da rodada inteira vira lista vazia", async () => {
    const { d } = deps();
    const quebrado = {
      ...d,
      store: { ...d.store, listar: async () => { throw new Error("banco fora"); } } as unknown as PerfisStore,
    };
    await expect(candidatosDosPerfisDeReferencia(ENFORCE, { deps: quebrado })).resolves.toEqual([]);
  });

  it("NÃO: além do teto de itens por busca, nada segue para a classificação paga", async () => {
    const avaliar = vi.fn(async () => ({ approvedEditorialPool: [], recusadas: [], custoUsd: 0 }));
    const { d } = deps({
      avaliar,
      coletar: async (fontes) =>
        Array.from({ length: 30 }, (_, i) =>
          candidata(`c${i}`, fontes[0], `https://www.reuters.com/a/${i}`, `Assunto completamente diferente número ${i} ${"xyzw".repeat(i % 7)}`),
        ),
    });
    const r = await lerPerfisDeReferencia(ENFORCE, d, {
      limites: { maximoDePerfis: 15, maximoDeBuscas: 4, maximoDeItensPorBusca: 5 },
    });
    expect(r.candidatasColetadas).toBe(30);
    const grupos = (avaliar.mock.calls[0] as unknown as [unknown[]])[0];
    expect(grupos.length).toBeLessThanOrEqual(5);
  });

  it("respeita o teto de buscas somando todos os perfis", async () => {
    const extrair = vi.fn(async (h: string) => ({
      topicos: [
        { postId: "viral1", assunto: "a", eixo: "economia", consulta: `consulta um ${h}`, idioma: "en" as const, descartado: null },
        { postId: "viral2", assunto: "b", eixo: "economia", consulta: `consulta dois ${h}`, idioma: "en" as const, descartado: null },
      ],
      custoUsd: 0,
      tokens: 0,
      etapa: ETAPA_DO_TOPICO,
      ramo: RAMO,
      erro: null,
    }));
    const coletar = vi.fn(async (_fontes: NewsSourceConfig[]) => [] as NewsCandidate[]);
    const { d } = deps({ extrair, coletar }, [perfil("um"), perfil("dois"), perfil("tres")]);
    const r = await lerPerfisDeReferencia(ENFORCE, d, { limites: { maximoDePerfis: 15, maximoDeBuscas: 4, maximoDeItensPorBusca: 8 } });
    expect(r.buscas).toBe(4);
    expect(coletar.mock.calls[0][0]).toHaveLength(4);
  });
});
