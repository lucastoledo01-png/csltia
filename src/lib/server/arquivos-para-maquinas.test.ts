import { describe, expect, it } from "vitest";
import { llmsTxt, sitemapDeNoticias } from "./arquivos-para-maquinas";
import robots from "@/app/robots";

const agora = new Date("2026-10-05T12:00:00.000Z");

describe("sitemap de notícias", () => {
  const materias = [
    { slug: "hoje", title: "S&P 500 sobe <muito>", published_at: "2026-10-05T09:00:00.000Z" },
    { slug: "ontem", title: "Ontem", published_at: "2026-10-04T13:00:00.000Z" },
    { slug: "velha", title: "Velha", published_at: "2026-10-02T09:00:00.000Z" },
    { slug: "sem-data", title: "Sem data", published_at: "16 de set. de 2026" },
  ];
  const xml = sitemapDeNoticias(materias, agora);

  it("só entra o que foi publicado nas últimas 48 horas", () => {
    expect(xml).toContain("/artigos/hoje</loc>");
    expect(xml).toContain("/artigos/ontem</loc>");
    expect(xml).not.toContain("velha");
    expect(xml).not.toContain("sem-data");
  });

  it("no formato do Google News: publicação eua.journal, idioma pt, título escapado", () => {
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain("<news:name>eua.journal</news:name><news:language>pt</news:language>");
    expect(xml).toContain("<news:publication_date>2026-10-05T09:00:00.000Z</news:publication_date>");
    expect(xml).toContain("<news:title>S&amp;P 500 sobe &lt;muito&gt;</news:title>");
  });

  it("sem matéria, continua sendo um urlset válido", () => {
    expect(sitemapDeNoticias([], agora)).toMatch(/<urlset[^>]*>\n<\/urlset>\n$/);
  });

  it("o robots.txt aponta para os dois sitemaps", () => {
    expect(robots().sitemap).toEqual(["https://casaloti.ia.br/sitemap.xml", "https://casaloti.ia.br/sitemap-noticias.xml"]);
  });
});

describe("llms.txt", () => {
  const texto = llmsTxt([
    { slug: "a-2026-10-05", title: "Emprego nos EUA [quase] não muda", seo_description: "O relatório de setembro.", published_at: "2026-10-05T09:00:00.000Z" },
  ]);

  it("diz o que o site é, com título e resumo no formato llmstxt.org", () => {
    expect(texto.startsWith("# eua.journal\n\n> ")).toBe(true);
  });

  it("lista as editorias com link para a página de cada uma", () => {
    expect(texto).toContain("- [Economia](https://casaloti.ia.br/editoria/economia):");
    expect(texto).toContain("- [Brasil](https://casaloti.ia.br/editoria/brasil):");
  });

  it("lista as matérias recentes e a newsletter", () => {
    expect(texto).toContain("- [Emprego nos EUA (quase) não muda](https://casaloti.ia.br/artigos/a-2026-10-05): O relatório de setembro.");
    expect(texto).toContain("(https://casaloti.ia.br/newsletter)");
  });

  it("não tem travessão", () => {
    expect(texto).not.toContain("\u2014");
  });
});
