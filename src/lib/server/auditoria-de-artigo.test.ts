import { describe, expect, it } from "vitest";
import {
  auditarMateria,
  contextoDoConjunto,
  faltasNoJsonLd,
  motivoDeRespostaSemLastro,
  paisIdentificavel,
  relatorioEmCsv,
  relatorioEmMarkdown,
  resumirAuditoria,
  siglasSoltas,
  type ArtigoAuditavel,
} from "./auditoria-de-artigo";

/** A matéria-modelo de 05/10/2026, como o piloto a deixou. */
const modelo: ArtigoAuditavel = {
  slug: "chicago-propoe-um-ano-sem-novos-data-centers-na-cidade-2026-09-24",
  title: "Chicago propõe um ano sem novos data centers na cidade",
  seo_title: "Chicago propõe um ano sem novos data centers na cidade",
  seo_description:
    "O prefeito Brandon Johnson e um grupo de vereadores defendem uma moratória de 12 meses para novos data centers dentro dos limites de Chicago.",
  category: "Política",
  cover_image: "https://images.pexels.com/photos/27451140/pexels-photo-27451140.jpeg?w=600",
  published_at: "2026-09-24T09:19:54.472Z",
  updated_at: "2026-10-05T20:38:45.197Z",
  source_urls: ["https://www.axios.com/x"],
  content_html:
    `<section><p>O prefeito Brandon Johnson e um grupo de vereadores defendem uma moratória de 12 meses para novos data centers dentro dos limites de Chicago. A cidade tem 39 data centers ativos.</p></section>` +
    `<section><h2>Demanda de data centers pode afetar contas</h2><p>Moradores de Chicago podem ter as contas de serviços públicos afetadas pela demanda crescente de data centers por eletricidade e água.</p></section>` +
    `<section><h2>Proposta suspende novos data centers por 12 meses</h2><p>Para moradores de Chicago, a proposta prevê suspender novos data centers por 12 meses enquanto a cidade estuda seus impactos.</p></section>` +
    `<p class="fonte">Fonte: <a href="https://www.axios.com/x" rel="noopener" target="_blank">Axios</a></p>`,
  aeo_questions: [
    { pergunta: "Quantos data centers ativos existem em Chicago?", resposta: "A cidade tem 39 data centers ativos." },
    { pergunta: "Por quanto tempo seria a moratória?", resposta: "A proposta prevê uma moratória de 12 meses para novos data centers." },
    { pergunta: "Quem defende a moratória?", resposta: "O prefeito Brandon Johnson e um grupo de vereadores defendem a moratória." },
  ],
};

describe("auditarMateria", () => {
  it("a matéria-modelo passa em todas as conferências", () => {
    const r = auditarMateria(modelo, contextoDoConjunto([modelo]));
    expect(r.problemas).toEqual([]);
    expect(r.nota).toBe(100);
    expect(r.checagens.reduce((s, c) => s + c.peso, 0)).toBe(100);
  });

  it("a matéria do desmonte sem tratamento: rótulo de gaveta, sem perguntas, título cortado com reticências", () => {
    const bruta: ArtigoAuditavel = {
      ...modelo,
      seo_title: "Juíza considera inconstitucional busca sem mandado no Flock, em…",
      content_html: (modelo.content_html ?? "").replace("Demanda de data centers pode afetar contas", "Por que importa"),
      aeo_questions: [],
    };
    const ids = auditarMateria(bruta, contextoDoConjunto([bruta])).checagens.filter((c) => !c.passou).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["titulo_seo_tamanho", "intertitulos_descritivos", "perguntas_presentes", "perguntas_sustentadas"]));
  });

  it("a foto repetida e a descrição repetida são contadas no conjunto", () => {
    const outra = { ...modelo, slug: "outra", cover_image: `${modelo.cover_image}&h=360` };
    const r = auditarMateria(modelo, contextoDoConjunto([modelo, outra]));
    expect(r.checagens.find((c) => c.id === "capa_exclusiva")!.detalhe).toBe("a mesma foto está em 2 matérias");
    expect(r.checagens.find((c) => c.id === "descricao_unica")!.passou).toBe(false);
  });

  it("lida da página no ar: a capa repetida no corpo e o JSON-LD pela metade são apontados", () => {
    const capa = modelo.cover_image!;
    const pagina = {
      jsonLd: [{ "@context": "https://schema.org", "@type": "NewsArticle", headline: "x", datePublished: "2026-09-24", publisher: {} }],
      canonical: "https://casaloti.ia.br/artigos/" + modelo.slug,
      html: `<img src="/_next/image?url=${encodeURIComponent(capa)}&amp;w=1920"><img src="${capa}&amp;w=600">`,
    };
    const r = auditarMateria(modelo, { ...contextoDoConjunto([modelo]), pagina });
    expect(r.checagens.find((c) => c.id === "capa_fora_do_corpo")!.passou).toBe(false);
    const jsonld = r.checagens.find((c) => c.id === "jsonld_completo")!;
    expect(jsonld.passou).toBe(false);
    expect(jsonld.detalhe).toContain("author Organization");
    expect(jsonld.pontos).toBeGreaterThan(0);
  });
});

describe("as réguas", () => {
  it("resposta com número que o corpo não tem não se sustenta", () => {
    const corpo = "A cidade tem 39 data centers ativos.";
    expect(motivoDeRespostaSemLastro("A cidade tem 39 data centers ativos.", corpo)).toBeNull();
    expect(motivoDeRespostaSemLastro("A cidade tem 45 data centers ativos.", corpo)).toMatch(/sem lastro/);
  });

  it("moeda situa o título; sigla desconhecida é apontada", () => {
    expect(paisIdentificavel("AMD compra a World Labs por US$ 8,20 bilhões")).toBe(true);
    expect(paisIdentificavel("Assistentes de IA ganham memória")).toBe(false);
    expect(siglasSoltas("FAA dos EUA abre caminho para o 737 Max")).toEqual(["FAA"]);
    expect(siglasSoltas("S&P 500 sobe nos EUA, diz o FBI")).toEqual(["S&P"]);
  });

  it("JSON-LD completo não falta nada", () => {
    expect(
      faltasNoJsonLd([
        {
          "@graph": [
            {
              "@type": "NewsArticle",
              headline: "h",
              datePublished: "d",
              dateModified: "d",
              image: ["i"],
              articleSection: "s",
              publisher: { "@id": "o" },
              author: { "@type": "Organization", name: "Redação" },
            },
            { "@type": "BreadcrumbList" },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("o relatório sai em Markdown e CSV, sem travessão", () => {
    const r = [auditarMateria(modelo, contextoDoConjunto([modelo]))];
    const md = relatorioEmMarkdown("T", "e", r, resumirAuditoria(r, new Map()));
    expect(md).toContain("Nota média: **100**");
    expect(md).not.toContain("\u2014");
    expect(relatorioEmCsv(r).split("\n")[1].startsWith(`"${modelo.slug}",100,ok`)).toBe(true);
  });
});
