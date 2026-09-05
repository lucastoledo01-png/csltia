import { describe, expect, it } from "vitest";
import { corpoUtil, parseRSSItems } from "./collector";


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

    const items = parseRSSItems(xml);

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

    const items = parseRSSItems(xml);

    expect(items[0].imageUrl).toBe("https://example.com/capa.jpg");
  });
});

describe("corpo da notícia", () => {
  it("desfaz o HTML escapado do Google News em vez de tratá-lo como texto", () => {
    const xml = `<rss><channel><item>
      <title>USCIS amplia prazo do EAD</title>
      <link>https://news.google.com/rss/articles/ABC?oc=5</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <description>&amp;lt;a href="https://news.google.com/x"&amp;gt;USCIS amplia prazo do EAD&amp;lt;/a&amp;gt;&amp;amp;nbsp;&amp;lt;font color="#6f6f6f"&amp;gt;Reuters&amp;lt;/font&amp;gt;</description>
    </item></channel></rss>`;

    const [item] = parseRSSItems(xml);
    expect(item.description).not.toContain("href");
    expect(item.description).not.toContain("&lt;");
  });

  it("descarta descrição que é só o título repetido mais o veículo", () => {
    expect(corpoUtil("USCIS amplia prazo do EAD Reuters", "USCIS amplia prazo do EAD")).toBe("");
  });

  it("preserva descrição que traz informação além do título", () => {
    const corpo =
      "O prazo de renovação automática da permissão de trabalho passou de 180 para 540 dias, " +
      "segundo aviso publicado pelo órgão nesta quinta-feira.";
    expect(corpoUtil(corpo, "USCIS amplia prazo do EAD")).toBe(corpo);
  });
});
