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

  /*
   * A busca não para na primeira fonte que devolve QUALQUER coisa.
   *
   * A condição era `novos.length === 0` antes de consultar o site oficial.
   * Bastava o Commons devolver um candidato convertido, ainda que ele fosse
   * recusado depois na pontuação, para a fonte oficial nunca ser consultada: o
   * resolvedor terminava com um candidato ruim na mão e devolvia
   * NO_VALID_IMAGE, como se não houvesse foto no mundo. Foi o que produziu, em
   * 16/09/2026, uma leva inteira de posts sem foto.
   */
  it("o Commons devolver algo ruim não impede a fonte oficial de ser consultada", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      // Foto pequena demais: converte, entra em `novos`, e cai na pontuação.
      fetcher: fetcherFalso({ p18: "Retrato.jpg", largura: 300 }),
      somenteLeitura: true,
    });

    const commons = r.fontesConsultadas.find((f) => f.fonte === "wikimedia_commons");
    expect(commons?.encontrados).toBeGreaterThan(0);

    // A prova: a fonte oficial APARECE na lista de consultadas.
    expect(r.fontesConsultadas.map((f) => f.fonte)).toContain("fonte_oficial");
  });

  it("nunca troca pessoa por foto conceitual: sem foto válida, sai sem imagem", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      // Licença que a allowlist recusa.
      fetcher: fetcherFalso({ licenca: "All rights reserved" }),
      env: { PEXELS_API_KEY: "chave" },
      somenteLeitura: true,
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    /*
     * Desde 06/10/2026 a pessoa que a MANCHETE nomeia é protagonista, e o
     * caminho dela termina na verificação: sem foto dela conferida, nem chega
     * a perguntar ao banco conceitual ("imagem certeira").
     */
    expect(r.motivo).toBe("PROTAGONIST_PHOTO_NOT_VERIFIED");
    expect(r.protagonista?.nome).toBe("Donald Trump");
    expect(r.fontesConsultadas.some((f) => f.fonte === "banco_conceitual")).toBe(false);
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
    // Com o P18: a pessoa da manchete só tem foto com retrato de referência (06/10/2026).
    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ licenca: "CC BY-SA 4.0", p18: "Retrato.jpg" }),
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
      imageContextType: "official_portrait" as const,
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
    // Pauta cuja manchete NÃO nomeia a pessoa: a biblioteca devolve na hora, como sempre.
    const r = await resolveVisualAsset(
      { ...pautaDePessoa, titulo: "Medida para profissionais estrangeiros é anunciada" },
      { biblioteca, fetcher, somenteLeitura: true },
    );

    expect(r.asset?.sourceAssetId).toBe("File:Guardado.jpg");
    // Wikidata é consultado para tipar a entidade; o Commons não.
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes("commons.wikimedia.org"))).toBe(false);
  });

  /*
   * A manchete nomeia a pessoa (06/10/2026, "imagem certeira"): a foto
   * guardada foi aprovada por uma régua que não conferia identidade, então ela
   * não sai direto. Entra na fila da verificação, e só passa sendo o retrato
   * de referência (P18) ou com o rosto conferido contra ele.
   */
  it("com a pessoa na manchete, a foto da biblioteca passa pela verificação de identidade", async () => {
    const guardado = {
      id: "asset-2",
      entityName: "Donald Trump",
      entityNormalized: "donald trump",
      entityType: "person" as const,
      source: "wikimedia_commons" as const,
      sourceAssetId: "File:Guardado.jpg",
      imageUrl: "https://upload.wikimedia.org/guardado.jpg",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Guardado.jpg",
      author: "Alguém",
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
      imageContextType: "entity_portrait" as const,
      metadata: { categorias: "Donald Trump" },
      usageCount: 0,
      lastUsedAt: null,
    };
    const biblioteca: Biblioteca = {
      daEntidade: vi.fn(async () => [guardado]),
      guardar: vi.fn(async () => null),
      registrarUso: vi.fn(async () => {}),
      porUrl: vi.fn(async () => null),
    };
    const rodar = async (mesmaPessoa: boolean) => {
      const papeis: string[] = [];
      const r = await resolveVisualAsset(pautaDePessoa, {
        biblioteca,
        // O P18 pequeno demais: ele é a referência, mas não a capa. A guardada é a única candidata.
        fetcher: fetcherFalso({ p18: "Retrato.jpg", largura: 300 }),
        somenteLeitura: true,
        conferenciaVisual: async (asset, ctx) => {
          papeis.push(`${ctx.papel ?? "assunto"}:${asset.sourceAssetId}`);
          const aprovada = ctx.papel === "identidade" ? mesmaPessoa : true;
          return { aprovada, descricao: "", motivo: aprovada ? "ok" : "outra pessoa", paisAparente: null, confianca: 95, falhou: false };
        },
      });
      return { r, papeis };
    };

    const outra = await rodar(false);
    expect(outra.papeis).toContain("identidade:File:Guardado.jpg");
    expect(outra.r.status).toBe("NO_VALID_IMAGE");
    expect(outra.r.motivo).toBe("PROTAGONIST_PHOTO_NOT_VERIFIED");
    expect(outra.r.recusados.some((x) => x.identificacao === "File:Guardado.jpg" && x.motivo === "IDENTITY_NOT_VERIFIED")).toBe(true);

    const mesma = await rodar(true);
    expect(mesma.r.asset?.sourceAssetId).toBe("File:Guardado.jpg");
    const prova = mesma.r.asset?.metadata.verificacao as { tipo: string; como: string };
    expect(prova.tipo).toBe("identidade");
    expect(prova.como).toContain("retrato de referência");
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
          imageContextType: "entity_portrait" as const,
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
    confianca: 100,
    evidencias: ["fixture"],
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
    imageContextType: "official_portrait",
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

describe("saber desistir", () => {
  /** Wikidata que não devolve nada utilizável. */
  const semNada = vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);
    if (url.includes("wbsearchentities")) return new Response(JSON.stringify({ search: [] }), { status: 200 });
    return new Response(JSON.stringify({ entities: {} }), { status: 200 });
  }) as unknown as typeof fetch;

  /**
   * A regra mudou em 17/09/2026, e a intenção deste teste não.
   *
   * O que ele sempre protegeu é que pauta sobre PESSOA nunca ganhe foto
   * conceitual: matéria sobre Trump ilustrada com uma imagem de banco sugere
   * que a imagem é dele. Isso continua valendo.
   *
   * O que mudou é o desfecho: em vez de sair sem imagem nenhuma, a peça recebe
   * a bandeira da publicação. Ela não finge ser ninguém, e o `status` continua
   * NO_VALID_IMAGE, então o relatório segue contando este dia como dia sem
   * foto da pauta.
   */
  it("pessoa sem foto válida não recebe foto conceitual, e sim a bandeira", async () => {
    const { ehUltimoRecurso } = await import("./bandeira");

    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ licenca: "All rights reserved" }),
      env: { PEXELS_API_KEY: "chave" },
      somenteLeitura: true,
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(ehUltimoRecurso(r.asset)).toBe(true);
    expect(r.asset?.imageContextType).not.toBe("conceptual");
    expect(r.asset?.source).not.toBe("banco_conceitual");
  });

  it("sem entidade e sem banco configurado, sai sem imagem", async () => {
    const r = await resolveVisualAsset(
      {
        storyId: "s9",
        titulo: "Assunto sem entidade nenhuma",
        categoria: "Geral",
        classificacao: { atores: [], lugares: [], acontecimento: [] },
      },
      { fetcher: semNada, env: {}, somenteLeitura: true }
    );

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.entidade?.tipo).toBe("conceptual");
  });

  it("nome comum que não é entidade não vira busca de imagem", async () => {
    const r = await resolveVisualAsset(
      {
        storyId: "s10",
        titulo: "Fila do green card chega a 1 milhão de indianos",
        categoria: "Green card",
        classificacao: { atores: ["indianos", "novos agentes"], lugares: [], acontecimento: ["fila"] },
      },
      { fetcher: semNada, env: {}, somenteLeitura: true }
    );

    // Nenhum dos dois é nome próprio, então nem chega ao Wikidata.
    expect(r.entidade?.tipo).toBe("conceptual");
    expect(r.status).toBe("NO_VALID_IMAGE");
  });
});

describe("contexto da imagem", () => {
  it("retrato oficial nunca é classificado como foto do acontecimento", async () => {
    const r = await resolveVisualAsset(pautaDePessoa, {
      fetcher: fetcherFalso({ p18: "Retrato.jpg" }),
      somenteLeitura: true,
    });

    expect(r.asset?.imageContextType).toBe("official_portrait");
    expect(r.asset?.imageContextType).not.toBe("exact_event");
  });

  it("foto de pessoa que não é a declarada vira retrato comum", async () => {
    // A manchete não nomeia a pessoa: sem protagonista, a régua de identidade não entra (06/10/2026).
    const r = await resolveVisualAsset(
      { ...pautaDePessoa, titulo: "Medida para profissionais estrangeiros é anunciada" },
      { fetcher: fetcherFalso({}), somenteLeitura: true },
    );

    expect(r.asset?.imageContextType).toBe("entity_portrait");
  });
});
