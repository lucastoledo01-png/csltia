import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset } from "./resolver";
import { PISO_DE_IDENTIDADE, pontuarImagem, temIdentidade } from "./relevancia";
import type { AssetVisual, EntidadeVisual } from "./tipos";

/**
 * A bolha da capa é o círculo com a segunda foto, e ela tem régua PRÓPRIA.
 *
 * O fundo pode ser a cena: ele ocupa a peça inteira, o degradê come metade
 * dele, e um plano aberto da cidade cumpre o papel. O círculo tem 44 por cento
 * de largura no terço superior e é a primeira coisa que o olho encontra. O que
 * não é reconhecível ali vira mancha.
 *
 * Em 16/09/2026 o dono apontou isso com uma frase só: a bolha precisa ter a
 * identidade do assunto, nunca imagem genérica. O que este arquivo guarda é
 * justamente a diferença entre PASSAR na régua do fundo e SERVIR para a bolha.
 */

/** Uma entidade que não é pessoa, para o piso ser o comum, que é 45. */
const universidade: EntidadeVisual = {
  nome: "Harvard University",
  normalizado: "harvard university",
  tipo: "institution",
  qid: "Q13371",
  imagemPrincipal: null,
  categoriaCommons: "Harvard University",
  siteOficial: null,
  origem: "teste",
  confianca: 90,
  evidencias: ["fixture"],
};

function asset(descricao: string): AssetVisual {
  return {
    entityName: universidade.nome,
    entityNormalized: universidade.normalizado,
    entityType: "institution",
    source: "wikimedia_commons",
    sourceAssetId: descricao,
    imageUrl: `https://upload.wikimedia.org/${descricao.replace(/\s+/g, "-")}.jpg`,
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
    author: "Fotógrafo",
    license: "Public Domain",
    licenseUrl: "https://example.org",
    attribution: "",
    rightsStatement: "",
    rightsStatus: "verified",
    rightsCheckedAt: "2026-09-16T00:00:00.000Z",
    sourceLastCheckedAt: "2026-09-16T00:00:00.000Z",
    width: 1600,
    height: 1200,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0,
    imageContextType: "institution",
    metadata: { descricao },
  };
}

describe("o piso de identidade", () => {
  it("separa a foto que mostra a entidade da que só combina com o assunto", () => {
    const comNome = pontuarImagem(asset("Harvard University campus em outubro"), universidade);
    const semNome = pontuarImagem(asset("Folhas de outono em um campus"), universidade);

    expect(temIdentidade(comNome)).toBe(true);
    expect(temIdentidade(semNome)).toBe(false);
    expect(PISO_DE_IDENTIDADE).toBe(38);
  });

  /**
   * Este é o número que explica o defeito.
   *
   * A foto sem nenhuma correspondência de entidade soma 55 pontos, que é MAIS
   * que o piso de relevância de 45. Ou seja: ela passava, e virava o círculo
   * da capa. O piso de identidade é o que a barra, sem mexer no piso do fundo.
   */
  it("a foto sem identidade ainda passa no piso do fundo, e é por isso que o piso da bolha existe", () => {
    const semNome = pontuarImagem(asset("Folhas de outono em um campus"), universidade);

    expect(semNome.total).toBeGreaterThan(45);
    expect(semNome.partes.entidade).toBe(0);
    expect(temIdentidade(semNome)).toBe(false);
  });
});

/** Commons com dois arquivos: um nomeia a entidade, o outro não. */
function commonsComDuasFotos() {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);

    if (url.includes("wbsearchentities")) {
      return new Response(
        JSON.stringify({ search: [{ id: "Q13371", label: "Harvard University", description: "universidade" }] }),
        { status: 200 },
      );
    }

    if (url.includes("wbgetentities")) {
      return new Response(
        JSON.stringify({
          entities: {
            Q13371: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q3918" } } } }] } },
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes("commons.wikimedia.org")) {
      const arquivo = (titulo: string, descricao: string, nome: string) => ({
        title: `File:${titulo}`,
        imageinfo: [
          {
            url: `https://upload.wikimedia.org/${nome}`,
            descriptionurl: `https://commons.wikimedia.org/wiki/File:${titulo}`,
            width: 1600,
            height: 1200,
            mime: "image/jpeg",
            extmetadata: {
              LicenseShortName: { value: "Public domain" },
              Artist: { value: "Fotógrafo" },
              ImageDescription: { value: descricao },
            },
          },
        ],
      });

      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": arquivo(
                "Harvard-Yard.jpg",
                "Harvard University campus, vista do pátio",
                "harvard-yard.jpg",
              ),
              "2": arquivo("Folhas.jpg", "Folhas de outono ao amanhecer", "folhas.jpg"),
            },
          },
        }),
        { status: 200 },
      );
    }

    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("a vice que vira bolha", () => {
  const pauta = {
    storyId: "s-harvard",
    titulo: "Harvard University muda regra de bolsa",
    categoria: "Educação",
    classificacao: {
      atores: ["Harvard University"],
      lugares: ["Estados Unidos"],
      acontecimento: ["mudança de regra"],
    },
  };

  it("a segunda foto sem identidade não vira bolha", async () => {
    const r = await resolveVisualAsset(pauta, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
    });

    expect(r.status).toBe("SELECTED");
    // A vencedora é a que nomeia a entidade.
    expect(r.asset?.imageUrl).toContain("harvard-yard");
    // E a de folhas, que passa no piso do fundo, NÃO vira o círculo.
    expect(r.assetSecundario).toBeNull();
  });
});
