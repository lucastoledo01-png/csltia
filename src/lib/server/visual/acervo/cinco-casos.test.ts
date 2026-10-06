import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset, type Conferente, type PautaParaImagem } from "../resolver";
import type { Acervo, FaltaNoAcervo, ImagemDoAcervo } from "./acervo";
import { ehUltimoRecurso } from "../bandeira";

/**
 * O teste dos cinco casos: a ordem de busca da decisão de 29/09/2026.
 *
 *   | situação                               | de onde vem a imagem |
 *   | Entidade nomeada e o acervo tem        | acervo               |
 *   | Entidade nomeada e o acervo NÃO tem    | fontes externas      |
 *   | Sem entidade nomeada                   | acervo, pela cena    |
 *   | Sem entidade e a cena também vazia     | fontes externas      |
 *   | Nada em lugar nenhum                   | último recurso       |
 *
 * E a inversão que importa: a cena só é consultada depois de a entidade
 * falhar nos DOIS lados. Se invertesse, a pauta de um produto novo acharia uma
 * foto genérica de "tecnologia" no acervo e nunca sairia para buscar a foto
 * do produto.
 *
 * Tudo sem rede: Wikidata, Commons, Pexels e o modelo da cena respondem por um
 * fetcher falso, e o acervo é uma porta em memória.
 */

const URL_DO_ACERVO = "https://azqpdesusdzqndvsqmko.supabase.co/storage/v1/object/public/acervo";

function foto(arquivo: string, extra: Partial<ImagemDoAcervo> = {}): ImagemDoAcervo {
  const [grupo, pais, assunto] = arquivo.replace(/\.jpg$/, "").split("-");
  return {
    id: `id-${arquivo}`,
    arquivo,
    grupo,
    pais,
    assunto,
    detalhe: "x",
    tag: `${grupo}/${assunto}`,
    repositorio: "supabase_storage",
    caminho: `p/${grupo}/${arquivo}`,
    urlPublica: `${URL_DO_ACERVO}/p/${grupo}/${arquivo}`,
    largura: 2160,
    altura: 2880,
    orientacao: "retrato",
    tom: "claro",
    luminanciaDoTopo: 0.7,
    autor: "",
    licenca: "acervo próprio",
    rightsStatus: "unknown",
    usos: 0,
    ultimoUsoEm: null,
    ...extra,
  };
}

function acervoFalso(fotos: ImagemDoAcervo[], modo: Acervo["modo"] = "enforce") {
  const faltas: FaltaNoAcervo[] = [];
  const usos: string[] = [];
  const acervo: Acervo = {
    modo,
    gravarUso: modo === "enforce",
    gravarFaltas: true,
    porAssunto: vi.fn(async (assuntos: string[]) => fotos.filter((f) => assuntos.includes(f.assunto))),
    porTag: vi.fn(async (tag: string, pais: string) => fotos.filter((f) => f.tag === tag && f.pais === pais)),
    registrarUso: vi.fn(async (id: string) => {
      usos.push(id);
    }),
    registrarFalta: vi.fn(async (f: FaltaNoAcervo) => {
      faltas.push(f);
    }),
  };
  return { acervo, faltas, usos };
}

type Config = {
  /** Sem entidade no Wikidata: a pauta vira conceitual. */
  semEntidade?: boolean;
  /** Tipo no Wikidata. Q5 pessoa, Q4830453 empresa. */
  tipo?: string;
  /** O Commons devolve uma foto aceitável. */
  commonsTem?: boolean;
  /** O Pexels devolve fotos. */
  pexelsTem?: boolean;
  /** A tag que o modelo da cena devolve. */
  tag?: string;
};

function fetcherFalso(c: Config) {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);

    if (url.includes("api.openai.com")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  objeto: "rua residencial americana",
                  consulta: "american suburban residential street houses",
                  tag: c.tag ?? "nenhuma",
                }),
              },
            },
          ],
          usage: {},
        }),
        { status: 200 },
      );
    }

    if (url.includes("wbsearchentities")) {
      if (c.semEntidade) return new Response(JSON.stringify({ search: [] }), { status: 200 });
      return new Response(
        JSON.stringify({ search: [{ id: "Q1", label: "Donald Trump", description: "presidente" }] }),
        { status: 200 },
      );
    }

    if (url.includes("wbgetentities")) {
      return new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: c.tipo ?? "Q5" } } } }],
                ...(c.commonsTem ? { P18: [{ mainsnak: { datavalue: { value: "Retrato.jpg" } } }] } : {}),
              },
            },
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes("commons.wikimedia.org") && c.commonsTem) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": {
                title: "File:Retrato.jpg",
                imageinfo: [
                  {
                    url: "https://upload.wikimedia.org/retrato.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Retrato.jpg",
                    width: 1600,
                    height: 1200,
                    mime: "image/jpeg",
                    extmetadata: {
                      LicenseShortName: { value: "Public domain" },
                      Artist: { value: "Fotógrafo Oficial" },
                      ImageDescription: { value: "Donald Trump em evento" },
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

    if (url.includes("api.pexels.com")) {
      const fotos = c.pexelsTem ? [111, 222] : [];
      return new Response(
        JSON.stringify({
          photos: fotos.map((id) => ({
            src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=940` },
            photographer: `Fotógrafo ${id}`,
            photographer_url: "https://pexels.com/@x",
            url: `https://pexels.com/photo/${id}`,
          })),
        }),
        { status: 200 },
      );
    }

    return new Response("", { status: 404 });
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

function chamou(fetcher: { mock: { calls: unknown[][] } }, trecho: string): boolean {
  return fetcher.mock.calls.some((c) => String(c[0]).includes(trecho));
}

/** Conferência que aprova tudo, contando quantas vezes foi chamada. */
function conferenteQueAprova() {
  return vi.fn(async () => ({
    aprovada: true,
    falhou: false,
    descricao: "o que a pauta pede",
    motivo: "sustenta a manchete",
    paisAparente: "EUA",
    confianca: 95,
  })) as unknown as Conferente & { mock: { calls: unknown[][] } };
}

const ENV = { OPENAI_API_KEY: "chave-de-teste", PEXELS_API_KEY: "chave-de-teste" };

const PAUTA_COM_ENTIDADE: PautaParaImagem = {
  storyId: "pauta-trump",
  titulo: "Trump anuncia corte de tarifa para importados nos EUA",
  categoria: "economia",
  classificacao: { atores: ["Donald Trump"], lugares: ["Estados Unidos"], acontecimento: ["anúncio"], pais: "EUA" },
};

const PAUTA_SEM_ENTIDADE: PautaParaImagem = {
  storyId: "pauta-imoveis",
  titulo: "Compradores de imóveis ganham margem de negociação nos EUA",
  categoria: "custo_de_vida",
  classificacao: { atores: [], lugares: [], acontecimento: ["venda de imóveis"], pais: "EUA" },
};

describe("o teste dos cinco casos", () => {
  it("1. entidade nomeada e o acervo tem: sai do acervo, sem conferência e sem fonte externa", async () => {
    const { acervo, usos } = acervoFalso([foto("pessoas-eua-donald_trump-retrato-01.jpg")]);
    const fetcher = fetcherFalso({ commonsTem: true });
    const conferir = conferenteQueAprova();

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, { acervo, fetcher, env: ENV, conferenciaVisual: conferir });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("acervo_proprio");
    expect(r.asset?.sourceAssetId).toBe("pessoas-eua-donald_trump-retrato-01.jpg");
    // A foto do acervo foi conferida na entrada e não é reaberta.
    expect(conferir.mock.calls).toHaveLength(0);
    expect(chamou(fetcher, "commons.wikimedia.org")).toBe(false);
    expect(usos).toEqual(["id-pessoas-eua-donald_trump-retrato-01.jpg"]);
  });

  it("2. entidade nomeada e o acervo NÃO tem: vai às fontes externas, com conferência, e anota a falta", async () => {
    const { acervo, faltas } = acervoFalso([]);
    const fetcher = fetcherFalso({ commonsTem: true });
    const conferir = conferenteQueAprova();

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, { acervo, fetcher, env: ENV, conferenciaVisual: conferir });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("wikimedia_commons");
    // Imagem de fora passa pela conferência visual.
    expect(conferir.mock.calls.length).toBeGreaterThan(0);
    expect(faltas).toEqual([
      expect.objectContaining({ tipo: "entidade", chave: "donald_trump", motivo: "vazio", storyId: "pauta-trump" }),
    ]);
  });

  it("3. sem entidade nomeada: o acervo pela tag de cena, sem banco de terceiro e sem conferência", async () => {
    const { acervo } = acervoFalso([foto("moradia-eua-rua_residencial-outono-01.jpg")]);
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" });
    const conferir = conferenteQueAprova();

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, { acervo, fetcher, env: ENV, conferenciaVisual: conferir });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("acervo_proprio");
    expect(r.asset?.metadata).toMatchObject({ acervo: { tag: "moradia/rua_residencial" } });
    expect(chamou(fetcher, "api.pexels.com")).toBe(false);
    expect(conferir.mock.calls).toHaveLength(0);
    expect(acervo.porTag).toHaveBeenCalledWith("moradia/rua_residencial", "eua");
  });

  it("4. sem entidade e a cena vazia no acervo: fontes externas, e a cena entra na lista de compras", async () => {
    const { acervo, faltas } = acervoFalso([foto("moradia-eua-casa_suburbio-neve-01.jpg")]);
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" });
    const conferir = conferenteQueAprova();

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, { acervo, fetcher, env: ENV, conferenciaVisual: conferir });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("banco_conceitual");
    expect(conferir.mock.calls.length).toBeGreaterThan(0);
    expect(faltas).toEqual([
      expect.objectContaining({ tipo: "cena", chave: "moradia/rua_residencial", pais: "eua", motivo: "vazio" }),
    ]);
    // A pergunta da cena foi feita UMA vez, e serviu ao acervo e ao banco de terceiro.
    expect(fetcher.mock.calls.filter((c) => String(c[0]).includes("api.openai.com"))).toHaveLength(1);
  });

  it("5. nada em lugar nenhum: último recurso, com o status dizendo a verdade", async () => {
    const { acervo, faltas } = acervoFalso([]);
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: false, tag: "moradia/rua_residencial" });

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    /*
     * A tabela da decisão diz "capa tipográfica". O resolvedor devolve a
     * bandeira com NO_VALID_IMAGE (regra de 17/09/2026, "nenhuma peça sem
     * imagem"), e quem escolhe entre bandeira e capa tipográfica é a arte. O
     * que este teste fixa é o lado do resolvedor: nada inventado, status
     * verdadeiro.
     */
    expect(ehUltimoRecurso(r.asset)).toBe(true);
    expect(faltas.map((f) => f.tipo)).toEqual(["cena"]);
  });
});

describe("a inversão: a cena só depois de a entidade falhar nos dois lados", () => {
  it("entidade sem foto no acervo, mas com foto fora: a cena do acervo NEM é consultada", async () => {
    // O acervo tem a cena genérica que mascararia a falta do específico.
    const { acervo } = acervoFalso([foto("tecnologia-eua-chip-macro-01.jpg")]);
    const fetcher = fetcherFalso({ tipo: "Q4830453", commonsTem: true, tag: "tecnologia/chip" });

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(acervo.porTag).not.toHaveBeenCalled();
  });

  it("entidade (empresa) sem foto em lugar nenhum: AÍ a cena do acervo entra", async () => {
    const { acervo, faltas } = acervoFalso([foto("tecnologia-eua-chip-macro-01.jpg")]);
    const fetcher = fetcherFalso({ tipo: "Q4830453", commonsTem: false, tag: "tecnologia/chip" });

    /*
     * A empresa é citada e a manchete NÃO a nomeia (06/10/2026): só então a
     * cena entra. Com a empresa na manchete ela é protagonista, e sem foto da
     * marca a pauta não vira conteúdo ("imagem certeira").
     */
    const r = await resolveVisualAsset(
      { ...PAUTA_COM_ENTIDADE, titulo: "Corte de tarifa para importados é anunciado nos EUA" },
      {
        acervo,
        fetcher,
        env: ENV,
        conferenciaVisual: conferenteQueAprova(),
      },
    );

    expect(r.asset?.source).toBe("acervo_proprio");
    expect(r.asset?.sourceAssetId).toBe("tecnologia-eua-chip-macro-01.jpg");
    // A falta da ENTIDADE ficou anotada, mesmo com a cena tendo salvado a pauta.
    expect(faltas.map((f) => f.tipo)).toEqual(["entidade"]);
  });

  it("pessoa sem foto em lugar nenhum NÃO vira cena do acervo: a regra de pessoa continua", async () => {
    const { acervo } = acervoFalso([foto("tecnologia-eua-chip-macro-01.jpg")]);
    const fetcher = fetcherFalso({ tipo: "Q5", commonsTem: false, tag: "tecnologia/chip" });

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(acervo.porTag).not.toHaveBeenCalled();
  });
});

describe("as guardas do acervo produzem um não de verdade", () => {
  it("foto usada dentro da janela de 30 dias não sai de novo, e a falta é 'janela'", async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { acervo, faltas } = acervoFalso([
      foto("moradia-eua-rua_residencial-outono-01.jpg", { ultimoUsoEm: ontem }),
    ]);
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" });

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).not.toBe("acervo_proprio");
    expect(faltas).toEqual([expect.objectContaining({ motivo: "janela" })]);
  });

  it("foto usada há 31 dias volta", async () => {
    const antes = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { acervo } = acervoFalso([foto("moradia-eua-rua_residencial-outono-01.jpg", { ultimoUsoEm: antes })]);
    const fetcher = fetcherFalso({ semEntidade: true, tag: "moradia/rua_residencial" });

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).toBe("acervo_proprio");
  });

  it("a mesma foto não ilustra duas pautas da mesma edição", async () => {
    const { acervo } = acervoFalso([foto("moradia-eua-rua_residencial-outono-01.jpg")]);
    const jaUsadosNestaEdicao = new Set<string>();
    const opcoes = {
      acervo,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
      jaUsadosNestaEdicao,
    };

    const a = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, {
      ...opcoes,
      fetcher: fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" }),
    });
    const b = await resolveVisualAsset(
      { ...PAUTA_SEM_ENTIDADE, storyId: "outra" },
      { ...opcoes, fetcher: fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" }) },
    );

    expect(a.asset?.source).toBe("acervo_proprio");
    expect(b.asset?.source).not.toBe("acervo_proprio");
  });

  it("cena de outro país não é servida: pauta brasileira não recebe a rua americana", async () => {
    const { acervo } = acervoFalso([foto("moradia-eua-rua_residencial-outono-01.jpg")]);
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: true, tag: "moradia/rua_residencial" });

    const r = await resolveVisualAsset(
      { ...PAUTA_SEM_ENTIDADE, classificacao: { ...PAUTA_SEM_ENTIDADE.classificacao, pais: "Brasil" } },
      { acervo, fetcher, env: ENV, conferenciaVisual: conferenteQueAprova() },
    );

    expect(acervo.porTag).toHaveBeenCalledWith("moradia/rua_residencial", "br");
    expect(r.asset?.source).not.toBe("acervo_proprio");
  });

  it("rights_status desconhecido NÃO barra a foto do acervo: o registro fica, a trava saiu", async () => {
    const { acervo } = acervoFalso([
      foto("moradia-eua-rua_residencial-outono-01.jpg", { rightsStatus: "unknown" }),
    ]);
    const fetcher = fetcherFalso({ semEntidade: true, tag: "moradia/rua_residencial" });

    const r = await resolveVisualAsset(PAUTA_SEM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).toBe("acervo_proprio");
    expect(r.asset?.rightsStatus).toBe("unknown");
  });

  it("acervo fora do ar não derruba a resolução: a nota diz, e a cadeia externa segue", async () => {
    const { acervo } = acervoFalso([]);
    acervo.porAssunto = vi.fn(async () => {
      throw new Error("relation acervo_imagens does not exist");
    });
    const fetcher = fetcherFalso({ commonsTem: true });

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(r.fontesConsultadas.some((f) => f.fonte === "acervo_proprio" && f.nota.includes("indisponível"))).toBe(true);
  });
});

describe("o ensaio (dry_run) não muda a imagem", () => {
  it("o acervo tem a foto, a nota diz que escolheria, e quem decide é a cadeia externa", async () => {
    const { acervo, usos } = acervoFalso([foto("pessoas-eua-donald_trump-retrato-01.jpg")], "dry_run");
    const fetcher = fetcherFalso({ commonsTem: true });

    const r = await resolveVisualAsset(PAUTA_COM_ENTIDADE, {
      acervo,
      fetcher,
      env: ENV,
      conferenciaVisual: conferenteQueAprova(),
    });

    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(usos).toEqual([]);
    expect(r.fontesConsultadas.some((f) => f.fonte === "acervo_proprio" && f.nota.includes("ENSAIO"))).toBe(true);
  });

  it("sem acervo, a pergunta da cena sai sem o cardápio: o prompt de produção não muda", async () => {
    const fetcher = fetcherFalso({ semEntidade: true, pexelsTem: true });
    await resolveVisualAsset(PAUTA_SEM_ENTIDADE, { fetcher, env: ENV, conferenciaVisual: conferenteQueAprova() });

    const chamada = fetcher.mock.calls.find((c) => String(c[0]).includes("api.openai.com"));
    const corpo = String((chamada?.[1] as RequestInit | undefined)?.body ?? "");
    expect(corpo).not.toContain("TAG DO ACERVO");
    expect(chamou(fetcher, "api.openai.com")).toBe(true);
  });
});
