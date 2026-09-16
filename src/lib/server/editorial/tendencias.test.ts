import { describe, expect, it, vi } from "vitest";
import {
  coletarTendencias,
  limparTendencias,
  termoDoArtigo,
  titulosDoRss,
  triarTendencias,
} from "./tendencias";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>pete hegseth pentagon speech</title><ht:approx_traffic>500+</ht:approx_traffic></item>
<item><title><![CDATA[barca game]]></title><ht:approx_traffic>20000+</ht:approx_traffic></item>
<item><title>aaron judge</title></item>
</channel></rss>`;

function respostas(mapa: Record<string, { status?: number; corpo: string }>) {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);
    for (const [chave, r] of Object.entries(mapa)) {
      if (url.includes(chave)) {
        return new Response(r.corpo, { status: r.status ?? 200 });
      }
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("leitura das fontes", () => {
  it("lê título e tráfego do RSS, com e sem CDATA", () => {
    const itens = titulosDoRss(RSS);
    expect(itens).toHaveLength(3);
    expect(itens[1]).toEqual({ titulo: "barca game", trafego: 20000 });
    // Item sem tráfego declarado vale zero, e não quebra.
    expect(itens[2]).toEqual({ titulo: "aaron judge", trafego: 0 });
  });

  it("transforma nome de artigo da Wikipédia em termo legível", () => {
    expect(termoDoArtigo("78th_Primetime_Emmy_Awards")).toBe("78th Primetime Emmy Awards");
  });
});

describe("coleta", () => {
  const paginas = JSON.stringify({
    items: [
      {
        articles: [
          { article: "Main_Page", views: 6999945 },
          { article: "Special:Search", views: 933806 },
          { article: "Wikipedia:Featured_pictures", views: 601043 },
          { article: "Federal_Reserve", views: 120000 },
        ],
      },
    ],
  });

  const hn = JSON.stringify({ hits: [{ title: "Show HN: um compilador", points: 300 }] });

  /**
   * Main_Page e Special:Search lideram TODO dia, com milhões de acessos, e não
   * dizem nada sobre o mundo. Sem este corte eles ocupariam duas das vagas de
   * tendência para sempre.
   */
  it("descarta as páginas de serviço da Wikipédia", async () => {
    const { tendencias } = await coletarTendencias({
      ontem: "2026-09-15",
      fetcher: respostas({
        "trends.google.com": { corpo: RSS },
        "wikimedia.org": { corpo: paginas },
        "hn.algolia.com": { corpo: hn },
      }),
    });

    const daWiki = tendencias.filter((t) => t.fonte === "wikipedia_us").map((t) => t.termo);
    expect(daWiki).toEqual(["Federal Reserve"]);
  });

  it("junta as quatro fontes", async () => {
    const { tendencias, avisos } = await coletarTendencias({
      ontem: "2026-09-15",
      fetcher: respostas({
        "trends.google.com": { corpo: RSS },
        "wikimedia.org": { corpo: paginas },
        "hn.algolia.com": { corpo: hn },
      }),
    });

    expect(avisos).toEqual([]);
    expect(new Set(tendencias.map((t) => t.fonte))).toEqual(
      new Set(["google_trends_us", "google_trends_br", "wikipedia_us", "hacker_news"]),
    );
  });

  /**
   * Tendência é enriquecimento do funil, nunca requisito dele. Um dia sem
   * Google Trends precisa ser um dia com menos busca extra, e não um dia sem
   * newsletter.
   */
  it("fonte que falha vira aviso e não derruba as outras", async () => {
    const { tendencias, avisos } = await coletarTendencias({
      ontem: "2026-09-15",
      fetcher: respostas({
        "trends.google.com": { status: 503, corpo: "" },
        "wikimedia.org": { corpo: paginas },
        "hn.algolia.com": { corpo: hn },
      }),
    });

    expect(avisos).toHaveLength(2);
    expect(avisos.join(" ")).toContain("503");
    expect(tendencias.length).toBeGreaterThan(0);
  });

  it("sem data de referência, a Wikipédia é pulada com aviso", async () => {
    const { avisos } = await coletarTendencias({
      fetcher: respostas({ "trends.google.com": { corpo: RSS }, "hn.algolia.com": { corpo: "{}" } }),
    });

    expect(avisos.join(" ")).toContain("sem data de referência");
  });
});

describe("limpeza", () => {
  it("tira repetição entre fontes e termo curto demais", () => {
    const limpas = limparTendencias([
      { termo: "Federal Reserve", fonte: "wikipedia_us", peso: 10 },
      { termo: "federal reserve", fonte: "google_trends_us", peso: 5 },
      { termo: "vti", fonte: "google_trends_us", peso: 100 },
    ]);

    expect(limpas.map((t) => t.termo)).toEqual(["Federal Reserve"]);
  });
});

describe("triagem", () => {
  function openaiFalso(resposta: unknown, status = 200) {
    return vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(resposta) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status },
      ),
    ) as unknown as typeof fetch;
  }

  const ENV = { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

  it("devolve só o que o modelo aprovou, até o teto", async () => {
    const fetcher = openaiFalso({
      aprovados: [
        { termo: "layoffs", eixo: "trabalho", consulta: "tech layoffs", motivo: "emprego" },
        { termo: "gas", eixo: "custo_de_vida", consulta: "gas prices", motivo: "bolso" },
        { termo: "fed", eixo: "economia", consulta: "fed rate decision", motivo: "juros" },
      ],
    });

    const r = await triarTendencias(
      [{ termo: "layoffs", fonte: "google_trends_us", peso: 1 }],
      ENV,
      fetcher,
      2,
    );

    expect(r.erro).toBeNull();
    expect(r.aprovadas).toHaveLength(2);
  });

  /**
   * Falha de triagem devolve lista VAZIA, e não a lista crua. Deixar o cru
   * passar seria pior do que não ter tendência: a coleta buscaria "aaron
   * judge" e a edição pagaria classificação por placar de jogo.
   */
  it("falha na triagem devolve vazio, nunca o cru", async () => {
    const r = await triarTendencias(
      [{ termo: "aaron judge", fonte: "google_trends_us", peso: 1 }],
      ENV,
      openaiFalso({}, 500),
    );

    expect(r.aprovadas).toEqual([]);
    expect(r.erro).toBeTruthy();
  });

  it("lista vazia não chama o modelo", async () => {
    const fetcher = openaiFalso({ aprovados: [] });
    const r = await triarTendencias([], ENV, fetcher);

    expect(r.aprovadas).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
