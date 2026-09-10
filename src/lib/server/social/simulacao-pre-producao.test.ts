import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A simulação pré-produção, pelo MESMO entrypoint que o cron usa.
 *
 * O cenário do item "teste final offline": notícias válidas, evergreen válido,
 * gerador legado desativado, `SOCIAL_EVERGREEN_V2=enforce`, Meta de mentira.
 *
 * Nada aqui invoca script. O caminho é o de produção:
 *
 *   cron `/api/cron/newsroom`
 *     → `runNewsroom`
 *       → `rodarSocialDoDia(approvedEditorialPool)`   <-- começa aqui
 *         → `prepararEvergreen`  (flag)
 *         → `rodarCicloSocial`
 *           → `comporFeedSocial` (notícia)
 *           → `comporFeedDoDia`  (compositor único)
 *           → `gerarPostsDoDia`
 *           → `social_posts`
 *   e depois, no giro do worker:
 *     `findDuePosts` → `processScheduledPost` → Meta
 *
 * `runNewsroom` em si não entra: ele coleta, classifica, escreve a newsletter e
 * fala com o Listmonk, e substituir tudo isso mediria os dublês. O que este
 * arquivo prova é a etapa em que o social começa, mais o fonte da redação
 * mostrando que ela chega até aqui.
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
    asset: null,
    motivo: "NO_VALID_IMAGE",
    fontesConsultadas: [],
    entidade: null,
  }),
}));

/*
 * As candidatas voltam CONFIRMADAS, porque é o estado real de quem chega aqui.
 *
 * Com mapa vazio, `podePublicar` recusa toda notícia com
 * `SOCIAL_REJECT_UNVERIFIED`, e a simulação mediria o dublê: em produção o
 * verificador já rodou antes e persistiu a confirmação.
 */
vi.mock("../editorial/candidatos-store", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  criarCandidatosStore: () => ({
    buscarPorStoryIds: async (_p: string, ids: string[]) =>
      new Map(
        ids.map((id) => [
          id,
          {
            id: `cand-${id}`,
            status: "approved",
            verificacao: { status: "confirm", motivo: "confirmada pelo verificador" },
          },
        ]),
      ),
  }),
}));

/** As linhas que iriam para `social_posts`. */
const gravadas: Array<Record<string, unknown>> = [];
vi.mock("./social-posts-store", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    criarSocialPostsStore: () => ({
      doDia: async () => [],
      gravar: async (posts: Array<Record<string, unknown>>) => {
        for (const p of posts) gravadas.push(p);
        return {
          gravados: posts.length,
          bloqueadosPorIdempotencia: [],
          erros: [],
          ids: posts.map((_, i) => `id-${i}`),
        };
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

function pauta(id: string, titulo: string, ator = "USCIS") {
  return {
    storyId: id,
    grupo: {
      primary: { title: titulo, url: `https://www.uscis.gov/${id}`, source_name: "USCIS" },
      secondary_urls: [],
    },
    pontuacao: { total: 70, partes: {}, explicacao: "" },
    classificacao: {
      eixo: "processo",
      pais: "EUA",
      relevancia: 7,
      imigracao: true,
      atores: [ator],
      lugares: [],
      acontecimento: `acontecimento de ${id}`,
      topico: id,
    },
    enriquecimento: { texto: `O USCIS mudou uma regra do processo, no caso ${titulo}.` },
  };
}

/**
 * O catálogo da simulação: assuntos reais, com fonte canônica.
 *
 * Um deles, `b1-b2`, é o caso do preview: a fonte responde e NÃO fala do
 * assunto. Ele existe aqui para a cobertura poder ser vista descartando.
 */
const CATALOGO = [
  {
    id: "ajuste-de-status",
    nome: "Ajuste de status",
    familia: "process_explainer" as never,
    programa: undefined,
    resumo: "Ajuste de status: pedir o green card sem sair dos Estados Unidos, na imigracao americana.",
    fontesCanonicas: ["https://www.uscis.gov/green-card"],
    angulos: [{ id: "etapas", pergunta: "Quais sao as etapas do ajuste de status?" }],
  },
  {
    id: "processo-consular",
    nome: "Processo consular",
    familia: "process_explainer" as never,
    programa: undefined,
    resumo: "Processo consular: pedir o visto de imigrante no consulado, na imigracao americana.",
    fontesCanonicas: ["https://travel.state.gov/consular"],
    angulos: [{ id: "etapas", pergunta: "Quais sao as etapas do processo consular?" }],
  },
  {
    id: "cartas-de-recomendacao",
    nome: "Cartas de recomendacao",
    familia: "evidence_education" as never,
    programa: undefined,
    resumo: "Cartas de recomendacao numa peticao de green card, na imigracao americana, nos Estados Unidos.",
    fontesCanonicas: ["https://www.uscis.gov/policy-manual/volume-6"],
    angulos: [{ id: "peso", pergunta: "Que peso as cartas de recomendacao tem no pedido?" }],
  },
  {
    id: "b1-b2",
    nome: "B-1 e B-2 (negocios e turismo)",
    familia: "visa_explainer" as never,
    programa: "B-1/B-2",
    resumo: "O visto de visitante para negocios e turismo nos Estados Unidos.",
    fontesCanonicas: ["https://www.cbp.gov/travel/international-visitors"],
    angulos: [{ id: "b1-vs-b2", pergunta: "O que cada uma dessas letras deixa voce fazer?" }],
  },
];

/**
 * O lastro da simulação, item por item.
 *
 * Cobre os três primeiros e NÃO cobre o `b1-b2`: para ele, os fatos são os que
 * a CBP devolveu de verdade na medição, que falam de inspeção, ESTA e I-94, e
 * de B-1 e B-2 não falam nada.
 */
function lastroDaSimulacao() {
  return (async (itens: Array<{ topico: { id: string; nome: string; fontesCanonicas: string[] }; angulo: { id: string } }>) => ({
    lastros: itens.map((item) => {
      const cobre = item.topico.id !== "b1-b2";
      return {
        item: item as never,
        storyId: `evg:${item.topico.id}:${item.angulo.id}`,
        pacote: {
          verified_facts: cobre
            ? [
                `${item.topico.nome} tem etapas descritas no material oficial da USCIS sobre green card.`,
                `O material da imigracao americana descreve ${item.topico.nome} e os documentos do pedido.`,
              ]
            : [
                "Todas as pessoas que chegam a um ponto de entrada nos Estados Unidos estao sujeitas a inspecao.",
                "O ESTA determina a elegibilidade de visitantes para viajar aos Estados Unidos.",
                "O registro I-94 e uma prova do status legal de visitante.",
              ],
          people: [],
          organizations: ["USCIS"],
          places: ["Estados Unidos"],
          dates: [],
          numbers: [],
          gaps: cobre ? [] : ["A materia nao informa o que B-1 e B-2 permitem fazer."],
          source_urls: item.topico.fontesCanonicas,
          texto_de_origem: `Material oficial sobre ${item.topico.nome}.`,
        },
        fontes: [{ url: item.topico.fontesCanonicas[0], ok: true, caracteres: 5000 }],
      };
    }),
    custoUsd: 0,
    tokens: 0,
  })) as never;
}

/** O modelo, respondendo nos dois formatos, com texto ancorável. */
function modelo(): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const corpo = String(init?.body ?? "");
    const ehCarrossel = corpo.includes("CARROSSEL");

    const papeis: string[] = [];
    for (const linha of corpo.split("\\n")) {
      const m = /\d+\. papel \\"([^\\"]+)\\"/.exec(linha);
      if (m && !linha.includes("NÃO escreva")) papeis.push(m[1]);
    }

    const base = {
      headline: "USCIS descreve as etapas do pedido",
      destaque: "as etapas do pedido",
      gancho: "O material oficial descreve as etapas de quem quer pedir.",
      fato_principal: "A USCIS descreve as etapas do pedido e os documentos que acompanham.",
      ressalva: "A fonte não informa prazo de análise.",
      cta: "",
      hashtags: ["#GreenCard", "#ImigracaoEUA", "#EstadosUnidos"],
    };

    const conteudo = ehCarrossel
      ? {
          ...base,
          contexto: "",
          informacao_util: "",
          slides: papeis.map((papel) => ({
            papel,
            titulo: "O que o material oficial descreve",
            corpo: papel.startsWith("diferença")
              ? ""
              : "O material oficial descreve as etapas do pedido e os documentos que acompanham.",
            bullets: [],
            lado_a: papel.startsWith("diferença") ? "de um lado, as etapas" : "",
            lado_b: papel.startsWith("diferença") ? "do outro, os documentos" : "",
          })),
        }
      : {
          ...base,
          contexto: "A USCIS descreve os documentos que acompanham o pedido.",
          informacao_util: "O material oficial lista as etapas.",
        };

    return Response.json({
      choices: [{ message: { content: JSON.stringify(conteudo) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  }) as unknown as typeof fetch;
}

const ARTE_UNICA = {
  ok: true as const,
  artefato: {
    url: "https://storage.exemplo/peca.png",
    path: "proj/2026-09-10/peca.png",
    filename: "social-v2.png",
    mime: "image/png",
    sha256: "a".repeat(64),
    bytes: 120_000,
    largura: 2160,
    altura: 2880,
    otimizado: false,
  },
};

/**
 * O congelamento de mentira devolve UM artefato por slide recebido.
 *
 * A primeira versão devolvia cinco sempre, e o log ficava dizendo "carrossel de
 * 5 slides congelado" para uma peça de quatro. Dublê que responde um número
 * fixo faz o relatório mentir sobre o que o sistema fez.
 */
function congelarCarrosselFalso(entrada: { slides: unknown[] }) {
  return {
    ok: true as const,
    artefatos: entrada.slides.map((_, i) => ({
      index: i + 1,
      url: `https://storage.exemplo/slide-0${i + 1}.png`,
      path: `proj/2026-09-10/slide-0${i + 1}.png`,
      filename: `social-v2-0${i + 1}.png`,
      mime: "image/png",
      sha256: String(i + 1).repeat(64).slice(0, 64),
      bytes: 130_000,
      largura: 2160,
      altura: 2880,
      otimizado: false,
    })),
  };
}

function opcoes(env: Record<string, string | undefined>) {
  return {
    projectId: "proj-1",
    projectSlug: "imigra-us",
    editionDate: "2026-09-10",
    marca: { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "VISA" },
    historico: [],
    config: {} as never,
    client: clienteVazio,
    env: { OPENAI_API_KEY: "chave", ...env },
    fetcher: modelo(),
    agoraMs: Date.parse("2026-09-10T03:00:00Z"),
    congelarArte: async () => ARTE_UNICA,
    congelarCarrossel: async (entrada: { slides: unknown[] }) => congelarCarrosselFalso(entrada),
    resolverKeyword: async () => ({ ok: true as const, keyword: "VISA", automacao: "auto-1" }),
    evergreen: { catalogo: CATALOGO as never, montarLastroDosItens: lastroDaSimulacao() },
    verificarClaims: async () => ({
      claims: [],
      naoSustentadas: [],
      problemas: [],
      custoUsd: 0,
      tokens: 0,
      erro: null,
    }),
  };
}

const ENFORCE = {
  SOCIAL_PIPELINE_V2: "enforce",
  VISUAL_RESOLVER_V2: "enforce",
  SOCIAL_V2_ENFORCE_LIBERADO: "true",
  SOCIAL_EVERGREEN_V2: "enforce",
};

beforeEach(() => {
  confirmadas.length = 0;
  gravadas.length = 0;
});

describe("simulação pré-produção: News + Evergreen pelo entrypoint real", () => {
  async function rodar(quantasNoticias: number) {
    const noticias = Array.from({ length: quantasNoticias }, (_, i) =>
      pauta(`s-${i}`, `Regra ${i} muda no processo`, `ORGAO-${i}`),
    );
    for (const p of noticias) confirmadas.push(p);

    const r = await rodarSocialDoDia(noticias as never, opcoes(ENFORCE));

    const linhas = gravadas as Array<{
      origem?: { originChannel?: string };
      formato?: string;
      artefatos?: unknown[];
      post?: { pauta?: { storyId?: string } };
    }>;

    return {
      r,
      linhas,
      doEvergreen: linhas.filter((l) => l.origem?.originChannel === "evergreen"),
      daNoticia: linhas.filter((l) => l.origem?.originChannel === "social"),
      log: (r.ciclo?.linhasDeLog ?? []).join("\n"),
    };
  }

  it("1. a notícia entra", async () => {
    const s = await rodar(2);
    expect(s.daNoticia.length).toBeGreaterThan(0);
  });

  it("2. o evergreen preenche a vaga que sobrou", async () => {
    const s = await rodar(2);
    expect(s.doEvergreen.length).toBeGreaterThan(0);
  });

  it("3. o compositor é chamado", async () => {
    const s = await rodar(2);
    expect(s.log).toContain("[SOCIAL V2] compositor:");
  });

  it("4. o total nunca passa de 10", async () => {
    for (const n of [0, 2, 7, 10]) {
      const s = await rodar(n);
      expect(s.linhas.length, `${n} notícia(s)`).toBeLessThanOrEqual(10);
      gravadas.length = 0;
      confirmadas.length = 0;
    }
  });

  it("5. a notícia tem prioridade: com 10, o evergreen não entra", async () => {
    const s = await rodar(10);
    expect(s.doEvergreen).toHaveLength(0);
    expect(s.r.diagnostico.evergreen?.vagas).toBe(0);
  });

  it("6. cobertura ruim é descartada, e o B-1/B-2 é o caso", async () => {
    const s = await rodar(0);

    const semCobertura = s.r.diagnostico.evergreen?.semCobertura ?? [];
    expect(semCobertura.map((x) => x.item)).toContain("evg:b1-b2:b1-vs-b2");
    expect(semCobertura[0]?.motivo).toContain("SOURCE_TOPIC_COVERAGE_INSUFFICIENT");

    /* E ele NÃO virou post. */
    const ids = s.linhas.map((l) => String(l.post?.pauta?.storyId ?? ""));
    expect(ids.some((id) => id.includes("b1-b2"))).toBe(false);

    /* Nenhum post fala da ausência de informação. */
    const textos = JSON.stringify(s.linhas);
    expect(textos).not.toContain("não define");
    expect(textos).not.toContain("nao informa o que B-1");
  });

  it("7. nenhuma geração legada concorrente: o portão está no caminho do cron", () => {
    const fonte = fs.readFileSync(
      path.join(__dirname, "..", "newsroom", "newsroom-service.ts"),
      "utf-8",
    );

    const doPortao = fonte.slice(fonte.indexOf("const modoSocialV2"), fonte.indexOf("scheduleEditionPosts({"));
    expect(doPortao).toContain("legadoCede");
    expect(doPortao).toContain("if (!dryRun && !legadoCede)");
  });

  it("8. as linhas de social_posts saem no formato V2, com origem e formato", async () => {
    const s = await rodar(2);

    for (const l of s.linhas) {
      expect(l.origem?.originChannel).toBeTruthy();
      expect(l.formato === "static" || l.formato === "carousel").toBe(true);
      expect(Array.isArray(l.artefatos)).toBe(true);
      expect((l.artefatos ?? []).length).toBeGreaterThan(0);
    }

    /* O evergreen sai como carrossel ou estático, e a notícia como estático. */
    expect(s.daNoticia.every((l) => l.formato === "static")).toBe(true);

    /* E a peça única tem UM artefato, sempre. */
    expect(s.daNoticia.every((l) => (l.artefatos ?? []).length === 1)).toBe(true);
  });

  it("9. o worker recebe generation_version social-v2 nas duas origens", async () => {
    /*
     * A linha gravada é montada pelo store, e o store é substituído aqui. O que
     * se confere então é o CONTRATO que o store recebe: o mesmo tipo, com a
     * mesma forma, para os dois canais. `generation_version` é literal no store
     * e tem teste próprio em `social-posts-store.test.ts`.
     */
    const s = await rodar(2);
    const formas = s.linhas.map((l) => Object.keys(l).sort().join(","));
    expect(new Set(formas).size).toBe(1);
  });

  it("10. a Meta não é chamada nenhuma vez nesta simulação", async () => {
    /*
     * O `fetcher` desta simulação é o modelo, e ele responde JSON de copy para
     * qualquer URL. Se alguma etapa tentasse falar com a Graph API, a resposta
     * viria malformada e o post cairia; nenhum container é criado porque o
     * worker não roda aqui. O que se afirma é o desenho: publicar é trabalho do
     * worker, e o ciclo do dia não o chama.
     */
    const s = await rodar(2);
    expect(s.log).not.toContain("graph.facebook.com");

    const ciclo = fs.readFileSync(path.join(__dirname, "ciclo-do-dia.ts"), "utf-8");
    expect(ciclo).not.toContain("processScheduledPost");
    expect(ciclo).not.toContain("graph.facebook.com");
  });
});
