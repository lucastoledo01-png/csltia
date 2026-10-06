import { describe, expect, it, vi } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import type { FonteDoPacote, PacoteFactual } from "../editorial/pacote-factual";
import { carregarConfigEditorial } from "../editorial/config";
import type { TextoDaFonte } from "../editorial/enriquecimento";
import { linksOficiaisDoHtml } from "../editorial/enriquecimento";
import type { ResultadoVisual } from "../visual/tipos";
import {
  atribuicaoSemLastro,
  auditarArtigo,
  montarSystemDoArtigo,
  podarArtigo,
  renderizarArtigoHtml,
  semMarcadorDeLink,
  type Artigo,
  type ResultadoDoArtigo,
} from "./artigo";
import { alvosDasFontes, fundirPacotes, reunirFontesDaMateria, tituloEmPortugues } from "./fontes-da-materia";
import { rodarRamoDoPortal } from "./ramo-do-portal";
import { criarFotosDoDia } from "./sem-foto";

/**
 * A matéria profunda (06/10/2026): mais fontes do mesmo fato no pacote, e a
 * poda com a mesma régua. Cada régua nova tem aqui o caso que produz o NÃO.
 */

const SEM_MODELO = { OPENAI_API_KEY: "" };

function pacote(fatos: string[], extra: Partial<PacoteFactual> = {}): PacoteFactual {
  return {
    verified_facts: fatos,
    people: [],
    organizations: [],
    places: [],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: [],
    texto_de_origem: fatos.join(" "),
    ...extra,
  };
}

function lida(texto: string, veiculo: string, links: string[] = []): TextoDaFonte {
  return {
    texto,
    metadados: { titulo: "t", descricao: "", autores: [], publicadaEm: "", veiculo },
    via: "original",
    urlLida: "",
    notas: [],
    linksOficiais: links,
  };
}

const PRINCIPAL = {
  url: "https://thehill.com/policy/diesel",
  titulo: "Trump order on diesel",
  nome: "The Hill",
  vetor: [1, 0, 0],
  pacote: pacote(["Trump assinou uma ordem sobre o diesel."], { numbers: ["US$ 6,32 por galão"], texto_de_origem: "Diesel chegou a US$ 6,32 por galão." }),
};

describe("de onde vêm as outras fontes", () => {
  it("o grupo, as irmãs pelo cosseno e a fonte primária, sem agregador, sem imigração, sem o mesmo domínio", () => {
    const alvos = alvosDasFontes(
      {
        principal: PRINCIPAL,
        urlsDoGrupo: ["https://news.google.com/rss/articles/abc", "https://thehill.com/outra", "https://www.reuters.com/diesel?a=1&amp;b=2"],
        candidatas: [
          { url: "https://apnews.com/diesel", titulo: "AP", vetor: [0.9, 0.1, 0] },
          { url: "https://cnn.com/vistos", titulo: "visto", vetor: [1, 0, 0], imigracao: true },
          { url: "https://longe.com/outra", titulo: "outro fato", vetor: [0.5, 0.86, 0] },
          { url: "https://reuters.com/de-novo", titulo: "Reuters de novo", vetor: [1, 0, 0] },
        ],
      },
      ["https://www.whitehouse.gov/presidential-actions/diesel/"],
    );
    expect(alvos.map((a) => a.url)).toEqual([
      // `&amp;` desfeito: a fonte com entidade gravada viraria link quebrado.
      "https://www.reuters.com/diesel?a=1&b=2",
      "https://apnews.com/diesel",
      "https://www.whitehouse.gov/presidential-actions/diesel/",
    ]);
  });

  it("entre línguas ou de órgão oficial o limiar é 0.60; na mesma língua continua 0.70 (06/10/2026)", () => {
    // Cossenos com [1, 0, 0]: 0.66 e 0.62, os dois abaixo de 0.70 e acima de 0.60.
    const v066 = [0.66, Math.sqrt(1 - 0.66 ** 2), 0];
    const v062 = [0.62, Math.sqrt(1 - 0.62 ** 2), 0];
    const alvos = alvosDasFontes({
      principal: PRINCIPAL,
      candidatas: [
        { url: "https://oglobo.globo.com/diesel", titulo: "Trump assina ordem para reduzir o preço do diesel nos EUA", vetor: v066 },
        { url: "https://www.irs.gov/diesel-relief", titulo: "Emergency Tax Relief on Diesel Fuel", vetor: v062 },
        { url: "https://apnews.com/diesel-semelhante", titulo: "Diesel prices and the new order", vetor: v066 },
        { url: "https://g1.globo.com/longe", titulo: "Outro assunto qualquer da economia do Brasil", vetor: [0.5, 0.86, 0] },
      ],
    }, []);
    expect(alvos.map((a) => a.url)).toEqual(["https://oglobo.globo.com/diesel", "https://www.irs.gov/diesel-relief"]);
    expect(tituloEmPortugues("Trump order on diesel")).toBe(false);
    expect(tituloEmPortugues("Trump assina ordem para reduzir o preço do diesel")).toBe(true);
  });

  it("os links oficiais saem do CORPO, sem a home do órgão, sem PDF e sem o rodapé", () => {
    const html = `<header><a href="https://www.usa.gov/agencies">usa</a></header>
      <p>A <a href="https://www.whitehouse.gov/presidential-actions/2026/10/diesel/">ordem</a> e o <a href="https://www.eia.gov/">EIA</a> e o <a href="https://www.eia.gov/dados.pdf">PDF</a> e <a href="https://cnn.com/x">CNN</a>.</p>
      <footer><a href="https://www.usa.gov/contato">contato</a></footer>`;
    expect(linksOficiaisDoHtml(html, "https://thehill.com/x")).toEqual(["https://www.whitehouse.gov/presidential-actions/2026/10/diesel/"]);
  });
});

describe("reunir as fontes", () => {
  it("cada fonte vira o seu pacote, e o da matéria é a união com o dono de cada fato", async () => {
    const extrair = vi.fn(async (p: { titulo: string; texto: string; urls: string[] }) => ({
      pacote: pacote([`Fato da ${p.urls[0]}.`], { numbers: p.urls[0].includes("reuters") ? ["40 estados"] : [] }),
      custoUsd: 0.001,
      tokens: 10,
    }));
    const r = await reunirFontesDaMateria({
      principal: PRINCIPAL,
      urlsDoGrupo: ["https://reuters.com/diesel"],
      linksOficiais: ["https://www.whitehouse.gov/acoes/diesel"],
      buscarTexto: async (url) => lida(`texto de ${url} com 40 estados`, url.includes("reuters") ? "Reuters" : "The White House"),
      extrair: extrair as never,
    });
    expect(r.fontes.map((f) => `${f.id} ${f.nome}`)).toEqual(["F1 The Hill", "F2 Reuters", "F3 The White House"]);
    expect(r.pacote.fontes).toHaveLength(3);
    expect(r.pacote.verified_facts).toContain("Trump assinou uma ordem sobre o diesel.");
    expect(r.pacote.verified_facts).toContain("Fato da https://reuters.com/diesel.");
    expect(r.pacote.source_urls).toEqual(["https://thehill.com/policy/diesel", "https://reuters.com/diesel", "https://www.whitehouse.gov/acoes/diesel"]);
    // O separador do texto de origem leva o nome, nunca o id com número.
    expect(r.pacote.texto_de_origem).not.toMatch(/F\d/);
    expect(r.custoUsd).toBeCloseTo(0.002);
  });

  it("o teto de fontes e de leituras vale, e fonte sem fato não entra", async () => {
    const buscar = vi.fn(async (url: string) => (url.includes("recusa") ? null : lida("texto", "Veículo")));
    const r = await reunirFontesDaMateria({
      principal: PRINCIPAL,
      urlsDoGrupo: ["https://recusa.com/a", "https://vazio.com/a", "https://b.com/a", "https://c.com/a", "https://d.com/a", "https://e.com/a"],
      linksOficiais: [],
      maximoDeFontes: 3,
      buscarTexto: buscar,
      extrair: (async (p: { urls: string[] }) => {
        if (p.urls[0].includes("vazio")) throw new Error("Extrator não devolveu nenhum fato verificado para esta pauta.");
        return { pacote: pacote(["Fato."]), custoUsd: 0, tokens: 0 };
      }) as never,
    });
    expect(r.fontes.map((f) => f.url)).toEqual(["https://thehill.com/policy/diesel", "https://b.com/a", "https://c.com/a"]);
    expect(r.linhasDeLog.join("\n")).toContain("recusou o robô");
    expect(r.linhasDeLog.join("\n")).toContain("sem fato aproveitável");
  });

  it("sem outra fonte, o pacote é o da principal, intocado", async () => {
    const r = await reunirFontesDaMateria({ principal: PRINCIPAL, linksOficiais: [], buscarTexto: async () => null });
    expect(r.pacote).toBe(PRINCIPAL.pacote);
    expect(r.pacote.fontes).toBeUndefined();
  });
});

const fonte = (id: string, nome: string, texto: string, principal = false): FonteDoPacote => ({
  id,
  nome,
  url: `https://${nome.toLowerCase().replace(/\s+/g, "")}.com/x`,
  principal,
  verified_facts: [texto],
  people: [],
  organizations: [],
  places: [],
  dates: [],
  numbers: [],
  gaps: [],
  texto_de_origem: texto,
});
const DUAS = fundirPacotes([fonte("F1", "The Hill", "O diesel chegou a US$ 6,32 por galão.", true), fonte("F2", "Reuters", "A ordem vale para 40 estados.")]);

describe("atribuição: o número é de quem o texto diz que é", () => {
  it("o número citado da fonte certa passa", () => {
    expect(atribuicaoSemLastro("A ordem vale para 40 estados, [[segundo a Reuters|F2]].", DUAS)).toBeNull();
    expect(atribuicaoSemLastro("O diesel chegou a US$ 6,32 por galão, segundo a The Hill.", DUAS)).toBeNull();
  });

  it("o número de uma fonte atribuído à outra é recusado, pelo marcador e pelo nome", () => {
    expect(atribuicaoSemLastro("A ordem vale para 40 estados, [[segundo a The Hill|F1]].", DUAS)).toMatch(/"40" não está em The Hill/);
    expect(atribuicaoSemLastro("O diesel chegou a US$ 6,32 por galão, de acordo com a Reuters.", DUAS)).toMatch(/não está em Reuters/);
  });

  it("com uma fonte só, a régua não se aplica (a ancoragem dura já confere)", () => {
    expect(atribuicaoSemLastro("A ordem vale para 40 estados, segundo a Reuters.", pacote(["x"]))).toBeNull();
  });

  it("o trecho atribuído errado é APAGADO pela poda, e o resto fica", async () => {
    const artigo: Artigo = {
      titulo: "Trump assina ordem sobre o diesel nos EUA",
      subtitulo: "",
      titulo_seo: "Trump assina ordem sobre o diesel nos EUA",
      descricao_seo: "O diesel chegou a US$ 6,32 por galão nos Estados Unidos.",
      abertura: ["O diesel chegou a US$ 6,32 por galão, [[segundo a The Hill|F1]].", "A ordem vale para 40 estados, [[segundo a The Hill|F1]]."],
      secoes: [],
      perguntas: [],
    };
    const v = await auditarArtigo(artigo, DUAS, { env: SEM_MODELO });
    expect(v.bloqueios.join(" ")).toContain("REJECT_MISATTRIBUTED_NUMBER");
    const poda = podarArtigo(artigo, v);
    expect(poda.artigo.abertura).toEqual(["O diesel chegou a US$ 6,32 por galão, [[segundo a The Hill|F1]]."]);
    expect(poda.bloqueios).toEqual([]);
  });
});

describe("o link de cada fonte dentro do texto", () => {
  it("o marcador com id vira o link daquela fonte, uma vez, também fora da abertura", () => {
    const artigo: Artigo = {
      titulo: "t",
      subtitulo: "",
      titulo_seo: "título de busca",
      descricao_seo: "descrição de busca com tamanho",
      abertura: ["O diesel subiu, [[segundo a The Hill|F1]]."],
      secoes: [{ intertitulo: "O que muda?", paragrafos: ["A ordem vale para 40 estados, [[segundo a Reuters|F2]].", "De novo [[a Reuters|F2]]."] }],
      perguntas: [],
    };
    const fontes = [
      { id: "F1", nome: "The Hill", url: "https://thehill.com/x" },
      { id: "F2", nome: "Reuters", url: "https://reuters.com/x?a=1&b=2" },
    ];
    const html = renderizarArtigoHtml(artigo, fontes[0], { fontes, fontesDoTexto: fontes });
    expect(html).toContain('<a href="https://thehill.com/x" rel="noopener" target="_blank">segundo a The Hill</a>');
    expect(html).toContain('<a href="https://reuters.com/x?a=1&amp;b=2" rel="noopener" target="_blank">segundo a Reuters</a>');
    expect(html).toContain("De novo a Reuters.");
    expect(html).not.toContain("|F");
    expect(html).toContain('<section class="fontes">');
    expect((html.match(/<section class="fontes">[\s\S]*?<\/section>/)?.[0].match(/<li>/g) ?? []).length).toBe(2);
  });

  it("o marcador some do texto conferido", () => {
    expect(semMarcadorDeLink("x [[segundo a Reuters|F2]] y [[a The Hill]]")).toBe("x segundo a Reuters y a The Hill");
  });

  it("com uma fonte, o prompt é o de antes; com várias, ganha o contrato das fontes", () => {
    const marca = { nome: "eua.journal", nicho: "EUA", briefing: "", voz: "" };
    expect(montarSystemDoArtigo(marca)).toBe(montarSystemDoArtigo(marca, { variasFontes: false }));
    expect(montarSystemDoArtigo(marca)).not.toContain("VÁRIAS FONTES");
    expect(montarSystemDoArtigo(marca, { variasFontes: true })).toContain("[[segundo a Reuters|F2]]");
  });
});

describe("no ramo do portal", () => {
  const P: PautaAvaliada = {
    grupo: {
      primary: { id: "c1", url: "https://thehill.com/policy/diesel", title: "Diesel", source_name: "The Hill", priority: 1, published_at: "2026-10-06T09:00:00Z", description: "", content: "", category: "geral", score: 0, dedupe_key: "k", window_hours: 72 },
      secondary_sources: [],
      secondary_urls: [],
    },
    storyId: "s1",
    classificacao: { id: "c1", pais: "EUA", imigracao: false, leitura: "oportunidade", eixo: "custo_de_vida", natureza: "official_action", relevancia: 7, atores: [], lugares: [], acontecimento: [], justificativa: "" },
    enriquecimento: { texto: "texto" } as never,
    motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
    veredito: { repetida: false } as never,
    pontuacao: { total: 90, partes: {}, explicacao: "" } as never,
    vetor: [1, 0],
  } as unknown as PautaAvaliada;
  const ARTIGO: Artigo = {
    titulo: "Trump assina ordem sobre o diesel nos EUA",
    subtitulo: "",
    titulo_seo: "Trump assina ordem sobre o diesel nos EUA",
    descricao_seo: "O diesel chegou a US$ 6,32 por galão nos Estados Unidos.",
    abertura: ["O diesel chegou a US$ 6,32 por galão, [[segundo a The Hill|F1]]."],
    secoes: [],
    perguntas: [],
    assuntos: ["diesel"],
  };
  const escrito = { artigo: ARTIGO, tentativas: 1, erro: null, veredicto: { aprovado: true, bloqueios: [], avisos: [], ancoragem: { conferidos: 1, naoSustentadas: [] }, conclusoesSemLastro: [], unidadesReprovadas: [] } } as ResultadoDoArtigo;
  const visual = {
    storyId: "s1",
    entidade: null,
    asset: {
      imageUrl: "https://images.pexels.com/photos/1/a.jpeg?auto=compress&amp;cs=tinysrgb",
      source: "banco_conceitual",
      sourcePageUrl: "https://www.pexels.com/photo/diesel-1/",
      author: "Fulana",
      license: "Pexels License",
      width: 1200,
      height: 800,
      metadata: { provedor: "pexels" },
    } as never,
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
  } as ResultadoVisual;

  it("escreve com o pacote ampliado, lista todas as fontes, e a capa vai limpa, com legenda e crédito", async () => {
    const escrever = vi.fn(async () => escrito);
    const r = await rodarRamoDoPortal({
      pool: [P],
      pacotes: new Map([[P.grupo.primary.url, PRINCIPAL.pacote]]),
      historico: [],
      config: carregarConfigEditorial({}),
      marca: { nome: "eua.journal", nicho: "EUA", briefing: "", voz: "" },
      data: "2026-10-06",
      timezone: "America/Sao_Paulo",
      horarios: ["06:07"],
      escrever,
      ampliarPacote: async () => ({ pacote: DUAS, linhasDeLog: ["[FONTES] F2 grupo"] }),
      descreverCapa: async () => "um caminhão em um posto de combustível",
      fotos: criarFotosDoDia<PautaAvaliada>((p) => p.storyId, async () => visual),
    });
    expect((escrever.mock.calls[0] as unknown[])[1]).toBe(DUAS);
    const c = r.pecas[0].conteudo;
    expect(c.capa).toBe("https://images.pexels.com/photos/1/a.jpeg?auto=compress&cs=tinysrgb");
    expect(c.html).toContain('<p class="legenda-da-capa">Um caminhão em um posto de combustível.</p>');
    expect(c.html).toContain("Foto: Fulana, Licença Pexels, via Pexels");
    expect(c.html).toContain('href="https://www.pexels.com/photo/diesel-1/"');
    // O banco conceitual grava 1200x800 fixo: medida inventada não vai para o crédito.
    expect(c.html).not.toContain("data-largura");
    expect(c.sourceUrls).toEqual(DUAS.source_urls);
    expect(c.origem?.pacote.fontes).toHaveLength(2);
    expect(r.linhasDeLog.join("\n")).toContain("[FONTES] F2 grupo");
    // O cache da camada comum não mudou: a newsletter segue com o pacote dela.
  });

  it("descrição com nome que o pacote não tem vira legenda neutra", async () => {
    const r = await rodarRamoDoPortal({
      pool: [P],
      pacotes: new Map([[P.grupo.primary.url, PRINCIPAL.pacote]]),
      historico: [],
      config: carregarConfigEditorial({}),
      marca: { nome: "eua.journal", nicho: "EUA", briefing: "", voz: "" },
      data: "2026-10-06",
      timezone: "America/Sao_Paulo",
      horarios: ["06:07"],
      escrever: async () => escrito,
      descreverCapa: async () => "o governador Gavin Newsom discursa",
      fotos: criarFotosDoDia<PautaAvaliada>((p) => p.storyId, async () => visual),
    });
    expect(r.pecas[0].conteudo.html).toContain('<p class="legenda-da-capa">Imagem ilustrativa: diesel.</p>');
  });
});
