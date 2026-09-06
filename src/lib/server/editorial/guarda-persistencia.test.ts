import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import { avaliarPautas } from "./guarda";
import { assinaturaDoClassificador } from "./candidatos-store";
import type { CandidataParaGravar, CandidatosStore, CandidataPersistida } from "./candidatos-store";
import { montarSystemDoClassificador } from "./classificador";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { Classificacao } from "./classificador";

/**
 * A ordem do pipeline, travada por teste.
 *
 * coleta, dedupe, enriquecimento, regras duras, classificação primária,
 * PERSISTÊNCIA DE TODOS OS CLASSIFICADOS, pool aprovado, composição.
 *
 * Os dois erros que esta ordem evita: gravar só o pool faria a candidata
 * rejeitada sumir do banco e ser reclassificada amanhã, mantendo custo e
 * instabilidade onde eles não compram nada; e gravar depois da composição
 * faria a decisão de arrumação de um canal virar estado da notícia.
 */

const config = carregarConfigEditorial({});
const ENV = { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "modelo-teste" };
const PROJ = "proj-1";

const CORPO =
  "O United States Citizenship and Immigration Services informou nesta quinta-feira que o prazo de " +
  "renovação automática da permissão de trabalho passa de 180 para 540 dias. A mudança vale para " +
  "pedidos protocolados a partir de outubro e alcança asilo, ajuste de status e renovação por " +
  "casamento. O órgão afirmou que a fila soma 1,2 milhão de pedidos e que a medida evita a " +
  "interrupção do vínculo de trabalho durante a análise. A publicação saiu no Federal Register.";

function grupo(id: string, title: string, url: string): DeduplicatedGroup {
  return {
    primary: {
      id, url, title, source_name: "Fonte", priority: 1,
      published_at: new Date().toISOString(), description: CORPO, content: "",
      category: "imigracao", score: 0, dedupe_key: id, window_hours: 24,
    },
    secondary_sources: [], secondary_urls: [],
  };
}

function classificacao(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1", pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "processo",
    natureza: "official_action", relevancia: 8, atores: ["USCIS"], lugares: ["EUA"],
    acontecimento: ["prorrogação"], justificativa: "", ...over,
  };
}

function fetcherCom(pautas: Classificacao[]) {
  const chamadas: number[] = [];
  const f = vi.fn(async () => {
    chamadas.push(1);
    return new Response(
      JSON.stringify({
        id: "x",
        choices: [{ message: { content: JSON.stringify({ pautas }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetcher: f, chamadas };
}

/** Store de mentira que registra o que foi gravado e quando. */
function storeFalso(persistidas: Map<string, CandidataPersistida> = new Map()) {
  const gravadas: CandidataParaGravar[] = [];
  const leituras: string[][] = [];

  const store: CandidatosStore = {
    async buscarPorUrls(_p, urls) {
      leituras.push(urls);
      const m = new Map<string, CandidataPersistida>();
      for (const u of urls) {
        const achada = persistidas.get(u);
        if (achada) m.set(u, achada);
      }
      return m;
    },
    async buscarPorStoryIds() { return new Map(); },
    async gravarNovas(_p, candidatas) {
      gravadas.push(...candidatas);
      return { gravadas: candidatas.length, reaproveitadas: 0, jaClassificadas: [], erros: [] };
    },
    async atualizarStatus() {},
    async gravarVerificacao() {},
  };

  return { store, gravadas, leituras };
}

function persistida(over: Partial<CandidataPersistida>): CandidataPersistida {
  return {
    id: "db-1", projectId: PROJ, storyId: "s1", url: "https://a.com/1", canonicalUrl: null,
    sourceDomain: null, sourceKey: null, title: "T", summary: "", status: "approved",
    classificacao: classificacao(), classificationStatus: "done", classifiedAt: null,
    eventFingerprint: null, topicId: null, editorialScore: null, decisionReason: null,
    sourceResolved: true, enrichmentStatus: "done", factualPackage: null, embedding: null,
    verificacao: null, assinatura: assinaturaDoClassificador(montarSystemDoClassificador(), ENV),
    ...over,
  };
}

describe("persistência de todos os classificados", () => {
  it("a rejeitada também é gravada, não só o pool", async () => {
    const { store, gravadas } = storeFalso();
    const { fetcher } = fetcherCom([
      classificacao({ id: "1" }),
      classificacao({ id: "2", leitura: "desfavoravel", eixo: "decisao_judicial" }),
    ]);

    const r = await avaliarPautas(
      [grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1"),
       grupo("2", "Agente do ICE acusado é preso", "https://b.com/2")],
      { canal: "newsletter", historico: [], config, env: ENV, fetcher,
        candidatos: { store, projectId: PROJ } },
    );

    expect(r.approvedEditorialPool).toHaveLength(1);
    expect(r.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);

    // As duas foram gravadas: a aprovada e a rejeitada.
    expect(gravadas).toHaveLength(2);
    const porUrl = new Map(gravadas.map((g) => [g.url, g]));
    expect(porUrl.get("https://a.com/1")!.status).toBe("approved");
    expect(porUrl.get("https://b.com/2")!.status).toBe("rejected");
    expect(porUrl.get("https://b.com/2")!.decisionReason).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);
  });

  it("nenhuma candidata é gravada com estado de canal", async () => {
    const { store, gravadas } = storeFalso();
    const { fetcher } = fetcherCom([classificacao({ id: "1" })]);

    await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
      candidatos: { store, projectId: PROJ },
    });

    for (const g of gravadas) {
      expect(g.status).not.toBe("selected");
      expect(g.status).not.toBe("capped");
    }
  });

  it("a classificação vai com a assinatura, para poder ser invalidada depois", async () => {
    const { store, gravadas } = storeFalso();
    const { fetcher } = fetcherCom([classificacao({ id: "1" })]);

    await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
      candidatos: { store, projectId: PROJ },
    });

    const esperada = assinaturaDoClassificador(montarSystemDoClassificador(), ENV);
    expect(gravadas[0].assinatura).toEqual(esperada);
  });
});

describe("reuso da classificação persistida", () => {
  it("candidata já classificada não vai ao modelo de novo", async () => {
    const jaNoBanco = new Map([
      ["https://a.com/1", persistida({ url: "https://a.com/1", classificacao: classificacao({ id: "db-1" }) })],
    ]);
    const { store } = storeFalso(jaNoBanco);
    const { fetcher, chamadas } = fetcherCom([]);

    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
      candidatos: { store, projectId: PROJ },
    });

    // Nenhuma chamada ao classificador: a leitura veio do banco.
    expect(chamadas).toHaveLength(0);
    expect(r.reuso.classificacoesReaproveitadas).toBe(1);
    expect(r.reuso.classificadasAgora).toBe(0);
    // E a pauta continua sendo avaliada normalmente.
    expect(r.approvedEditorialPool).toHaveLength(1);
  });

  it("assinatura diferente manda a candidata de volta ao classificador", async () => {
    const outraLeitura = { versao: 99, modelo: "modelo-antigo", promptHash: "aaaaaaaaaaaa" };
    const jaNoBanco = new Map([
      ["https://a.com/1", persistida({ url: "https://a.com/1", assinatura: outraLeitura })],
    ]);
    const { store } = storeFalso(jaNoBanco);
    const { fetcher, chamadas } = fetcherCom([classificacao({ id: "1" })]);

    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
      candidatos: { store, projectId: PROJ },
    });

    expect(chamadas.length).toBeGreaterThan(0);
    expect(r.reuso.classificacoesReaproveitadas).toBe(0);
  });

  it("mistura: uma do banco e uma nova, só a nova vai ao modelo", async () => {
    const jaNoBanco = new Map([
      ["https://a.com/1", persistida({ url: "https://a.com/1" })],
    ]);
    const { store } = storeFalso(jaNoBanco);
    const { fetcher } = fetcherCom([classificacao({ id: "2" })]);

    const r = await avaliarPautas(
      [grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1"),
       grupo("2", "Outra pauta do USCIS sobre prazo", "https://b.com/2")],
      { canal: "newsletter", historico: [], config, env: ENV, fetcher,
        candidatos: { store, projectId: PROJ } },
    );

    expect(r.reuso.classificacoesReaproveitadas).toBe(1);
    expect(r.reuso.classificadasAgora).toBe(1);
  });

  it("banco fora do ar não impede a edição de sair", async () => {
    const store: CandidatosStore = {
      async buscarPorUrls() { throw new Error("banco indisponível"); },
      async buscarPorStoryIds() { return new Map(); },
      async gravarNovas() { throw new Error("banco indisponível"); },
      async atualizarStatus() {},
      async gravarVerificacao() {},
    };
    const { fetcher, chamadas } = fetcherCom([classificacao({ id: "1" })]);

    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
      candidatos: { store, projectId: PROJ },
    });

    expect(r.approvedEditorialPool).toHaveLength(1);
    expect(r.reuso.erros.length).toBeGreaterThan(0);
    expect(chamadas.length).toBeGreaterThan(0);
  });
});

describe("sem a camada persistida, nada muda", () => {
  it("a newsletter que já chamava esta função continua igual", async () => {
    const { fetcher } = fetcherCom([classificacao({ id: "1" })]);

    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1")], {
      canal: "newsletter", historico: [], config, env: ENV, fetcher,
    });

    expect(r.approvedEditorialPool).toHaveLength(1);
    expect(r.selecionadas).toHaveLength(1);
    expect(r.reuso.candidatasLidas).toBe(0);
    expect(r.reuso.persistidas).toBe(0);
  });
});
