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

vi.mock("../editorial/pacote-factual", () => ({
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

/** Um modelo de mentira que devolve a copy no formato esperado. */
function modelo(): typeof fetch {
  return (async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: "USCIS muda prazo de análise do I-765",
              gancho: "A mudança vale a partir de outubro.",
              // Obrigatório no schema: é o fato que ancora a peça.
              fato_principal: "O prazo de análise do I-765 passa de 90 para 45 dias a partir de outubro.",
              contexto: "O prazo passa de 90 para 45 dias.",
              informacao_util: "Quem já protocolou entra na regra nova.",
              ressalva: "A fonte não informa o que acontece com pedidos antigos.",
              cta: "",
              hashtags: ["#USCIS", "#I765"],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    })) as unknown as typeof fetch;
}

function pauta(id: string, titulo: string) {
  return {
    storyId: id,
    grupo: { primary: { title: titulo, url: `https://uscis.gov/${id}`, source_name: "USCIS" }, secondary_urls: [] },
    pontuacao: { total: 72, partes: {}, explicacao: "" },
    classificacao: {
      eixo: "processo",
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
    client: {} as never,
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
    expect(trecho).toContain("socialV2: diagnosticoSocial");
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
