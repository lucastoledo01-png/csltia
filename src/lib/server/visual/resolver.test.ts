import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset } from "./resolver";
import type { Biblioteca, AssetGuardado } from "./biblioteca";
import { avaliarLicenca, montarAtribuicao } from "./licencas";
import { pontuarImagem } from "./relevancia";
import type { AssetVisual, EntidadeVisual } from "./tipos";

/** Wikidata + Commons falsos, para o teste não depender da internet. */
function fetcherFalso(config: {
  tipo?: string;
  qid?: string;
  p18?: string;
  licenca?: string;
  largura?: number;
  semEntidade?: boolean;
}) {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);

    if (url.includes("wikidata.org") && url.includes("wbsearchentities")) {
      if (config.semEntidade) return new Response(JSON.stringify({ search: [] }), { status: 200 });
      return new Response(
        JSON.stringify({ search: [{ id: config.qid ?? "Q1", label: "Donald Trump", description: "presidente" }] }),
        { status: 200 }
      );
    }

    if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
      const claims: Record<string, unknown> = {
        P31: [{ mainsnak: { datavalue: { value: { id: config.tipo ?? "Q5" } } } }],
      };
      if (config.p18) claims.P18 = [{ mainsnak: { datavalue: { value: config.p18 } } }];
      return new Response(
        JSON.stringify({ entities: { [config.qid ?? "Q1"]: { claims } } }),
        { status: 200 }
      );
    }

    if (url.includes("commons.wikimedia.org")) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": {
                title: `File:${config.p18 ?? "Retrato.jpg"}`,
                imageinfo: [
                  {
                    url: "https://upload.wikimedia.org/retrato.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Retrato.jpg",
                    width: config.largura ?? 1600,
                    height: 1200,
                    mime: "image/jpeg",
                    extmetadata: {
                      LicenseShortName: { value: config.licenca ?? "Public domain" },
                      Artist: { value: "<a href='#'>Fotógrafo Oficial</a>" },
                      ImageDescription: { value: "Donald Trump em evento" },
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200 }
      );
    }

    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const pautaDePessoa = {
  storyId: "s1",
  titulo: "Trump anuncia medida para profissionais estrangeiros",
  categoria: "Imigração",
  classificacao: { atores: ["Donald Trump"], lugares: ["Estados Unidos"], acontecimento: ["anúncio"] },
};

describe("resolveVisualAsset", () => {
  it("escolhe a foto real da pessoa quando o Commons tem licença aceita", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ p18: "Retrato.jpg" }),
      somenteLeitura: true,
    });

    expect(r.status).toBe("SELECTED");
    expect(r.entidade?.tipo).toBe("person");
    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(r.asset?.license).toBe("Public Domain");
    expect(r.asset?.sourcePageUrl).toContain("commons.wikimedia.org");
  });

  it("nunca troca pessoa por foto conceitual: sem foto válida, sai sem imagem", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      // Licença que a allowlist recusa.
      fetcher: fetcherFalso({ licenca: "All rights reserved" }),
      env: { PEXELS_API_KEY: "chave" },
      somenteLeitura: true,
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.motivo).toBe("NO_ENTITY_IMAGE_FOUND");
    const banco = r.fontesConsultadas.find((f) => f.fonte === "banco_conceitual");
    expect(banco?.nota).toContain("bloqueado por regra");
  });

  it("recusa foto pequena antes de pontuar", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ largura: 320 }),
      somenteLeitura: true,
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.recusados.some((c) => c.motivo === "LOW_RESOLUTION")).toBe(true);
  });

  it("guarda a licença e a página de origem junto da URL", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ licenca: "CC BY-SA 4.0" }),
      somenteLeitura: true,
    });

    expect(r.asset?.license).toBe("CC BY-SA");
    expect(r.asset?.attribution).toContain("Wikimedia Commons");
    expect(r.asset?.attribution).toContain("Fotógrafo Oficial");
    expect(r.legenda).toBe(r.asset?.attribution);
  });

  it("usa a biblioteca antes de buscar fora", async () => {
    const guardado: AssetGuardado = {
      id: "asset-1",
      entityName: "Donald Trump",
      entityNormalized: "donald trump",
      entityType: "person",
      source: "wikimedia_commons",
      sourceAssetId: "File:Guardado.jpg",
      imageUrl: "https://upload.wikimedia.org/guardado.jpg",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Guardado.jpg",
      author: "Alguém",
      license: "Public Domain",
      licenseUrl: "",
      attribution: "",
      rightsStatement: "",
      rightsStatus: "verified",
      rightsCheckedAt: "",
      sourceLastCheckedAt: "",
      width: 1600,
      height: 1200,
      mimeType: "image/jpeg",
      storagePath: null,
      perceptualHash: null,
      imageRelevanceScore: 0,
      metadata: { origem_declarada: true },
      usageCount: 3,
      lastUsedAt: null,
    };

    const biblioteca: Biblioteca = {
      daEntidade: vi.fn(async () => [guardado]),
      guardar: vi.fn(async () => null),
      registrarUso: vi.fn(async () => {}),
      porUrl: vi.fn(async () => null),
    };

    const fetcher = fetcherFalso({});
    const r = await resolveVisualAsset(pautaDePessoa, { biblioteca, fetcher, somenteLeitura: true });

    expect(r.asset?.sourceAssetId).toBe("File:Guardado.jpg");
    // Wikidata é consultado para tipar a entidade; o Commons não.
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes("commons.wikimedia.org"))).toBe(false);
  });

  it("respeita a janela: asset usado ontem não volta hoje", async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const biblioteca: Biblioteca = {
      daEntidade: vi.fn(async (): Promise<AssetGuardado[]> => [
        {
          id: "a1",
          entityName: "Donald Trump",
          entityNormalized: "donald trump",
          entityType: "person" as const,
          source: "wikimedia_commons" as const,
          sourceAssetId: "File:Usada.jpg",
          imageUrl: "https://upload.wikimedia.org/usada.jpg",
          sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Usada.jpg",
          author: "",
          license: "Public Domain",
          licenseUrl: "",
          attribution: "",
          rightsStatement: "",
          rightsStatus: "verified" as const,
          rightsCheckedAt: "",
          sourceLastCheckedAt: "",
          width: 1600,
          height: 1200,
          mimeType: "image/jpeg",
          storagePath: null,
          perceptualHash: null,
          imageRelevanceScore: 0,
          metadata: {},
          usageCount: 1,
          lastUsedAt: ontem,
        },
      ]),
      guardar: vi.fn(async () => null),
      registrarUso: vi.fn(async () => {}),
      porUrl: vi.fn(async () => null),
    };

    const r = await resolveVisualAsset(pautaDePessoa, {
      biblioteca,
      fetcher: fetcherFalso({ p18: "Outra.jpg" }),
      somenteLeitura: true,
    });

    expect(r.recusados.some((c) => c.motivo === "RECENTLY_USED")).toBe(true);
    // E buscou fora, em vez de repetir.
    expect(r.asset?.sourceAssetId).not.toBe("File:Usada.jpg");
  });

  it("pauta sem entidade vira conceitual e pode usar banco", async () => {
    const r = await resolveVisualAsset(
      {
        storyId: "s2",
        titulo: "Mercado de trabalho americano acelera",
        categoria: "Emprego",
        classificacao: { atores: [], lugares: [], acontecimento: ["contratação"] },
      },
      { fetcher: fetcherFalso({ semEntidade: true }), env: {}, somenteLeitura: true }
    );

    expect(r.entidade?.tipo).toBe("conceptual");
    const banco = r.fontesConsultadas.find((f) => f.fonte === "banco_conceitual");
    expect(banco?.nota).toContain("sem chave");
  });
});

describe("licença e atribuição", () => {
  it("recusa quando a origem não declara licença", () => {
    expect(avaliarLicenca("").aceita).toBe(false);
  });

  it("recusa não comercial e sem derivadas", () => {
    expect(avaliarLicenca("CC BY-NC 4.0").aceita).toBe(false);
    expect(avaliarLicenca("CC BY-ND 4.0").aceita).toBe(false);
  });

  it("gera crédito quando a licença exige e silencia quando não exige", () => {
    expect(
      montarAtribuicao({ autor: "Gage Skidmore", fonte: "Wikimedia Commons", licenca: "CC BY-SA 2.0", exigeAtribuicao: true })
    ).toBe("Foto: Gage Skidmore / Wikimedia Commons / CC BY-SA 2.0");
    expect(
      montarAtribuicao({ autor: "Alguém", fonte: "Wikimedia Commons", licenca: "Public Domain", exigeAtribuicao: false })
    ).toBe("");
  });
});

describe("pontuarImagem", () => {
  const entidade: EntidadeVisual = {
    nome: "Donald Trump",
    normalizado: "donald trump",
    tipo: "person",
    qid: "Q22686",
    imagemPrincipal: "Retrato.jpg",
    categoriaCommons: "Donald Trump",
    siteOficial: null,
    origem: "teste",
  };

  const base: AssetVisual = {
    entityName: "Donald Trump",
    entityNormalized: "donald trump",
    entityType: "person",
    source: "wikimedia_commons",
    sourceAssetId: "File:Retrato.jpg",
    imageUrl: "u",
    sourcePageUrl: "p",
    author: "a",
    license: "Public Domain",
    licenseUrl: "",
    attribution: "",
    rightsStatement: "",
    rightsStatus: "verified",
    rightsCheckedAt: "",
    sourceLastCheckedAt: "",
    width: 1600,
    height: 1200,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0,
    metadata: {},
  };

  it("dá nota alta para a imagem declarada da entidade", () => {
    const n = pontuarImagem({ ...base, metadata: { origem_declarada: true } }, entidade);
    expect(n.total).toBeGreaterThanOrEqual(90);
  });

  it("dá nota baixa para foto conceitual de banco na vaga de uma pessoa", () => {
    const conceitual = pontuarImagem(
      { ...base, source: "banco_conceitual", entityType: "conceptual", sourceAssetId: "https://pexels/foto.jpg", metadata: {} },
      entidade
    );
    expect(conceitual.total).toBeLessThan(45);
  });
});
