import { describe, expect, it } from "vitest";
import {
  FEEDS_DIRETOS,
  composicaoAlternativa,
  motivoDaDesativacao,
} from "./composicao-alternativa";
import type { NewsSourceConfig } from "./news-sources";

/**
 * A troca de fontes acontece em memória, e cada corte carrega o motivo.
 *
 * O benchmark tem que rodar antes de mexer em produção, então nada aqui grava
 * nem desativa nada: a produção segue com as fontes de hoje até a
 * configuração ser aprovada.
 */

function fonte(over: Partial<NewsSourceConfig>): NewsSourceConfig {
  return {
    id: "x",
    name: "x",
    type: "rss",
    url: "https://exemplo.com/feed",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
    ...over,
  } as NewsSourceConfig;
}

describe("o que sai da composição", () => {
  it("a consulta site:uscis.gov sai, porque USCIS já é direto", () => {
    const m = motivoDaDesativacao(
      fonte({ url: "https://news.google.com/rss/search?q=site%3Auscis.gov&hl=en-US" }),
    );
    expect(m).toContain("uscis.gov");
    expect(m).toContain("circular");
  });

  it("o feed de avisos de viagem sai, e o domínio do State Department não", () => {
    expect(motivoDaDesativacao(fonte({ url: "https://travel.state.gov/_res/rss/TAsTWs.xml" }))).toContain(
      "TERCEIROS países",
    );
    // Outro feed do mesmo domínio não é atingido pela regra.
    expect(motivoDaDesativacao(fonte({ url: "https://travel.state.gov/_res/rss/visabulletin.xml" }))).toBeNull();
  });

  it("uma das duas consultas de brasileiros nos EUA fica", () => {
    const a = motivoDaDesativacao(
      fonte({ url: "https://news.google.com/rss/search?q=brasileiros+%22Estados+Unidos%22+%28trabalho+OR+empresa%29" }),
    );
    const b = motivoDaDesativacao(
      fonte({ url: "https://news.google.com/rss/search?q=brasileiros+%22Estados+Unidos%22+%28visto+OR+imigra%C3%A7%C3%A3o%29" }),
    );
    // Exatamente uma sai: zerar o ângulo comunitário seria perder cobertura
    // sem substituto entre os cinco feeds diretos.
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("a consulta de asilo e refúgio permanece: nenhum feed direto cobre o ângulo", () => {
    expect(
      motivoDaDesativacao(
        fonte({ url: "https://news.google.com/rss/search?q=%22asilo%22+OR+%22refugiados%22+%22Estados+Unidos%22" }),
      ),
    ).toBeNull();
  });

  it("institucional de volume baixo não é cortada por não ter aprovado", () => {
    for (const url of [
      "https://www.whitehouse.gov/presidential-actions/feed/",
      "https://www.bal.com/feed/",
      "https://www.murthy.com/feed/",
      "https://www.uscis.gov/news/rss-feed/22984",
    ]) {
      expect(motivoDaDesativacao(fonte({ url })), url).toBeNull();
    }
  });

  it("fonte fora da vertical sai com o número que a condena", () => {
    const m = motivoDaDesativacao(fonte({ url: "https://www.areadevelopment.com/rss/newsitems.xml" }));
    expect(m).toContain("21 itens");
    expect(m).toContain("0 imigração");
  });
});

describe("substituir, não somar", () => {
  const banco = [
    fonte({ id: "gn-uscis", url: "https://news.google.com/rss/search?q=site%3Auscis.gov" }),
    fonte({ id: "ta", url: "https://travel.state.gov/_res/rss/TAsTWs.xml" }),
    fonte({ id: "area", url: "https://www.areadevelopment.com/rss/newsitems.xml" }),
    fonte({ id: "uscis", url: "https://www.uscis.gov/news/rss-feed/22984" }),
    fonte({ id: "asilo", url: "https://news.google.com/rss/search?q=%22asilo%22+OR+%22refugiados%22" }),
  ];

  it("corta o inútil e acrescenta os diretos", () => {
    const r = composicaoAlternativa(banco);

    expect(r.desativadas.map((d) => d.id).sort()).toEqual(["area", "gn-uscis", "ta"]);
    expect(r.acrescentadas).toHaveLength(FEEDS_DIRETOS.length);
    // Sobram as duas que ficam, mais os cinco diretos.
    expect(r.fontes).toHaveLength(2 + FEEDS_DIRETOS.length);
  });

  it("todo corte tem motivo escrito", () => {
    for (const d of composicaoAlternativa(banco).desativadas) {
      expect(d.motivo.length, d.nome).toBeGreaterThan(30);
    }
  });

  it("não duplica um feed direto que já esteja no banco", () => {
    const comWolfsdorf = [...banco, fonte({ id: "w", url: FEEDS_DIRETOS[0].url })];
    const r = composicaoAlternativa(comWolfsdorf);
    const urls = r.fontes.map((f) => f.url);
    expect(urls.filter((u) => u === FEEDS_DIRETOS[0].url)).toHaveLength(1);
  });

  it("os cinco diretos entram como prioridade 2, não como ato oficial", () => {
    // Análise de escritório explica o ato; a promoção por prioridade deve
    // continuar preferindo a fonte primária.
    for (const f of FEEDS_DIRETOS) expect(f.priority).toBe(2);
  });
});
