import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial } from "./config";
import { avaliarPautas } from "./guarda";
import { assinaturaDoClassificador } from "./candidatos-store";
import type { CandidataPersistida, CandidatosStore } from "./candidatos-store";
import { montarSystemDoClassificador } from "./classificador";
import type { Classificacao } from "./classificador";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";

/**
 * A newsletter não pode mudar por causa da persistência.
 *
 * A camada de candidatas existe para eliminar classificação duplicada, não
 * para alterar o produto. Este arquivo roda a MESMA entrada pelos dois
 * caminhos e compara a saída inteira: as escolhidas, a ordem, os motivos de
 * recusa e a viabilidade.
 *
 * A única diferença admitida é de onde veio a classificação.
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
      id, url, title, source_name: `Fonte ${id}`, priority: 1,
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

/** As mesmas seis candidatas, com leituras distintas e estáveis. */
const GRUPOS = [
  grupo("1", "USCIS amplia prazo do EAD para 540 dias", "https://a.com/1"),
  grupo("2", "Departamento de Estado publica Visa Bulletin de outubro", "https://b.com/2"),
  grupo("3", "Agente do ICE acusado de mentir é preso", "https://c.com/3"),
  grupo("4", "Dólar sobe e fecha em alta após dado fiscal", "https://d.com/4"),
  grupo("5", "Fábrica anuncia mil vagas no Texas", "https://e.com/5"),
  grupo("6", "STF julga ação sobre competência de tribunais", "https://f.com/6"),
];

const LEITURAS = [
  classificacao({ id: "1", relevancia: 9 }),
  classificacao({ id: "2", relevancia: 8, atores: ["Departamento de Estado"] }),
  classificacao({ id: "3", leitura: "desfavoravel", eixo: "decisao_judicial", relevancia: 7 }),
  classificacao({ id: "4", pais: "Brasil", imigracao: false, eixo: "custo_de_vida", leitura: "desfavoravel", relevancia: 6, atores: ["Banco Central"] }),
  classificacao({ id: "5", eixo: "oportunidade", relevancia: 7, atores: ["Empresa"] }),
  classificacao({ id: "6", pais: "Brasil", imigracao: false, eixo: "deterioracao_brasil", leitura: "desfavoravel", relevancia: 5, atores: ["STF"] }),
];

function fetcherCom(pautas: Classificacao[]) {
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

/** Store cujo banco já tem TODAS as candidatas classificadas. */
function storeCheio(): CandidatosStore {
  const assinatura = assinaturaDoClassificador(montarSystemDoClassificador(), ENV);
  const porUrl = new Map<string, CandidataPersistida>();

  GRUPOS.forEach((g, i) => {
    porUrl.set(g.primary.url, {
      id: `db-${i}`, projectId: PROJ, storyId: `s${i}`, url: g.primary.url,
      canonicalUrl: null, sourceDomain: null, sourceKey: null,
      title: g.primary.title, summary: "", status: "approved",
      classificacao: LEITURAS[i], classificationStatus: "done", classifiedAt: null,
      eventFingerprint: null, topicId: null, editorialScore: null, decisionReason: null,
      sourceResolved: true, enrichmentStatus: "done", factualPackage: null, embedding: null,
      verificacao: null, assinatura,
    });
  });

  return {
    async buscarPorUrls(_p, urls) {
      const m = new Map<string, CandidataPersistida>();
      for (const u of urls) { const a = porUrl.get(u); if (a) m.set(u, a); }
      return m;
    },
    async buscarDaJanela() {
      return new Map(porUrl);
    },
    async buscarPorStoryIds() { return new Map(); },
    async gravarNovas() { return { gravadas: 0, reaproveitadas: 0, jaClassificadas: [], erros: [] }; },
    async atualizarStatus() {},
    async gravarVerificacao() {},
  };
}

function retrato(r: Awaited<ReturnType<typeof avaliarPautas>>) {
  return {
    selecionadas: r.selecionadas.map((s) => s.grupo.primary.id),
    ordem: r.selecionadas.map((s) => s.pontuacao.total),
    pool: r.approvedEditorialPool.map((s) => s.grupo.primary.id).sort(),
    recusas: r.recusadas.map((x) => `${x.url}:${x.motivo}`).sort(),
    viavel: r.viavel,
    motivoDaInviabilidade: r.motivoDaInviabilidade,
  };
}

describe("a newsletter antes e depois da persistência", () => {
  it("a composição é idêntica, venha a classificação do modelo ou do banco", async () => {
    const antes = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom(LEITURAS),
    });

    const depois = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV,
      // Nenhuma chamada ao modelo: tudo vem do banco.
      fetcher: fetcherCom([]),
      candidatos: { store: storeCheio(), projectId: PROJ },
    });

    expect(retrato(depois)).toEqual(retrato(antes));
  });

  it("as duas rodadas escolhem as mesmas pautas, na mesma ordem", async () => {
    const antes = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom(LEITURAS),
    });
    const depois = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom([]),
      candidatos: { store: storeCheio(), projectId: PROJ },
    });

    expect(depois.selecionadas.map((s) => s.grupo.primary.title)).toEqual(
      antes.selecionadas.map((s) => s.grupo.primary.title),
    );
  });

  it("os tetos da newsletter continuam valendo", async () => {
    const r = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom([]),
      candidatos: { store: storeCheio(), projectId: PROJ },
    });

    expect(r.selecionadas.length).toBeLessThanOrEqual(config.maximoDePautas);
    const doBrasil = r.selecionadas.filter((s) => s.classificacao.pais === "Brasil").length;
    expect(doBrasil).toBeLessThanOrEqual(config.maximoDePautasBrasil);
  });

  it("a única diferença é a origem da classificação", async () => {
    const depois = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom([]),
      candidatos: { store: storeCheio(), projectId: PROJ },
    });

    expect(depois.reuso.classificacoesReaproveitadas).toBe(GRUPOS.length);
    expect(depois.reuso.classificadasAgora).toBe(0);
  });

  it("banco fora do ar devolve exatamente o comportamento antigo", async () => {
    const quebrado: CandidatosStore = {
      async buscarPorUrls() { throw new Error("fora do ar"); },
      async buscarDaJanela() { throw new Error("fora do ar"); },
      async buscarPorStoryIds() { return new Map(); },
      async gravarNovas() { throw new Error("fora do ar"); },
      async atualizarStatus() {},
      async gravarVerificacao() {},
    };

    const antes = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom(LEITURAS),
    });
    const degradado = await avaliarPautas(GRUPOS, {
      canal: "newsletter", historico: [], config, env: ENV, fetcher: fetcherCom(LEITURAS),
      candidatos: { store: quebrado, projectId: PROJ },
    });

    expect(retrato(degradado)).toEqual(retrato(antes));
    expect(degradado.reuso.erros.length).toBeGreaterThan(0);
  });
});
