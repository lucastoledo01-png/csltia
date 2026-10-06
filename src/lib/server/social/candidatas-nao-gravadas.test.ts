import { beforeEach, describe, expect, it, vi } from "vitest";
import { montarRegistroDoSocial } from "./diagnostico-gravado";

/**
 * A gravação das candidatas falhou, e os posts seguem (06/10/2026).
 *
 * Em 06/10/2026 o Instagram ficou sem nenhum post de notícia: qualquer erro da
 * camada de candidatas acendia `SOCIAL_PERSISTENCE_UNAVAILABLE` e a composição
 * cortava tudo. A antirrepetição já não dependia desta camada (lê
 * `social_posts`), mas uma guarda dependia, e é por isso que este teste roda o
 * entrypoint do cron, `rodarSocialDoDia`, e não só a composição: o Social Guard
 * só deixa sair notícia com veredito `confirm`, e lia esse veredito da linha
 * que a gravação não criou. Sem a prova em memória, tirar o bloqueio trocaria
 * um dia sem post por outro dia sem post.
 *
 * Os dublês são os da simulação pré-produção, com uma diferença: aqui o banco
 * pode NÃO ter as linhas das candidatas, que é o estado real de quando a
 * gravação falha.
 */

const confirmadas: unknown[] = [];
vi.mock("../editorial/finalistas", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  conferirFinalistas: () =>
    Promise.resolve({
      confirmadas,
      recusadas: [],
      emConflito: [],
      emRevisao: [],
      custoUsd: 0,
      tokens: 0,
      linhasDeLog: [],
    }),
}));

vi.mock("../editorial/pacote-factual", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  montarPacotesDasPautas: async () => ({ pacotes: new Map(), linhasDeLog: [] }),
}));

vi.mock("../visual/resolver", () => ({
  resolveVisualAsset: async () => ({
    status: "SELECTED",
    motivo: null,
    asset: {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foto_da_pauta.jpg",
      source: "wikimedia_commons",
      license: "CC BY 4.0",
      attribution: "Fulano, CC BY 4.0",
      metadata: {},
    },
    assetSecundario: null,
    recusados: [],
    fontesConsultadas: [],
    entidade: null,
  }),
}));

/** Se o banco tem as linhas das candidatas: falso é o estado de quando a gravação falhou. */
let linhasNoBanco = true;
vi.mock("../editorial/candidatos-store", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  criarCandidatosStore: () => ({
    buscarPorStoryIds: async (_p: string, ids: string[]) =>
      new Map(
        linhasNoBanco
          ? ids.map((id) => [
              id,
              { id: `cand-${id}`, status: "approved", verificacao: { status: "confirm", motivo: "confirmada" } },
            ])
          : [],
      ),
  }),
}));

const gravadas: Array<Record<string, unknown>> = [];
vi.mock("./social-posts-store", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    criarSocialPostsStore: () => ({
      doDia: async () => [],
      ultimasCapas: async () => [],
      gravar: async (posts: Array<Record<string, unknown>>) => {
        for (const p of posts) gravadas.push(p);
        return { gravados: posts.length, bloqueadosPorIdempotencia: [], erros: [], ids: posts.map((_, i) => `id-${i}`) };
      },
    }),
  };
});

const { rodarSocialDoDia } = await import("./ciclo-do-dia");

const clienteVazio = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ gte: async () => ({ data: [], error: null }) }),
        gte: async () => ({ data: [], error: null }),
      }),
    }),
  }),
} as never;

function pauta(id: string, titulo: string, ator: string) {
  return {
    storyId: id,
    grupo: {
      primary: { title: titulo, url: `https://www.uscis.gov/${id}`, source_name: "USCIS" },
      secondary_urls: [],
    },
    pontuacao: { total: 70, partes: {}, explicacao: "" },
    classificacao: {
      eixo: "economia",
      pais: "EUA",
      relevancia: 7,
      imigracao: false,
      atores: [ator],
      lugares: [],
      acontecimento: `acontecimento de ${id}`,
      topico: id,
    },
    enriquecimento: { texto: `O USCIS mudou uma regra do processo, no caso ${titulo}.` },
  };
}

function modelo(): typeof fetch {
  return (async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: "USCIS descreve as etapas do pedido",
              destaque: "as etapas do pedido",
              gancho: "O material oficial descreve as etapas de quem quer pedir.",
              fato_principal: "A USCIS descreve as etapas do pedido e os documentos que acompanham.",
              contexto: "A USCIS descreve os documentos que acompanham o pedido.",
              informacao_util: "O material oficial lista as etapas.",
              ressalva: "A fonte não informa prazo de análise.",
              cta: "",
              hashtags: ["#EstadosUnidos"],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    })) as unknown as typeof fetch;
}

const ARTE = {
  ok: true as const,
  artefato: {
    url: "https://storage.exemplo/peca.png",
    path: "proj/2026-10-06/peca.png",
    filename: "social-v2.png",
    mime: "image/png",
    sha256: "a".repeat(64),
    bytes: 120_000,
    largura: 2160,
    altura: 2880,
    otimizado: false,
  },
};

const ENFORCE = {
  SOCIAL_PIPELINE_V2: "enforce",
  VISUAL_RESOLVER_V2: "enforce",
  SOCIAL_V2_ENFORCE_LIBERADO: "true",
  SOCIAL_EVERGREEN_V2: "off",
};

const ERRO_DO_BANCO =
  "gravação de candidatas, lote 1: duplicate key value violates unique constraint code: 23505 details: Key (project_id, story_id) already exists.";

function opcoes(env: Record<string, string | undefined>, extra: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    projectSlug: "eua-journal",
    editionDate: "2026-10-06",
    marca: { nome: "eua.journal", nicho: "EUA", extra: "", keyword: "" },
    historico: [],
    historicoDoFeed: [],
    config: {} as never,
    client: clienteVazio,
    env: { OPENAI_API_KEY: "chave", ...env },
    fetcher: modelo(),
    agoraMs: Date.parse("2026-10-06T03:00:00Z"),
    congelarArte: async () => ARTE,
    resolverKeyword: async () => ({ ok: false as const, motivo: "sem automação" }),
    verificarClaims: async () => ({ claims: [], naoSustentadas: [], problemas: [], custoUsd: 0, tokens: 0, erro: null }),
    ...extra,
  };
}

async function rodar(env: Record<string, string | undefined>, extra: Record<string, unknown> = {}) {
  const noticias = [pauta("s-1", "Regra 1 muda no processo", "ORGAO-1"), pauta("s-2", "Regra 2 muda no processo", "ORGAO-2")];
  for (const p of noticias) confirmadas.push(p);
  const avisos: unknown[] = [];
  const r = await rodarSocialDoDia(
    noticias as never,
    opcoes(env, { avisarCandidatasNaoGravadas: async (f: unknown) => void avisos.push(f), ...extra }) as never,
  );
  return { r, avisos };
}

beforeEach(() => {
  confirmadas.length = 0;
  gravadas.length = 0;
  linhasNoBanco = true;
});

describe("a gravação das candidatas falhou", () => {
  it("os posts seguem, um aviso sai e o diagnóstico grava o erro do banco", async () => {
    linhasNoBanco = false;
    const { r, avisos } = await rodar(ENFORCE, { candidatasNaoGravadas: [ERRO_DO_BANCO] });

    // Os posts de notícia foram gravados, e sem `candidate_id` (não há linha).
    expect(gravadas.length).toBeGreaterThan(0);
    expect(r.diagnostico.scheduled).toBe(gravadas.length);
    expect(r.ciclo?.composicao?.bloqueio ?? null).toBeNull();
    for (const g of gravadas) expect(g.candidateId).toBeNull();

    // Um aviso só, com o erro e a contagem.
    expect(avisos).toEqual([{ dia: "2026-10-06", erros: [ERRO_DO_BANCO], postsGravados: gravadas.length }]);

    // O diagnóstico que vai para `platform_events` leva o erro inteiro.
    expect(r.diagnostico.candidatasNaoGravadas).toEqual([ERRO_DO_BANCO]);
    expect(r.diagnostico.errors.join(" ")).toContain("Key (project_id, story_id)");
    const registro = montarRegistroDoSocial(r, { editionDate: "2026-10-06", dryRun: false });
    expect(registro.candidatasNaoGravadas).toEqual([ERRO_DO_BANCO]);
    expect(registro.bloqueio).toBeNull();
  });

  it("a guarda de verificação continua: sem a falha declarada, pauta sem linha no banco não sai", async () => {
    /*
     * O mesmo banco sem as linhas, mas sem ninguém dizer que a gravação
     * falhou: a prova em memória não entra, e `podePublicar` recusa como
     * sempre. É o que mostra que a guarda dependia da gravação.
     */
    linhasNoBanco = false;
    const { r, avisos } = await rodar(ENFORCE);

    expect(gravadas).toHaveLength(0);
    expect(avisos).toHaveLength(0);
    expect(JSON.stringify(r.ciclo?.descartados ?? [])).toContain("SOCIAL_REJECT_UNVERIFIED");
  });

  it("só sai o que o verificador confirmou: pauta fora de `confirmadas` não ganha prova", async () => {
    linhasNoBanco = false;
    const noticias = [pauta("s-1", "Regra 1 muda no processo", "ORGAO-1"), pauta("s-2", "Regra 2 muda no processo", "ORGAO-2")];
    confirmadas.push(noticias[0]);
    const r = await rodarSocialDoDia(
      noticias as never,
      opcoes(ENFORCE, { candidatasNaoGravadas: [ERRO_DO_BANCO], avisarCandidatasNaoGravadas: async () => {} }) as never,
    );

    const ids = gravadas.map((g) => String((g.post as { pauta?: { storyId?: string } })?.pauta?.storyId ?? ""));
    expect(ids).toEqual(["s-1"]);
    expect(r.diagnostico.verified).toBe(1);
  });

  it("em ensaio fica no diagnóstico e não avisa: não há post para dizer que seguiu", async () => {
    linhasNoBanco = false;
    const { r, avisos } = await rodar({ ...ENFORCE, SOCIAL_PIPELINE_V2: "dry_run" }, { candidatasNaoGravadas: [ERRO_DO_BANCO] });

    expect(gravadas).toHaveLength(0);
    expect(avisos).toHaveLength(0);
    expect(r.diagnostico.candidatasNaoGravadas).toEqual([ERRO_DO_BANCO]);
  });

  it("o aviso que falha não derruba o ciclo", async () => {
    linhasNoBanco = false;
    const { r } = await rodar(ENFORCE, {
      candidatasNaoGravadas: [ERRO_DO_BANCO],
      avisarCandidatasNaoGravadas: async () => {
        throw new Error("Telegram fora");
      },
    });
    expect(r.diagnostico.scheduled).toBeGreaterThan(0);
  });
});

describe("a gravação das candidatas deu certo", () => {
  it("nenhum aviso, e o diagnóstico não fala de candidatas", async () => {
    const { r, avisos } = await rodar(ENFORCE, { candidatasNaoGravadas: [] });

    expect(gravadas.length).toBeGreaterThan(0);
    expect(avisos).toHaveLength(0);
    expect(r.diagnostico.candidatasNaoGravadas).toBeUndefined();
    expect(montarRegistroDoSocial(r, { editionDate: "2026-10-06", dryRun: false }).candidatasNaoGravadas).toBeNull();
  });
});

describe("a leitura das candidatas falhou", () => {
  it("continua fechando a notícia, e o diagnóstico grava o porquê", async () => {
    const leitura = "leitura de candidatas falhou: Candidatas, leitura da janela falhou: fetch failed causa: Connect Timeout Error";
    const { r, avisos } = await rodar(ENFORCE, { persistenciaDegradada: true, candidatasNaoLidas: [leitura] });

    expect(gravadas).toHaveLength(0);
    expect(avisos).toHaveLength(0);
    expect(r.ciclo?.composicao?.bloqueio).toBe("SOCIAL_PERSISTENCE_UNAVAILABLE");
    expect(r.diagnostico.errors.join(" ")).toContain("Connect Timeout Error");
  });
});
