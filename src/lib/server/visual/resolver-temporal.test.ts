import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset } from "./resolver";

/**
 * A barreira temporal dentro do resolvedor, não ao lado dele.
 *
 * O módulo de temporalidade tem seus próprios testes. Estes provam a
 * integração: que a recusa acontece DENTRO de `resolveVisualAsset`, antes da
 * pontuação, e que a correspondência de entidade não a compensa.
 */

const ENV = {
  WIKIMEDIA_USER_AGENT: "teste",
  VISUAL_RELEVANCIA_MINIMA: "10",
  VISUAL_LARGURA_MINIMA: "100",
};

/** Wikidata e Commons de mentira, devolvendo um arquivo escolhido. */
type EntidadeFalsa = { termo: string; qid: string; label: string; descricao: string; p31: string };

/** Q327333 é órgão do governo; Q5 é ser humano. */
const AGENCIA: EntidadeFalsa = {
  termo: "labor",
  qid: "Q1",
  label: "Bureau of Labor Statistics",
  descricao: "agência do governo dos EUA",
  p31: "Q327333",
};

function fetcherCom(
  arquivo: { titulo: string; descricao: string; categorias: string; data: string },
  entidades: EntidadeFalsa[] = [AGENCIA],
) {
  /*
   * O Wikidata de mentira responde à consulta, não a devolve sempre a mesma
   * entidade.
   *
   * Devolvendo uma só, todo ator da pauta resolvia para ela e o teste passava
   * a medir o mock: "USCIS" virava "Donald Trump" e a centralidade era
   * calculada sobre um nome que a busca nunca teria trazido.
   */
  const acha = (u: string): EntidadeFalsa | null => {
    const busca = decodeURIComponent(u).toLowerCase();
    return entidades.find((e) => busca.includes(e.termo.toLowerCase())) ?? null;
  };

  return vi.fn(async (url: string | URL) => {
    const u = String(url);

    if (u.includes("wikidata.org") && u.includes("wbsearchentities")) {
      const e = acha(u);
      return new Response(
        JSON.stringify({ search: e ? [{ id: e.qid, label: e.label, description: e.descricao }] : [] }),
        { status: 200 },
      );
    }

    if (u.includes("wikidata.org") && u.includes("wbgetentities")) {
      // P31 o que a entidade é, P17 Estados Unidos, P373 categoria no
      // Commons: o suficiente para a desambiguação aceitar a entidade.
      const entities: Record<string, unknown> = {};
      for (const e of entidades) {
        entities[e.qid] = {
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: e.p31 } } } }],
            P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
            P373: [{ mainsnak: { datavalue: { value: e.label } } }],
          },
        };
      }
      return new Response(JSON.stringify({ entities }), { status: 200 });
    }

    if (u.includes("commons.wikimedia.org")) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": {
                title: arquivo.titulo,
                imageinfo: [
                  {
                    url: "https://upload.wikimedia.org/foto.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:foto.jpg",
                    width: 3000,
                    height: 2000,
                    mime: "image/jpeg",
                    extmetadata: {
                      LicenseShortName: { value: "Public domain" },
                      Artist: { value: "Harris & Ewing" },
                      ImageDescription: { value: arquivo.descricao },
                      Categories: { value: arquivo.categorias },
                      DateTimeOriginal: { value: arquivo.data },
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      );
    }

    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

const PAUTA_DE_EMPREGO = {
  storyId: "s1",
  titulo: "EUA criam 162 mil empregos, contra 53 mil esperados",
  resumo: "O relatório mensal do mercado de trabalho veio acima do esperado.",
  categoria: "Economia",
  classificacao: {
    atores: ["Bureau of Labor Statistics"],
    lugares: ["Estados Unidos"],
    acontecimento: ["criação de empregos"],
    pais: "EUA",
  },
};

describe("a foto de 1937 não sai mais", () => {
  it("é recusada por HISTORICAL_EVENT_MISMATCH dentro do resolvedor", async () => {
    const fetcher = fetcherCom({
      titulo:
        "File:1,500,000 drop in employment, Senate Committee told by government labor statistics chief. " +
        "Washington, D.C., Jan. 4. Isador Lubin, Chief LCCN2016872803.jpg",
      descricao:
        "Isador Lubin, Chief of the Bureau of Labor Statistics, today estimated before the Special " +
        "Senate Committee that 1,500,000 persons lost industrial jobs.",
      categorias: "Images from the Library of Congress|Harris & Ewing Collection",
      data: "1937",
    });

    const r = await resolveVisualAsset(PAUTA_DE_EMPREGO, { env: ENV, fetcher });

    expect(r.status).toBe("NO_VALID_IMAGE");
    /*
     * A foto de 1937 não sai. Desde 17/09/2026 a peça não fica vazia: entra a
     * bandeira da publicação, que não finge ser do fato narrado. O que este
     * teste guarda é que a foto histórica foi RECUSADA, e isso não mudou.
     */
    expect(r.asset?.sourceAssetId ?? "").not.toContain("1937");

    const recusa = r.recusados.find((x) =>
      ["HISTORICAL_EVENT_MISMATCH", "SEMANTIC_CONTEXT_MISMATCH"].includes(x.motivo),
    );
    expect(recusa, JSON.stringify(r.recusados)).toBeTruthy();
  });

  it("a entidade estava certa, e isso não compensou", async () => {
    const fetcher = fetcherCom({
      titulo: "File:1,500,000 drop in employment, Senate Committee told. Jan. 4. Isador Lubin.jpg",
      descricao: "1,500,000 persons lost industrial jobs between October 15, 1937 and December 15.",
      categorias: "Images from the Library of Congress|Bureau of Labor Statistics",
      data: "1937",
    });

    const r = await resolveVisualAsset(PAUTA_DE_EMPREGO, { env: ENV, fetcher });

    // A entidade foi resolvida como a agência correta e a imagem ainda assim
    // não passou: a barreira é anterior à pontuação.
    expect(r.entidade?.nome.toLowerCase()).toContain("labor");
    // A foto da entidade não entrou; o que entrou foi a bandeira.
    expect(r.asset?.sourceAssetId ?? "").not.toContain("Isador");
    expect(r.status).toBe("NO_VALID_IMAGE");
  });
});

describe("imagem institucional recente continua passando", () => {
  it("fachada de 2019 numa pauta de processo é aceita", async () => {
    const fetcher = fetcherCom({
      titulo: "File:Bureau of Labor Statistics headquarters 2019.jpg",
      descricao: "Headquarters building of the Bureau of Labor Statistics in Washington.",
      categorias: "Government buildings in Washington, D.C.",
      data: "2019",
    });

    const r = await resolveVisualAsset(
      {
        ...PAUTA_DE_EMPREGO,
        titulo: "Agência publica novo formulário de estatística",
        resumo: "O órgão divulgou a atualização do formulário.",
      },
      { env: ENV, fetcher },
    );

    const recusasTemporais = r.recusados.filter((x) =>
      ["HISTORICAL_EVENT_MISMATCH", "SEMANTIC_CONTEXT_MISMATCH", "TEMPORAL_MISMATCH"].includes(x.motivo),
    );
    expect(recusasTemporais).toEqual([]);
  });
});

/*
 * Os três casos restantes da bateria de regressão visual.
 *
 * Os dois primeiros — 1937 e prédio institucional — estão acima. Estes cobrem
 * a outra metade do problema: retrato de gente. A regra é a mesma nos três,
 * e não é sobre idade da foto: a imagem tem que ser DO assunto da pauta.
 */

/** Q5: ser humano. É o que faz o resolvedor tratar a entidade como pessoa. */
const PESSOA: EntidadeFalsa = {
  termo: "rubio",
  qid: "Q4",
  label: "Marco Rubio",
  descricao: "político dos Estados Unidos",
  p31: "Q5",
};

describe("presidente que não é o assunto da pauta", () => {
  it("retrato de figura pública citada de passagem não ilustra a pauta", async () => {
    const fetcher = fetcherCom(
      {
        titulo: "File:Donald Trump official portrait.jpg",
        descricao: "Official portrait of President Donald Trump.",
        categorias: "Official portraits of presidents of the United States",
        data: "2025",
      },
      [
        { termo: "uscis", qid: "Q2", label: "USCIS", descricao: "agência de imigração dos EUA", p31: "Q327333" },
        { termo: "trump", qid: "Q3", label: "Donald Trump", descricao: "presidente dos EUA", p31: "Q5" },
      ],
    );

    /*
     * A pauta é sobre uma taxa de formulário. O presidente aparece porque
     * assinou o ato, e não porque a notícia é sobre ele. O retrato oficial
     * transformaria uma mudança administrativa em notícia sobre a pessoa.
     */
    const r = await resolveVisualAsset(
      {
        storyId: "s-nao-central",
        titulo: "USCIS atualiza a taxa do formulário I-765",
        resumo:
          "A agência publicou o novo valor da taxa de autorização de trabalho, " +
          "seguindo a ordem executiva assinada por Donald Trump em janeiro.",
        categoria: "processo",
        classificacao: {
          atores: ["USCIS", "Donald Trump"],
          lugares: ["Estados Unidos"],
          acontecimento: ["atualização de taxa"],
          pais: "EUA",
        },
      },
      { env: ENV, fetcher },
    );

    /*
     * O que não pode acontecer é o rosto dele virar a capa. A defesa pode vir
     * de dois lugares, e os dois valem: ou ele não é escolhido como entidade
     * visual, porque citado no corpo vale 20 de centralidade e o piso é 50; ou
     * o retrato é recusado por NON_CENTRAL_PUBLIC_FIGURE.
     */
    const virouCapa = (r.asset?.entityName ?? "").toLowerCase().includes("trump");
    expect(virouCapa, JSON.stringify({ entidade: r.entidade?.nome, asset: r.asset?.entityName })).toBe(false);
  });
});

describe("retrato de quem é o assunto", () => {
  it("pauta sobre a pessoa aceita o retrato oficial, mesmo não sendo de ontem", async () => {
    const fetcher = fetcherCom(
      {
        titulo: "File:Marco Rubio official photo.jpg",
        descricao: "Official portrait of Marco Rubio.",
        categorias: "Official portraits|Politicians of the United States",
        data: "2023",
      },
      [PESSOA],
    );

    const r = await resolveVisualAsset(
      {
        storyId: "s-central",
        titulo: "Marco Rubio anuncia mudança na política de vistos",
        resumo: "O secretário de Estado apresentou a nova diretriz para emissão de vistos.",
        categoria: "processo",
        classificacao: {
          atores: ["Marco Rubio"],
          lugares: ["Estados Unidos"],
          acontecimento: ["anúncio de política"],
          pais: "EUA",
        },
      },
      { env: ENV, fetcher },
    );

    // O que se prova aqui é que nada barrou por idade ou por centralidade.
    // Um retrato oficial de dois anos é o material normal deste tipo de pauta.
    const barreiras = r.recusados.filter((x) =>
      ["HISTORICAL_EVENT_MISMATCH", "TEMPORAL_MISMATCH", "NON_CENTRAL_PUBLIC_FIGURE"].includes(x.motivo),
    );
    expect(barreiras, JSON.stringify(r.recusados)).toEqual([]);
  });
});

describe("asset sem data", () => {
  it("a ausência de data não é motivo de recusa", async () => {
    /*
     * Boa parte do Commons não declara data. Tratar "sem data" como "antiga"
     * fecharia o acervo inteiro; tratar como "recente" seria inventar. A
     * decisão é não decidir pela data: quem decide é o conteúdo.
     */
    const fetcher = fetcherCom({
      titulo: "File:Bureau of Labor Statistics headquarters.jpg",
      descricao: "Headquarters building of the Bureau of Labor Statistics in Washington.",
      categorias: "Government buildings in Washington, D.C.",
      data: "",
    });

    const r = await resolveVisualAsset(
      {
        ...PAUTA_DE_EMPREGO,
        titulo: "Agência publica novo formulário de estatística",
        resumo: "O órgão divulgou a atualização do formulário.",
      },
      { env: ENV, fetcher },
    );

    const porData = r.recusados.filter((x) =>
      ["HISTORICAL_EVENT_MISMATCH", "TEMPORAL_MISMATCH"].includes(x.motivo),
    );
    expect(porData, JSON.stringify(r.recusados)).toEqual([]);
    expect(r.asset?.assetDate ?? null).toBeNull();
  });
});
