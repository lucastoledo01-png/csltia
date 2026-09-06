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
function fetcherCom(arquivo: { titulo: string; descricao: string; categorias: string; data: string }) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);

    if (u.includes("wikidata.org") && u.includes("wbsearchentities")) {
      return new Response(
        JSON.stringify({
          search: [{ id: "Q1", label: "Bureau of Labor Statistics", description: "agência do governo dos EUA" }],
        }),
        { status: 200 },
      );
    }

    if (u.includes("wikidata.org") && u.includes("wbgetentities")) {
      // P31 agência governamental, P17 Estados Unidos, P373 categoria no
      // Commons: o suficiente para a desambiguação aceitar a entidade.
      return new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: "Q327333" } } } }],
                P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
                P373: [{ mainsnak: { datavalue: { value: "Bureau of Labor Statistics" } } }],
              },
            },
          },
        }),
        { status: 200 },
      );
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
    expect(r.asset).toBeNull();

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
    expect(r.asset).toBeNull();
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
