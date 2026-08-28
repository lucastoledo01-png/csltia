import { describe, expect, it } from "vitest";
import { parseRSSItems } from "./collector";
import type { NewsSourceConfig } from "./news-sources";

const source: NewsSourceConfig = {
  id: "test-source",
  name: "Fonte de Teste",
  type: "rss",
  url: "https://example.com/feed",
  enabled: true,
  priority: 1,
  category: "tech_media",
};

describe("parseRSSItems", () => {
  it("ignora media:content de vídeo e usa fallback em vez de quebrar o <img>", () => {
    const xml = `<rss><channel>
      <item>
        <title>AWS mostra fluxo criativo com agentes de IA</title>
        <link>https://aws.amazon.com/blogs/machine-learning/exemplo/</link>
        <pubDate>Fri, 28 Aug 2026 09:00:00 GMT</pubDate>
        <description>Resumo do post.</description>
        <media:content url="https://d2908q01vomqb2.cloudfront.net/artifacts/DBSBlogs/ml-21711/video.mp4" type="video/mp4" />
      </item>
    </channel></rss>`;

    const items = parseRSSItems(xml, source);

    expect(items).toHaveLength(1);
    expect(items[0].imageUrl).toBeDefined();
    expect(items[0].imageUrl).not.toMatch(/\.mp4$/);
  });

  it("aceita media:content quando é realmente uma imagem", () => {
    const xml = `<rss><channel>
      <item>
        <title>Notícia com imagem oficial</title>
        <link>https://example.com/noticia</link>
        <pubDate>Fri, 28 Aug 2026 09:00:00 GMT</pubDate>
        <description>Resumo.</description>
        <media:content url="https://example.com/capa.jpg" type="image/jpeg" />
      </item>
    </channel></rss>`;

    const items = parseRSSItems(xml, source);

    expect(items[0].imageUrl).toBe("https://example.com/capa.jpg");
  });
});
