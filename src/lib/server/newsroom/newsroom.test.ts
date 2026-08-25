import { describe, expect, it } from "vitest";
import { collectFromSource, NewsCandidate } from "./collector";
import { deduplicateCandidates } from "./deduplicator";
import { defaultNewsSources, NewsSourceConfig } from "./news-sources";
import { rankAndFilterCandidates, scoreCandidate } from "./ranker";

describe("Newsroom - Coleta e Fontes", () => {
  it("contém fontes oficiais de IA configuradas com prioridade 1", () => {
    const officialLabs = defaultNewsSources.filter((s) => s.priority === 1);
    expect(officialLabs.length).toBeGreaterThanOrEqual(5);
    expect(officialLabs.some((s) => s.companyName === "OpenAI")).toBe(true);
    expect(officialLabs.some((s) => s.companyName === "Anthropic")).toBe(true);
    expect(officialLabs.some((s) => s.companyName === "Google")).toBe(true);
  });

  it("normaliza e limpa itens do feed RSS", async () => {
    const mockXML = `
      <rss version="2.0">
        <channel>
          <title>OpenAI News</title>
          <item>
            <title><![CDATA[Introducing GPT-5 Alpha]]></title>
            <link>https://openai.com/index/gpt-5-alpha/</link>
            <pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate>
            <description><![CDATA[<p>New model release with <b>advanced reasoning</b> capabilities.</p>]]></description>
          </item>
        </channel>
      </rss>
    `;

    const mockFetcher = async () => new Response(mockXML, { status: 200 });

    const source: NewsSourceConfig = {
      id: "openai-test",
      name: "OpenAI Blog",
      type: "rss",
      url: "https://openai.com/news/rss.xml",
      enabled: true,
      priority: 1,
      category: "lab",
    };

    const candidates = await collectFromSource(source, mockFetcher as any);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Introducing GPT-5 Alpha");
    expect(candidates[0].url).toBe("https://openai.com/index/gpt-5-alpha/");
    expect(candidates[0].description).toContain("New model release");
    expect(candidates[0].priority).toBe(1);
  });
});

describe("Newsroom - Deduplicação", () => {
  it("remove itens com URLs idênticas e agrupa fontes secundárias", () => {
    const now = new Date().toISOString();
    const candidate1: NewsCandidate = {
      id: "c1",
      url: "https://openai.com/index/gpt-5",
      title: "OpenAI lança modelo com raciocínio avançado",
      source_name: "OpenAI Blog",
      priority: 1,
      published_at: now,
      description: "Resumo oficial da OpenAI",
      content: "Conteúdo completo",
      category: "lab",
      score: 80,
      dedupe_key: "openai-gpt5",
      window_hours: 24,
    };

    const candidate2: NewsCandidate = {
      id: "c2",
      url: "https://openai.com/index/gpt-5",
      title: "OpenAI lança modelo com raciocínio avançado",
      source_name: "TechCrunch AI",
      priority: 2,
      published_at: now,
      description: "Matéria da TechCrunch",
      content: "Conteúdo completo",
      category: "tech_media",
      score: 60,
      dedupe_key: "openai-gpt5",
      window_hours: 24,
    };

    const result = deduplicateCandidates([candidate1, candidate2]);
    expect(result.uniqueGroups).toHaveLength(1);
    expect(result.duplicatesCount).toBe(1);
    expect(result.uniqueGroups[0].primary.source_name).toBe("OpenAI Blog");
    expect(result.uniqueGroups[0].secondary_sources).toContain("TechCrunch AI");
  });
});

describe("Newsroom - Ranking e Diversidade Editorial", () => {
  it("calcula score baseado em impacto, novidade, utilidade e credibilidade", () => {
    const candidate: NewsCandidate = {
      id: "c1",
      url: "https://anthropic.com/claude-3-7",
      title: "Claude 3.7 Sonnet lançado com API e suporte a código",
      source_name: "Anthropic News",
      company_name: "Anthropic",
      priority: 1,
      published_at: new Date().toISOString(),
      description: "Novo modelo traz benchmarks impressionantes para desenvolvedores.",
      content: "Conteúdo completo",
      category: "lab",
      score: 0,
      dedupe_key: "anthropic-claude37",
      window_hours: 24,
    };

    const ranked = scoreCandidate({ primary: candidate, secondary_sources: [], secondary_urls: [] });
    expect(ranked.score).toBeGreaterThanOrEqual(65);
    expect(ranked.breakdown.credibility).toBe(20);
  });

  it("limita o número máximo de pautas por empresa por edição a 2", () => {
    const now = new Date().toISOString();
    const createCandidate = (id: string, title: string): NewsCandidate => ({
      id,
      url: `https://openai.com/${id}`,
      title,
      source_name: "OpenAI Blog",
      company_name: "OpenAI",
      priority: 1,
      published_at: now,
      description: "Notícia de IA",
      content: "Conteúdo",
      category: "lab",
      score: 90,
      dedupe_key: id,
      window_hours: 24,
    });

    const groups = [
      { primary: createCandidate("1", "OpenAI Anúncio 1"), secondary_sources: [], secondary_urls: [] },
      { primary: createCandidate("2", "OpenAI Anúncio 2"), secondary_sources: [], secondary_urls: [] },
      { primary: createCandidate("3", "OpenAI Anúncio 3"), secondary_sources: [], secondary_urls: [] },
    ];

    const selected = rankAndFilterCandidates(groups);
    expect(selected).toHaveLength(2);
  });
});
