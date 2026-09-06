import { describe, expect, it } from "vitest";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import {
  escolherUrlPublicavel,
  lerSinaisObjetivos,
  paisDaFonte,
  programasCitados,
} from "./regras-duras";

/**
 * O que o código decide antes de perguntar ao modelo.
 *
 * A medição separou os dois tipos de campo: `pais` e `imigracao` não variaram
 * nenhuma vez em três classificações da mesma entrada, enquanto a relevância
 * variou em 64%. O modelo é confiável no categórico e instável no juízo, então
 * o categórico não deveria estar passando por ele.
 */

function grupo(url: string, secundarias: string[] = [], titulo = "Uma pauta"): DeduplicatedGroup {
  return {
    primary: {
      id: "c1",
      url,
      title: titulo,
      source_name: "Fonte",
      priority: 1,
      published_at: "2026-09-06T12:00:00Z",
      description: "",
      content: "",
      category: "geral",
      score: 0,
      dedupe_key: "k",
      window_hours: 72,
    },
    secondary_sources: secundarias.map(() => "Outra"),
    secondary_urls: secundarias,
  } as DeduplicatedGroup;
}

const GNEWS = "https://news.google.com/rss/articles/CBMiabc?oc=5";

describe("URL publicável", () => {
  it("fonte direta na principal passa direto", () => {
    const r = escolherUrlPublicavel(grupo("https://www.uscis.gov/news/alerta"));
    expect(r).toEqual({ ok: true, url: "https://www.uscis.gov/news/alerta", promovida: false, motivo: expect.any(String) });
  });

  it("agregador na principal é promovido para a origem que o enriquecimento leu", () => {
    const r = escolherUrlPublicavel(grupo(GNEWS, ["https://www.cnbc.com/materia"]), {
      enrichmentSources: ["https://www.uscis.gov/news/alerta"],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A lida vence a plausível: ali existe prova de que o link abre a matéria.
    expect(r.url).toBe("https://www.uscis.gov/news/alerta");
    expect(r.promovida).toBe(true);
  });

  it("sem enriquecimento, cai para a secundária do grupo", () => {
    const r = escolherUrlPublicavel(grupo(GNEWS, ["https://www.cnbc.com/materia"]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://www.cnbc.com/materia");
  });

  it("só agregador em tudo NÃO publica", () => {
    const r = escolherUrlPublicavel(grupo(GNEWS, ["https://news.yahoo.com/x"]), {
      enrichmentSources: ["https://news.google.com/outro"],
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/agregador/);
  });

  it("o caso real: ordem judicial que saiu com link do Google News", () => {
    // A pauta existia no feed oficial da USCIS e o deduplicador escolheu o
    // agregador como principal. O texto foi enriquecido por outra via, todos
    // os filtros passaram, e o leitor clicaria em news.google.com.
    const r = escolherUrlPublicavel(
      grupo(GNEWS, [], "Court Order on Diversity Immigrant Visa Program Hold Policy"),
      { enrichmentSources: ["https://www.uscis.gov/newsroom/alerts/court-order-dv"] },
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain("uscis.gov");
  });
});

describe("país que a fonte determina", () => {
  it("órgão americano é EUA sem perguntar a ninguém", () => {
    expect(paisDaFonte("https://www.uscis.gov/news")).toBe("EUA");
    expect(paisDaFonte("https://www.federalregister.gov/doc")).toBe("EUA");
    expect(paisDaFonte("https://apps.bea.gov/rss/rss.xml")).toBe("EUA");
  });

  it("veículo brasileiro é Brasil", () => {
    expect(paisDaFonte("https://g1.globo.com/politica/noticia")).toBe("Brasil");
    expect(paisDaFonte("https://www.infomoney.com.br/economia")).toBe("Brasil");
  });

  it("a categoria configurada na fonte tem a palavra final", () => {
    expect(paisDaFonte("https://exemplo.org/x", "gov_us")).toBe("EUA");
    expect(paisDaFonte("https://exemplo.org/x", "br_media")).toBe("Brasil");
  });

  it("quando a fonte não determina, devolve null e o modelo decide", () => {
    expect(paisDaFonte("https://www.reuters.com/world")).toBeNull();
    expect(paisDaFonte(GNEWS)).toBeNull();
  });
});

describe("programa migratório citado", () => {
  it("lê o que está escrito", () => {
    expect(programasCitados("USCIS muda a análise do EB-2 NIW")).toContain("eb2-niw");
    expect(programasCitados("Novo teto do H-1B para 2027")).toContain("h1b");
    expect(programasCitados("Visa Bulletin de outubro avança")).toContain("visa-bulletin");
  });

  it("EB-2 NIW não vira também EB-2", () => {
    const r = programasCitados("Caso de EB-2 NIW aprovado");
    expect(r).toContain("eb2-niw");
    expect(r).not.toContain("eb2");
  });

  it("pauta sem programa não inventa nenhum", () => {
    expect(programasCitados("Dólar sobe e fecha a R$ 5,13")).toEqual([]);
  });
});

describe("sinais objetivos", () => {
  it("junta tudo numa leitura só", () => {
    const s = lerSinaisObjetivos(grupo(GNEWS, [], "USCIS publica guia do EB-2 NIW"), {
      enriquecimento: { enrichmentSources: ["https://www.uscis.gov/policy-manual"] },
    });

    expect(s.urlPublicavel).toContain("uscis.gov");
    expect(s.urlPromovida).toBe(true);
    expect(s.pais).toBe("EUA");
    expect(s.programas).toContain("eb2-niw");
    expect(s.ehAgregador).toBe(true);
  });

  it("candidata sem saída deixa a URL nula, e quem chamou decide o que fazer", () => {
    const s = lerSinaisObjetivos(grupo(GNEWS));
    expect(s.urlPublicavel).toBeNull();
    expect(s.pais).toBeNull();
  });
});
