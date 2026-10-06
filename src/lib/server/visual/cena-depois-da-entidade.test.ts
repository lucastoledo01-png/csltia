import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset } from "./resolver";
import type { Conferente } from "./resolver";
import { ehUltimoRecurso } from "./bandeira";
import { MOTIVOS_DE_RECUSA } from "./tipos";

/**
 * A pauta com entidade nomeada não morre mais sem foto quando a foto da
 * entidade não passa (06/10/2026).
 *
 * Até aqui, o Fed ou o IRS citados na pauta mandavam a resolução para o
 * caminho da entidade e só para ele: se as fotos do órgão eram recusadas, a
 * pauta saía com NO_VALID_IMAGE, enquanto a mesma pauta sem o nome do órgão
 * ganharia a foto da cena. Agora a etapa da cena entra depois, com as mesmas
 * barreiras da pauta sem entidade.
 */

const ENV = { PEXELS_API_KEY: "chave-de-teste" };

function pexels(ids: number[]) {
  return new Response(
    JSON.stringify({
      photos: ids.map((id) => ({
        src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=940` },
        photographer: `Fotógrafo ${id}`,
        photographer_url: "https://pexels.com/@x",
        url: `https://pexels.com/photo/${id}`,
      })),
    }),
    { status: 200 },
  );
}

/** Wikidata devolve um órgão (ou uma pessoa), o Commons duas fotos dele, o Pexels três de cena. */
function mundo(opcoes: { pessoa?: boolean; commonsVazio?: boolean } = {}) {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);

    if (url.includes("wikidata.org") && url.includes("wbsearchentities")) {
      return new Response(
        JSON.stringify({ search: [{ id: "Q1", label: "Internal Revenue Service", description: "agência" }] }),
        { status: 200 },
      );
    }

    if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
      return new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: {
                // Q327333 é órgão de governo; Q5 é ser humano.
                P31: [{ mainsnak: { datavalue: { value: { id: opcoes.pessoa ? "Q5" : "Q327333" } } } }],
                P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
                P373: [{ mainsnak: { datavalue: { value: "Internal Revenue Service" } } }],
              },
            },
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes("commons.wikimedia.org")) {
      if (opcoes.commonsVazio) return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
      const foto = (nome: string) => ({
        title: `File:${nome}`,
        imageinfo: [
          {
            url: `https://upload.wikimedia.org/${nome}`,
            descriptionurl: `https://commons.wikimedia.org/wiki/File:${nome}`,
            width: 2400,
            height: 1600,
            mime: "image/jpeg",
            extmetadata: {
              LicenseShortName: { value: "Public domain" },
              Artist: { value: "Autor" },
              ImageDescription: { value: "Internal Revenue Service building" },
            },
          },
        ],
      });
      return new Response(
        JSON.stringify({ query: { pages: { "1": foto("IRS_sign.jpg"), "2": foto("IRS_building.jpg") } } }),
        { status: 200 },
      );
    }

    if (url.includes("api.pexels.com")) return pexels([101, 102, 103]);

    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const PAUTA = {
  storyId: "evg:temporada-do-ir:prazo",
  titulo: "Tax season: quando o americano declara o imposto de renda ao Internal Revenue Service",
  resumo: "A temporada de declaração do imposto de renda federal vai de janeiro a abril.",
  categoria: "custo_de_vida",
  classificacao: {
    atores: ["Internal Revenue Service"],
    lugares: ["Estados Unidos"],
    acontecimento: ["Tax season"],
    pais: "EUA",
  },
};

/** Reprova o que vier do Commons (a placa do órgão, legível) e aprova o resto. */
function conferenteQueReprovaOOrgao(): Conferente {
  return async (asset) => {
    const doOrgao = asset.imageUrl.includes("upload.wikimedia.org");
    return {
      aprovada: !doOrgao,
      descricao: doOrgao ? "fachada com a placa do órgão legível" : "mesa com calculadora e papéis, sem texto",
      motivo: doOrgao ? "texto legível como assunto" : "cena de apoio honesta",
      paisAparente: doOrgao ? "Estados Unidos" : null,
      confianca: 90,
      falhou: false,
    };
  };
}

describe("a cena depois da entidade", () => {
  it("as fotos do órgão reprovadas não matam a pauta: ela ganha a foto da cena", async () => {
    const fetcher = mundo();
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher,
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprovaOOrgao(),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("banco_conceitual");
    expect(r.asset?.imageUrl).toContain("pexels");
    expect(r.caminho).toBe("cena_depois_da_entidade");
    expect(r.asset?.metadata.fallback_de_cena).toBe(true);
    // A entidade da pauta continua sendo o órgão: é ela que a bolha procura.
    expect(r.entidade?.nome).toBe("Internal Revenue Service");
    // E a foto da cena não leva o nome do órgão.
    expect(r.asset?.entityName).not.toBe("Internal Revenue Service");
  });

  it("o diagnóstico diz que a foto veio da etapa da cena, e por quê", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprovaOOrgao(),
    });

    const nota = r.fontesConsultadas.find((f) => f.nota.startsWith("fallback de cena"));
    expect(nota?.nota).toContain("Internal Revenue Service");
    expect(nota?.nota).toContain("reprovada(s) na conferência visual");
    expect(r.recusados.some((c) => c.motivo === MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU)).toBe(true);
  });

  /*
   * O caso medido nas amostras: a foto de banco era pontuada contra o nome do
   * órgão, somava 33 contra o piso de 45 e caía como LOW_RELEVANCE sem
   * ninguém abrir a imagem.
   */
  it("sem foto do órgão que passe na pontuação, a cena é pontuada pela cena, não pelo nome do órgão", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo({ commonsVazio: true }),
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprovaOOrgao(),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.caminho).toBe("cena_depois_da_entidade");
    expect(r.fontesConsultadas.some((f) => f.nota.includes("nenhuma foto da entidade passou na pontuação"))).toBe(true);
  });

  it("foto do órgão aprovada continua vencendo, e o banco nem é consultado", async () => {
    const fetcher = mundo();
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher,
      somenteLeitura: true,
      conferenciaVisual: async () => ({
        aprovada: true,
        descricao: "fachada do órgão",
        motivo: "é o órgão da manchete",
        paisAparente: "Estados Unidos",
        confianca: 95,
        falhou: false,
      }),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(r.caminho).toBe("entidade");
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes("api.pexels.com"))).toBe(false);
  });

  /*
   * As barreiras da cena são as mesmas da pauta sem entidade. A conferência
   * que recusa pessoa identificável e texto continua decidindo.
   */
  it("a cena passa pela mesma conferência: reprovou tudo, sai sem foto", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: async (asset) => ({
        aprovada: false,
        descricao: asset.imageUrl.includes("pexels") ? "mulher identificável preenchendo papéis" : "placa do órgão",
        motivo: "pessoa identificável que não é citada",
        paisAparente: null,
        confianca: 90,
        falhou: false,
      }),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(ehUltimoRecurso(r.asset!)).toBe(true);
    expect(r.recusados.filter((c) => c.origem === "banco_conceitual").length).toBe(3);
    expect(r.recusados.some((c) => c.detalhe.includes("mulher identificável"))).toBe(true);
  });

  it("falha de conferência continua sendo recusa, também na cena", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: async () => ({
        aprovada: false,
        descricao: "",
        motivo: "conferência visual falhou: timeout",
        paisAparente: null,
        confianca: 0,
        falhou: true,
      }),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(
      r.recusados.some(
        (c) => c.origem === "banco_conceitual" && c.motivo === MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL,
      ),
    ).toBe(true);
  });

  it("pessoa nunca cai na cena, mesmo com banco configurado", async () => {
    const fetcher = mundo({ pessoa: true });
    const r = await resolveVisualAsset(
      { ...PAUTA, classificacao: { ...PAUTA.classificacao, atores: ["Internal Revenue Service"] } },
      {
        env: ENV,
        fetcher,
        somenteLeitura: true,
        conferenciaVisual: conferenteQueReprovaOOrgao(),
      },
    );

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.fontesConsultadas.some((f) => f.nota.includes("pauta sobre pessoa não aceita foto conceitual"))).toBe(true);
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes("api.pexels.com"))).toBe(false);
  });

  it("pauta sem entidade sai pela cena, marcada como cena", async () => {
    const r = await resolveVisualAsset(
      { ...PAUTA, classificacao: { atores: [], lugares: [], acontecimento: ["imposto"], pais: "EUA" } },
      { env: ENV, fetcher: mundo(), somenteLeitura: true, conferenciaVisual: conferenteQueReprovaOOrgao() },
    );

    expect(r.status).toBe("SELECTED");
    expect(r.caminho).toBe("cena");
    expect(r.asset?.metadata.fallback_de_cena).toBeUndefined();
  });
});

describe("a conferência sabe quando a foto vai para a bolha", () => {
  it("a vice é conferida como bolha, a foto de fundo como fundo", async () => {
    const usos: Array<string | undefined> = [];
    await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: async (_asset, contexto) => {
        usos.push(contexto.uso);
        return { aprovada: true, descricao: "órgão", motivo: "ok", paisAparente: "Estados Unidos", confianca: 95, falhou: false };
      },
    });

    expect(usos.length).toBeGreaterThan(1);
    expect(usos[0]).toBe("fundo");
    expect(usos.slice(1).every((u) => u === "bolha")).toBe(true);
  });
});
