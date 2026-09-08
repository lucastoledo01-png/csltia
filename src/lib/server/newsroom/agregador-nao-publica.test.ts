import { describe, expect, it } from "vitest";
import { deduplicateCandidates } from "./deduplicator";
import type { NewsCandidate } from "./collector";

/**
 * O link que o assinante recebe.
 *
 * Nas edições de 04 e 05 de setembro de 2026, quatro matérias saíram com
 * `news.google.com/rss/articles/CBMi...` como fonte. Esse endereço leva a um
 * interstitial do Google e, seguido de fora, a `google.com/sorry`: o leitor
 * clica na fonte da notícia e não chega à notícia.
 *
 * A causa não era um filtro errado. O deduplicador escolhia o primário por
 * PRIORIDADE, e o `url` do primário é o que vai publicado. Google News é
 * descoberta; o que ele descobre tem endereço próprio.
 */

const GNEWS = "https://news.google.com/rss/articles/CBMiogFBVV95cUxPQnlaQ24";

function candidata(over: Partial<NewsCandidate> = {}): NewsCandidate {
  return {
    id: "c1",
    url: "https://www.uscis.gov/news/alerta",
    title: "Ordem judicial retoma análise de pedidos do Diversity Visa",
    source_name: "USCIS Alerts",
    priority: 1,
    published_at: "2026-09-08T10:00:00Z",
    description: "",
    content: "",
    category: "gov_us",
    image_url: "",
    score: 75,
    dedupe_key: "ordem-diversity",
    window_hours: 72,
    author: "",
    company_name: "",
    ...over,
  } as NewsCandidate;
}

describe("agregador nunca é a identidade do grupo", () => {
  it("chegando o agregador primeiro, a fonte direta assume o primário", () => {
    const { uniqueGroups } = deduplicateCandidates([
      candidata({ id: "g", url: GNEWS, source_name: "Google News, USCIS", priority: 1 }),
      candidata({ id: "d", url: "https://www.uscis.gov/news/alerta", source_name: "USCIS Alerts", priority: 1 }),
    ]);

    expect(uniqueGroups).toHaveLength(1);
    expect(uniqueGroups[0].primary.url).toBe("https://www.uscis.gov/news/alerta");
    expect(uniqueGroups[0].primary.source_name).toBe("USCIS Alerts");
    // O link do agregador não se perde: ele continua como secundário, que é
    // onde a descoberta pertence.
    expect(uniqueGroups[0].secondary_urls).toContain(GNEWS);
  });

  it("a regra do agregador vem antes da prioridade", () => {
    /*
     * Antes a troca só acontecia quando o candidato era prioridade 1 e o
     * primário era 2. Com os dois em prioridade 1, o agregador ficava.
     */
    const { uniqueGroups } = deduplicateCandidates([
      candidata({ id: "g", url: GNEWS, source_name: "Google News", priority: 1 }),
      candidata({ id: "d", url: "https://ogletree.com/insights/materia", source_name: "Ogletree", priority: 2 }),
    ]);

    expect(uniqueGroups[0].primary.url).toBe("https://ogletree.com/insights/materia");
  });

  it("fonte direta não é rebaixada por um agregador que chega depois", () => {
    const { uniqueGroups } = deduplicateCandidates([
      candidata({ id: "d", url: "https://www.uscis.gov/news/alerta", priority: 2 }),
      candidata({ id: "g", url: GNEWS, source_name: "Google News", priority: 1 }),
    ]);

    // O agregador é prioridade 1 e mesmo assim não sobe.
    expect(uniqueGroups[0].primary.url).toBe("https://www.uscis.gov/news/alerta");
  });

  it("grupo só de agregadores continua sem endereço próprio", () => {
    // Aqui não há o que promover, e é a guarda que recusa a pauta por fonte
    // não resolvida. O deduplicador não inventa origem.
    const { uniqueGroups } = deduplicateCandidates([
      candidata({ id: "g1", url: GNEWS, source_name: "Google News" }),
      candidata({ id: "g2", url: "https://news.yahoo.com/x", source_name: "Yahoo" }),
    ]);

    expect(uniqueGroups[0].primary.url).toContain("news.google.com");
  });

  it("a promoção por prioridade continua funcionando entre fontes reais", () => {
    const { uniqueGroups } = deduplicateCandidates([
      candidata({ id: "b", url: "https://blog.exemplo.com/materia", source_name: "Blog", priority: 2 }),
      candidata({ id: "o", url: "https://www.uscis.gov/news/alerta", source_name: "USCIS", priority: 1 }),
    ]);

    expect(uniqueGroups[0].primary.url).toBe("https://www.uscis.gov/news/alerta");
  });
});
