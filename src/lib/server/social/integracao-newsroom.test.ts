import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O Instagram como segundo consumidor do trabalho editorial, e não como etapa
 * da newsletter.
 *
 * A regra de produto que estes testes protegem: o feed NÃO depende de a
 * newsletter fechar edição. Na capacidade medida, o dia mais comum é aquele em
 * que a linha editorial aprova algumas pautas, a newsletter leva menos que o
 * mínimo de duas e cancela. Se o social morasse depois dessa decisão, ele
 * perderia justamente os dias que mais tem para publicar.
 */

const confirmadasFalsas: unknown[] = [];
const chamouVerificador = vi.fn();
/*
 * Só `conferirFinalistas` é substituído; o resto do módulo continua real.
 *
 * Substituir o módulo inteiro derrubava `podePublicar`, que o gerador importa
 * daqui, e o sintoma chegava disfarçado de "falha técnica ao gerar" — que é o
 * mesmo texto de uma copy malformada.
 */
vi.mock("../editorial/finalistas", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  conferirFinalistas: (pool: unknown[], opcoes: unknown) => {
    chamouVerificador(pool, opcoes);
    return Promise.resolve({
      confirmadas: confirmadasFalsas,
      recusadas: [],
      emConflito: [],
      naoConferidas: [],
      diagnostico: {
        finalistas: (pool as unknown[]).length,
        verificadasAgora: 0,
        reaproveitadasDoBanco: (pool as unknown[]).length,
        chamadasAoVerificador: 0,
        tokens: 0,
        custoUsd: 0,
      },
      linhasDeLog: [],
    });
  },
}));

/*
 * Só `montarPacotesDasPautas` é substituído; o resto do módulo continua real.
 *
 * Substituir o módulo inteiro derrubava `validarAncoragem`, que a guarda de
 * slides importa daqui, e o sintoma chegava como "falha técnica ao gerar o
 * carrossel" em todos os posts do conteúdo permanente. É a mesma lição do mock
 * de `finalistas`, logo acima, e ela custou os dois diagnósticos.
 */
vi.mock("../editorial/pacote-factual", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  montarPacotesDasPautas: async () => ({ pacotes: new Map(), linhasDeLog: [] }),
}));

const resolveuVisual = vi.fn();
vi.mock("../visual/resolver", () => ({
  resolveVisualAsset: async () => {
    resolveuVisual();
    return { asset: null, motivo: "NO_VALID_IMAGE", fontesConsultadas: [], entidade: null };
  },
}));

/**
 * O store de candidatas, que é onde a classificação e a verificação ficam
 * compartilhadas entre a newsletter e o social.
 *
 * Ele devolve a candidata APROVADA e VERIFICADA porque é isso que o Social
 * Guard exige: `podePublicar` recusa com `SOCIAL_REJECT_UNVERIFIED` quando a
 * linha não prova a verificação. Um dublê vazio aqui faria todo post ser
 * descartado — que foi exatamente o que aconteceu na primeira volta.
 */
const candidataVerificada = {
  id: "cand-1",
  status: "approved",
  verificacao: {
    status: "confirm",
    motivo: "",
    divergencias: [],
    verificadoEm: "2026-09-06T09:10:00Z",
    canal: "newsletter",
    inputHash: "h",
  },
};
const storeDeCandidatas = {
  buscarPorStoryIds: vi.fn(async (_projectId: string, storyIds: string[]) =>
    new Map(storyIds.map((id) => [id, { ...candidataVerificada, storyId: id }])),
  ),
};
/*
 * Idem: só a fábrica do store é substituída. `podePublicar` mora neste módulo e
 * o Social Guard o importa; derrubá-lo fazia toda copy ser descartada com
 * "falha técnica ao gerar", que é o mesmo texto de uma copy malformada.
 */
vi.mock("../editorial/candidatos-store", async (original) => ({
  ...((await original()) as Record<string, unknown>),
  criarCandidatosStore: () => storeDeCandidatas,
}));

/** As linhas que o social gravaria. */
const gravadas: unknown[][] = [];
const doDia: unknown[] = [];
vi.mock("./social-posts-store", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    criarSocialPostsStore: () => ({
      doDia: async () => doDia,
      gravar: async (posts: unknown[]) => {
        gravadas.push(posts);
        return { gravados: posts.length, bloqueadosPorIdempotencia: [], erros: [], ids: ["id-1"] };
      },
    }),
  };
});

const { rodarSocialDoDia } = await import("./ciclo-do-dia");

/**
 * Um modelo de mentira que responde nos DOIS formatos.
 *
 * Ele só sabia responder peça única, e por isso todo carrossel do conteúdo
 * permanente era descartado como "falha técnica ao gerar": o schema do
 * carrossel exige `slides`, e o dublê não mandava. O sintoma chegava
 * disfarçado de erro do pipeline, quando era o dublê que não sabia o assunto.
 *
 * A distinção é feita pelo próprio prompt, que é como o pipeline distingue: se
 * o system pede CARROSSEL, a resposta vem com slides.
 */
/**
 * Os papéis que o prompt pediu ao modelo, na ordem, só os que ele escreve.
 *
 * O prompt lista todos numerados e marca com "NÃO escreva este slide" os que o
 * código monta (capa e fechamento). Ler daqui é o que faz o dublê responder a
 * estrutura de verdade em vez de uma quantidade fixa.
 */
function papeisDoPrompt(corpo: string): string[] {
  const papeis: string[] = [];
  const linhas = corpo.split("\\n");

  for (const linha of linhas) {
    const m = /\d+\. papel \\"([^\\"]+)\\"/.exec(linha);
    if (!m) continue;
    if (linha.includes("NÃO escreva")) continue;
    papeis.push(m[1]);
  }

  return papeis;
}

function modelo(): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const corpo = String(init?.body ?? "");
    const ehCarrossel = corpo.includes("CARROSSEL");

    const comum = {
      headline: "USCIS muda prazo de análise do I-765",
      destaque: "prazo de análise",
      gancho: "A mudança vale a partir de outubro.",
      // Obrigatório no schema: é o fato que ancora a peça.
      fato_principal: "O prazo de análise do I-765 passa de 90 para 45 dias a partir de outubro.",
      ressalva: "A fonte não informa o que acontece com pedidos antigos.",
      cta: "",
      hashtags: ["#USCIS", "#I765"],
    };

    /*
     * A resposta do carrossel é ANCORÁVEL, e isso não é detalhe do dublê.
     *
     * A primeira versão respondia sobre o I-765 e "90 para 45 dias" também no
     * carrossel, e a ancoragem reprovava todos os quatro posts: o pacote do
     * item permanente não fala de I-765 nem tem esses números. A guarda estava
     * certa e o dublê errado.
     *
     * Então aqui o texto não tem número nenhum e o único nome próprio é USCIS,
     * que o pacote falso declara em `organizations`. Sem números, `validarAncoragem`
     * não tem o que reprovar, e o que se mede volta a ser o caminho.
     */
    const conteudo = ehCarrossel
      ? {
          ...comum,
          headline: "USCIS descreve as etapas do pedido",
          destaque: "as etapas do pedido",
          gancho: "O material oficial descreve as etapas de quem quer pedir.",
          fato_principal: "A USCIS descreve as etapas do pedido e os documentos que acompanham.",
          ressalva: "A fonte não informa prazo de análise.",
          contexto: "",
          informacao_util: "",
          /*
           * Os slides saem do PRÓPRIO PROMPT, papel por papel.
           *
           * Um dublê que devolve seis slides genéricos com papel "slide" é
           * reprovado por forma, e com razão: o papel ecoado tem que ser o
           * esperado naquela posição, e coluna preenchida em slide que não é de
           * comparação também é apontamento. Ler os papéis do prompt é o que um
           * modelo obediente faria, e é o que torna este dublê útil.
           */
          slides: papeisDoPrompt(corpo).map((papel) => ({
            papel,
            titulo: "O que o material oficial descreve",
            corpo: papel.startsWith("diferença")
              ? ""
              : "O material oficial descreve as etapas do pedido e os documentos que acompanham.",
            bullets: [],
            lado_a: papel.startsWith("diferença") ? "de um lado, o material descreve as etapas" : "",
            lado_b: papel.startsWith("diferença") ? "do outro, ele descreve os documentos" : "",
          })),
        }
      : {
          ...comum,
          contexto: "O prazo passa de 90 para 45 dias.",
          informacao_util: "Quem já protocolou entra na regra nova.",
        };

    return Response.json({
      choices: [{ message: { content: JSON.stringify(conteudo) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  }) as unknown as typeof fetch;
}

function pauta(id: string, titulo: string) {
  return {
    storyId: id,
    grupo: { primary: { title: titulo, url: `https://uscis.gov/${id}`, source_name: "USCIS" }, secondary_urls: [] },
    pontuacao: { total: 72, partes: {}, explicacao: "" },
    classificacao: {
      eixo: "imigracao",
      pais: "EUA",
      relevancia: 7,
      imigracao: true,
      atores: ["USCIS"],
      lugares: [],
      acontecimento: "mudança de prazo",
      topico: "prazo",
    },
    enriquecimento: { texto: "O USCIS mudou o prazo de análise do formulário I-765." },
  };
}

const ARTEFATO = {
  ok: true as const,
  artefato: {
    url: "https://storage.exemplo/peca.png",
    path: "proj/2026-09-06/peca.png",
    filename: "social-v2.png",
    mime: "image/png",
    sha256: "d".repeat(64),
    bytes: 100_000,
    largura: 2160,
    altura: 2880,
    otimizado: false,
  },
};

function opcoes(env: Record<string, string | undefined>, over: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    projectSlug: "imigra-us",
    editionDate: "2026-09-06",
    marca: { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "VISA" },
    historico: [],
    config: {} as never,
    /*
     * Um cliente mínimo, porque produção tem um de verdade.
     *
     * O ciclo lê o histórico do evergreen do banco, e passar `{}` fazia a
     * leitura estourar. Devolver lista vazia é o que um projeto novo teria.
     */
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ gte: async () => ({ data: [], error: null }) }),
            gte: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    } as never,
    env: { OPENAI_API_KEY: "chave", ...env },
    fetcher: modelo(),
    agoraMs: Date.parse("2026-09-06T03:00:00Z"),
    congelarArte: async () => ARTEFATO,
    resolverKeyword: async () => ({ ok: true as const, keyword: "VISA", automacao: "auto-1" }),
    ...over,
  };
}

beforeEach(() => {
  confirmadasFalsas.length = 0;
  gravadas.length = 0;
  doDia.length = 0;
  chamouVerificador.mockClear();
  resolveuVisual.mockClear();
  storeDeCandidatas.buscarPorStoryIds.mockClear();
});

// ---------------------------------------------------------------- A
describe("A. modo off", () => {
  it("não executa nada, e a integração é praticamente um no-op", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia([pauta("s-1", "USCIS muda prazo")] as never, opcoes({}));

    expect(r.diagnostico.mode).toBe("off");
    expect(r.diagnostico.executed).toBe(false);
    expect(r.ciclo).toBeNull();
    // Nem o verificador é chamado: em off não se gasta token nenhum.
    expect(chamouVerificador).not.toHaveBeenCalled();
    expect(resolveuVisual).not.toHaveBeenCalled();
    expect(gravadas).toHaveLength(0);
  });

  it("o pool oferecido aparece no diagnóstico mesmo em off", async () => {
    // Para amanhã dar para comparar "quantas havia" com "quantas viraram post".
    const r = await rodarSocialDoDia([pauta("s-1", "x"), pauta("s-2", "y")] as never, opcoes({}));
    expect(r.diagnostico.candidates).toBe(2);
  });
});

// ---------------------------------------------------------------- B
describe("B. modo dry_run", () => {
  it("roda o ciclo inteiro e não grava nada", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }),
    );

    expect(r.diagnostico.mode).toBe("dry_run");
    expect(r.diagnostico.executed).toBe(true);
    expect(r.diagnostico.verified).toBe(1);
    expect(r.diagnostico.selected).toBeGreaterThan(0);
    // Nada elegível para o worker: nenhuma linha gravada.
    expect(r.diagnostico.scheduled).toBe(0);
    expect(gravadas).toHaveLength(0);
  });

  it("o verificador roda com o canal do Instagram, não com o da newsletter", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));
    await rodarSocialDoDia([pauta("s-1", "x")] as never, opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }));

    const [, opts] = chamouVerificador.mock.calls[0];
    expect((opts as { canal: string }).canal).toBe("instagram");
  });
});

// ---------------------------------------------------------------- C
describe("C. modo enforce", () => {
  it("cria posts V2 agendados", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      opcoes({
        SOCIAL_PIPELINE_V2: "enforce",
        VISUAL_RESOLVER_V2: "enforce",
        SOCIAL_V2_ENFORCE_LIBERADO: "true",
      }),
    );

    expect(r.diagnostico.mode).toBe("enforce");
    expect(r.diagnostico.scheduled).toBe(1);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toHaveLength(1);
  });

  it("enforce sem liberação explícita não grava", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "x")] as never,
      opcoes({ SOCIAL_PIPELINE_V2: "enforce", VISUAL_RESOLVER_V2: "off" }),
    );

    expect(r.diagnostico.scheduled).toBe(0);
    expect(gravadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- F
describe("F. segunda execução no mesmo dia", () => {
  it("a idempotência é do store, e ela vê a linha de hoje", async () => {
    /*
     * O cron pode ser chamado de novo no mesmo dia. Quem impede a segunda linha
     * é a chave `social-v2-{data}-{storyId}`, conferida contra o que já existe
     * naquele dia — e é por isso que `doDia` é lido antes de gravar.
     */
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));
    const env = {
      SOCIAL_PIPELINE_V2: "enforce",
      VISUAL_RESOLVER_V2: "enforce",
      SOCIAL_V2_ENFORCE_LIBERADO: "true",
    };

    await rodarSocialDoDia([pauta("s-1", "x")] as never, opcoes(env));
    expect(gravadas).toHaveLength(1);

    const primeira = gravadas[0][0] as { editionDate: string; post: { pauta: { storyId: string } } };
    expect(primeira.editionDate).toBe("2026-09-06");
    expect(primeira.post.pauta.storyId).toBe("s-1");

    // A segunda volta grava o MESMO conjunto, e é o store quem barra: a chave
    // de idempotência é a mesma, e `social-posts-store.test.ts` prova o bloqueio.
    await rodarSocialDoDia([pauta("s-1", "x")] as never, opcoes(env));
    const segunda = gravadas[1][0] as { editionDate: string; post: { pauta: { storyId: string } } };
    expect(segunda.editionDate).toBe(primeira.editionDate);
    expect(segunda.post.pauta.storyId).toBe(primeira.post.pauta.storyId);
  });
});

// ---------------------------------------------------------------- G
describe("G. newsletter e social compartilham a classificação", () => {
  it("o social lê as candidatas persistidas em vez de reclassificar", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));
    await rodarSocialDoDia([pauta("s-1", "x")] as never, opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }));

    // O mesmo store que a guarda da newsletter usa.
    expect(storeDeCandidatas.buscarPorStoryIds).toHaveBeenCalledWith("proj-1", ["s-1"]);
    // E o verificador recebe esse store, para não pagar de novo o que já foi pago.
    const [, opts] = chamouVerificador.mock.calls[0];
    expect((opts as { store: unknown }).store).toBe(storeDeCandidatas);
  });
});

// ---------------------------------------------------------------- D, E, H, I
describe("a integração no newsroom, lida do fonte", () => {
  /*
   * Estes quatro são sobre o CONTROLE DE FLUXO de `runNewsroom`, uma função de
   * 1400 linhas que coleta, enriquece, classifica, compõe e envia. Montar um
   * dublê para ela custaria mais confiança do que entrega: o dublê passaria a
   * ser o objeto testado.
   *
   * O que decide os quatro é a POSIÇÃO da chamada e o que existe em volta dela,
   * e isso o fonte responde sem ambiguidade.
   */
  const fonte = fs.readFileSync(
    path.join(__dirname, "../newsroom/newsroom-service.ts"),
    "utf-8",
  );

  it("D. o social roda ANTES do retorno por mínimo editorial", () => {
    const chamada = fonte.indexOf("await rodarSocialDoDia(");
    const cancelamento = fonte.indexOf('reason: "editorial_minimum_not_met"');

    expect(chamada).toBeGreaterThan(0);
    expect(cancelamento).toBeGreaterThan(0);
    // Se esta ordem inverter, o dia que não fecha newsletter perde o feed junto.
    expect(chamada).toBeLessThan(cancelamento);
  });

  it("D. o social recebe o pool aprovado, não as pautas selecionadas da newsletter", () => {
    // `selecionadas` já passou pelo teto do Brasil e pelo teto de 4. O pool é a
    // camada compartilhada, e é dele que o feed tem que partir.
    expect(fonte).toContain("rodarSocialDoDia(resultado.approvedEditorialPool");
  });

  it("D. o diagnóstico do social sai também no retorno de cancelamento", () => {
    const trecho = fonte.slice(
      fonte.indexOf('reason: "editorial_minimum_not_met"'),
      fonte.indexOf('reason: "editorial_minimum_not_met"') + 900,
    );
    // A asserção é sobre o CAMPO que sai no retorno, não sobre o nome da
    // variável que o alimenta: o diagnóstico mudou de escopo para sobreviver ao
    // throw do portão do QA, e um teste que morre num rename não estava
    // medindo a regra.
    expect(trecho).toMatch(/socialV2:\s*\S+/);
  });

  it("E. falha do social não derruba a newsletter", () => {
    const inicio = fonte.indexOf("await rodarSocialDoDia(");
    const trecho = fonte.slice(inicio - 1500, inicio + 2000);
    expect(trecho).toContain("try {");
    expect(trecho).toContain("} catch (erro) {");
    expect(trecho).toContain("a newsletter segue");
    // E o alerta é aviso, não crítico: a edição saiu.
    expect(trecho).toContain('"warning"');
  });

  it("H. o newsroom não chama o worker", () => {
    for (const proibido of ["processScheduledPost", "instagram-worker", "worker-service"]) {
      expect(fonte, proibido).not.toContain(proibido);
    }
  });

  it("I. o newsroom não fala com a Meta", () => {
    for (const proibido of ["meta-client", "graph.facebook.com", "createCarouselContainer", "publicarComRegistro"]) {
      expect(fonte, proibido).not.toContain(proibido);
    }
  });
});

// ---------------------------------------------------------------- I
describe("I. o chamador de verdade: quem liga o Evergreen é a FLAG", () => {
  /**
   * O bloqueador que este bloco existe para fechar.
   *
   * O canal inteiro era inalcançável a partir do cron. `prepararEvergreen` só
   * rodava quando o chamador se lembrava de passar um campo `evergreen`, e o
   * caminho de produção (cron → newsroom → `rodarSocialDoDia`) não passava
   * nenhum. Com `SOCIAL_EVERGREEN_V2=enforce` o dia sairia sem um único post
   * permanente, sem erro nenhum para investigar. É o mesmo padrão do pipeline
   * pronto que ninguém chamava.
   *
   * Estes testes partem do MESMO entrypoint que o newsroom usa, e não de
   * script. O campo `evergreen` aparece só onde é injeção de lastro falso,
   * porque nenhum teste desta suíte fala com a rede.
   */

  /** Um catálogo minúsculo, com fonte canônica e assunto identificável. */
  const CATALOGO_DE_TESTE = [
    {
      id: "ajuste-de-status",
      nome: "Ajuste de status",
      familia: "process_explainer" as const,
      programa: undefined,
      resumo: "Como pedir o green card sem sair dos Estados Unidos.",
      fontesCanonicas: ["https://www.uscis.gov/green-card"],
      angulos: [{ id: "etapas", pergunta: "Quais sao as etapas do ajuste de status?" }],
    },
    {
      id: "processo-consular",
      nome: "Processo consular",
      familia: "process_explainer" as const,
      programa: undefined,
      resumo: "Como pedir o visto de imigrante no consulado.",
      fontesCanonicas: ["https://travel.state.gov/consular"],
      angulos: [{ id: "etapas", pergunta: "Quais sao as etapas do processo consular?" }],
    },
  ];

  /** Lastro falso que COBRE o assunto de cada item, sem tocar a rede. */
  function lastroFalso() {
    return (async (itens: Array<{ topico: { nome: string; fontesCanonicas: string[] } }>) => ({
      lastros: itens.map((item) => ({
        item: item as never,
        storyId: `evg:${(item as never as { topico: { id: string } }).topico.id}:etapas`,
        pacote: {
          verified_facts: [
            `${item.topico.nome} tem etapas descritas no material oficial.`,
            `A analise de ${item.topico.nome} considera os documentos enviados.`,
          ],
          people: [],
          organizations: ["USCIS"],
          places: ["Estados Unidos"],
          dates: [],
          numbers: [],
          gaps: [],
          source_urls: item.topico.fontesCanonicas,
          texto_de_origem: `Material oficial sobre ${item.topico.nome}.`,
        },
        fontes: [{ url: item.topico.fontesCanonicas[0], ok: true, caracteres: 5000 }],
      })),
      custoUsd: 0,
      tokens: 0,
    })) as never;
  }

  /** O congelamento de N slides, injetado: nenhum teste sobe navegador. */
  const CARROSSEL_CONGELADO = {
    ok: true as const,
    artefatos: [1, 2, 3, 4].map((i) => ({
      index: i,
      url: `https://storage.exemplo/slide-0${i}.png`,
      path: `proj/2026-09-06/slide-0${i}.png`,
      filename: `social-v2-0${i}.png`,
      mime: "image/png",
      sha256: String(i).repeat(64).slice(0, 64),
      bytes: 100_000,
      largura: 2160,
      altura: 2880,
      otimizado: false,
    })),
  };

  const comEvergreen = (env: Record<string, string | undefined>, over: Record<string, unknown> = {}) =>
    opcoes(env, {
      evergreen: { catalogo: CATALOGO_DE_TESTE as never, montarLastroDosItens: lastroFalso() },
      congelarCarrossel: async () => CARROSSEL_CONGELADO,
      verificarClaims: async () => ({
        claims: [],
        naoSustentadas: [],
        problemas: [],
        custoUsd: 0,
        tokens: 0,
        erro: null,
      }),
      ...over,
    });

  it("enforce grava linha com origin_channel = evergreen, pelo entrypoint do newsroom", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      comEvergreen({
        SOCIAL_PIPELINE_V2: "enforce",
        VISUAL_RESOLVER_V2: "enforce",
        SOCIAL_V2_ENFORCE_LIBERADO: "true",
        SOCIAL_EVERGREEN_V2: "enforce",
      }),
    );

    expect(r.diagnostico.evergreen?.mode).toBe("enforce");
    expect(r.diagnostico.evergreen?.executed).toBe(true);

    const linhas = gravadas.flat() as Array<{ origem?: { originChannel?: string } }>;
    const doEvergreen = linhas.filter((l) => l.origem?.originChannel === "evergreen");

    expect(doEvergreen.length).toBeGreaterThan(0);
    expect(linhas.some((l) => l.origem?.originChannel === "social")).toBe(true);
  });

  it("off pelo mesmo entrypoint: zero Evergreen, e a notícia sai igual", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      comEvergreen({
        SOCIAL_PIPELINE_V2: "enforce",
        VISUAL_RESOLVER_V2: "enforce",
        SOCIAL_V2_ENFORCE_LIBERADO: "true",
        SOCIAL_EVERGREEN_V2: "off",
      }),
    );

    expect(r.diagnostico.evergreen?.mode).toBe("off");
    expect(r.diagnostico.evergreen?.executed).toBe(false);

    const linhas = gravadas.flat() as Array<{ origem?: { originChannel?: string } }>;
    expect(linhas.filter((l) => l.origem?.originChannel === "evergreen")).toHaveLength(0);
    expect(linhas.filter((l) => l.origem?.originChannel === "social").length).toBeGreaterThan(0);
  });

  it("dry_run pelo mesmo entrypoint: calcula tudo e não grava nada", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      comEvergreen({ SOCIAL_PIPELINE_V2: "dry_run", SOCIAL_EVERGREEN_V2: "dry_run" }),
    );

    expect(r.diagnostico.evergreen?.executed).toBe(true);
    expect(r.diagnostico.evergreen?.comLastro).toBeGreaterThan(0);
    expect(gravadas).toHaveLength(0);
  });

  it("flag inválida cai em off, e não em enforce", async () => {
    confirmadasFalsas.push(pauta("s-1", "USCIS muda prazo"));

    const r = await rodarSocialDoDia(
      [pauta("s-1", "USCIS muda prazo")] as never,
      comEvergreen({ SOCIAL_PIPELINE_V2: "dry_run", SOCIAL_EVERGREEN_V2: "ligado, por favor" }),
    );

    expect(r.diagnostico.evergreen?.mode).toBe("off");
    expect(r.diagnostico.evergreen?.executed).toBe(false);
  });

  it("SEM passar a opção evergreen, a flag ainda manda: o ciclo roda", async () => {
    /*
     * Este é o teste que fecha o bloqueador. Nenhum campo `evergreen` é
     * passado, exatamente como o newsroom não passava, e o ciclo tem que ter
     * rodado de qualquer forma.
     *
     * O dia é montado com dez notícias de propósito: `prepararEvergreen` volta
     * antes de buscar qualquer fonte quando não há vaga, então o teste prova
     * que a flag chegou até lá sem tocar a rede.
     */
    const dez = Array.from({ length: 10 }, (_, i) => pauta(`s-${i}`, `Notícia ${i}`));
    for (const p of dez) confirmadasFalsas.push(p);

    const r = await rodarSocialDoDia(
      dez as never,
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run", SOCIAL_EVERGREEN_V2: "enforce" }),
    );

    expect(r.diagnostico.evergreen?.mode).toBe("enforce");
    expect(r.diagnostico.evergreen?.executed).toBe(true);
    expect(r.diagnostico.evergreen?.vagas).toBe(0);
    expect(r.diagnostico.evergreen?.custoUsd).toBe(0);
  });
});

// ---------------------------------------------------------------- J
describe("J. o compositor único, com os quatro exemplos do pedido", () => {
  /*
   * Assuntos REAIS, e não "Assunto numero 0".
   *
   * Com nomes abstratos, todos os posts caíam em `SOCIAL_REJECT_HASHTAGS`: a
   * régua de hashtag exige que o assunto apareça no texto, e um tópico chamado
   * "Assunto numero 0" não sustenta hashtag nenhuma. A guarda estava certa, o
   * catálogo de teste é que não era um catálogo.
   *
   * Cada nome carrega o assunto (para a cobertura poder ser medida) e cada
   * resumo diz que se trata de imigração americana (para o enquadramento das
   * hashtags existir).
   */
  const ASSUNTOS = [
    "Ajuste de status",
    "Processo consular",
    "Peticao de imigrante",
    "Cartas de recomendacao",
    "Traducao de documentos",
    "Renda do patrocinador",
    "Exame medico do pedido",
    "Entrevista no consulado",
  ];

  const CATALOGO_GRANDE = ASSUNTOS.map((nome, i) => ({
    id: `topico-${i}`,
    nome,
    familia: (i % 2 === 0 ? "process_explainer" : "visa_explainer") as never,
    programa: undefined,
    resumo: `${nome}: uma etapa do pedido de green card na imigracao americana, nos Estados Unidos.`,
    fontesCanonicas: ["https://www.uscis.gov/x"],
    angulos: [{ id: "a", pergunta: `Como funciona ${nome.toLowerCase()} no pedido de green card?` }],
  }));

  function lastroQueCobre() {
    return (async (itens: Array<{ topico: { id: string; nome: string } }>) => ({
      lastros: itens.map((item) => ({
        item: item as never,
        storyId: `evg:${item.topico.id}:a`,
        pacote: {
          verified_facts: [
            `${item.topico.nome} tem regra descrita no material oficial da USCIS sobre green card.`,
            `O material da imigracao americana trata de ${item.topico.nome} em detalhe.`,
          ],
          people: [],
          organizations: ["USCIS"],
          places: ["Estados Unidos"],
          dates: [],
          numbers: [],
          gaps: [],
          source_urls: ["https://www.uscis.gov/x"],
          texto_de_origem: `Material sobre ${item.topico.nome}.`,
        },
        fontes: [{ url: "https://www.uscis.gov/x", ok: true, caracteres: 5000 }],
      })),
      custoUsd: 0,
      tokens: 0,
    })) as never;
  }

  async function dia(quantasNoticias: number) {
    confirmadasFalsas.length = 0;
    gravadas.length = 0;

    const noticias = Array.from({ length: quantasNoticias }, (_, i) => pauta(`s-${i}`, `Notícia ${i}`));
    for (const p of noticias) confirmadasFalsas.push(p);

    const r = await rodarSocialDoDia(
      noticias as never,
      opcoes(
        { SOCIAL_PIPELINE_V2: "dry_run", SOCIAL_EVERGREEN_V2: "dry_run" },
        {
          evergreen: { catalogo: CATALOGO_GRANDE as never, montarLastroDosItens: lastroQueCobre() },
          verificarClaims: async () => ({
            claims: [],
            naoSustentadas: [],
            problemas: [],
            custoUsd: 0,
            tokens: 0,
            erro: null,
          }),
        },
      ),
    );

    const previews = r.ciclo?.previews ?? [];
    return {
      noticias: previews.filter((p) => p.origem.originChannel !== "evergreen").length,
      evergreen: previews.filter((p) => p.origem.originChannel === "evergreen").length,
      total: previews.length,
      log: (r.ciclo?.linhasDeLog ?? []).join("\n"),
    };
  }

  it("10 notícias, 0 evergreen", async () => {
    const d = await dia(10);
    expect(d.evergreen).toBe(0);
    expect(d.total).toBeLessThanOrEqual(10);
  });

  it("7 notícias, até 3 evergreen", async () => {
    const d = await dia(7);
    expect(d.evergreen).toBeLessThanOrEqual(3);
    expect(d.total).toBeLessThanOrEqual(10);
  });

  it("2 notícias, até 4 evergreen pelo teto do canal", async () => {
    const d = await dia(2);
    expect(d.evergreen).toBeLessThanOrEqual(4);
    expect(d.total).toBeLessThanOrEqual(10);
  });

  it("0 notícia, e o evergreen sustenta o dia", async () => {
    const d = await dia(0);
    if (d.evergreen === 0) console.log("DBG:", d.log);
    expect(d.noticias).toBe(0);
    expect(d.evergreen).toBeGreaterThan(0);
    expect(d.total).toBeLessThanOrEqual(10);
  });

  it("o compositor é CHAMADO, e o log prova", async () => {
    /*
     * O log é a prova de que a composição passou pelo compositor e não por
     * concatenação solta: a linha só existe dentro dele.
     */
    const d = await dia(2);
    expect(d.log).toContain("[SOCIAL V2] compositor:");
    expect(d.log).toMatch(/compositor: \d+ de notícia \+ \d+ de conteúdo permanente = \d+ de 10 vaga/);
  });

  it("a notícia vem primeiro na agenda, sempre", async () => {
    confirmadasFalsas.length = 0;
    gravadas.length = 0;

    const noticias = Array.from({ length: 2 }, (_, i) => pauta(`s-${i}`, `Notícia ${i}`));
    for (const p of noticias) confirmadasFalsas.push(p);

    const r = await rodarSocialDoDia(
      noticias as never,
      opcoes(
        { SOCIAL_PIPELINE_V2: "dry_run", SOCIAL_EVERGREEN_V2: "dry_run" },
        {
          evergreen: { catalogo: CATALOGO_GRANDE as never, montarLastroDosItens: lastroQueCobre() },
          verificarClaims: async () => ({
            claims: [],
            naoSustentadas: [],
            problemas: [],
            custoUsd: 0,
            tokens: 0,
            erro: null,
          }),
        },
      ),
    );

    const canais = (r.ciclo?.previews ?? []).map((p) => p.origem.originChannel);
    const ultimaNoticia = canais.lastIndexOf("social");
    const primeiroEvergreen = canais.indexOf("evergreen");

    if (primeiroEvergreen >= 0 && ultimaNoticia >= 0) {
      expect(ultimaNoticia).toBeLessThan(primeiroEvergreen);
    }
  });
});

// ---------------------------------------------------------------- K
describe("K. o Legacy não compete com o V2", () => {
  /**
   * O que aconteceu em 09/09, e o que este bloco impede.
   *
   * O V2 publicou "Regra permite residência para crianças nascidas nos EUA" às
   * 11:00 e o agendador LEGADO publicou "Registro de residência para crianças
   * nascidas nos EUA" às 12:30. Mesmo assunto, duas vezes, no mesmo perfil, no
   * mesmo dia: os dois criam linhas `scheduled` a partir do MESMO trabalho
   * editorial e o mesmo worker publica as duas.
   *
   * O portão é `SOCIAL_PIPELINE_V2`, e a escolha da flag é o ponto: o teste lê
   * o fonte do serviço da redação e confere qual flag governa o quê, porque
   * `INSTAGRAM_AUTO_POST` governa a PUBLICAÇÃO dos dois ramos e desligá-la
   * mataria o V2 junto.
   */
  const fonteDaRedacao = () =>
    fs.readFileSync(path.join(__dirname, "..", "newsroom", "newsroom-service.ts"), "utf-8");

  it("o agendador legado é chamado atrás de um portão, e o portão é o modo do V2", () => {
    const fonte = fonteDaRedacao();

    /* O portão existe e é lido do modo do pipeline social. */
    expect(fonte).toContain("const legadoCede = modoSocialV2 === \"enforce\"");

    /* E a chamada do agendador legado está atrás dele. */
    const trecho = fonte.slice(fonte.indexOf("const legadoCede"), fonte.indexOf("scheduleEditionPosts({"));
    expect(trecho).toContain("if (!dryRun && !legadoCede)");
  });

  it("a flag do worker NÃO é usada como portão do legado", () => {
    /*
     * `INSTAGRAM_AUTO_POST` governa a publicação dos DOIS ramos. Se algum dia
     * alguém a usar aqui para calar o legado, o V2 para de publicar junto, e o
     * sintoma será "o feed sumiu" sem ninguém ligar as duas coisas.
     *
     * A asserção é sobre CÓDIGO, e por isso os comentários saem antes: o nome
     * da flag aparece de propósito no comentário que explica por que ela não
     * pode ser usada aqui, e a primeira versão deste teste reprovou por causa
     * da própria explicação.
     */
    const semComentarios = fonteDaRedacao()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    expect(semComentarios).not.toContain("INSTAGRAM_AUTO_POST");
  });

  it("o worker continua sabendo publicar linha legada: o código não foi apagado", () => {
    /*
     * O pedido é explícito: não deletar código legado, apenas impedir geração
     * automática concorrente. As linhas históricas continuam publicáveis, e é
     * `ehLegado` que as reconhece.
     */
    const worker = fs.readFileSync(
      path.join(__dirname, "instagram", "worker-service.ts"),
      "utf-8",
    );
    expect(worker).toContain("ehLegado");
    expect(worker).toContain("prepararLegado");
  });
});
