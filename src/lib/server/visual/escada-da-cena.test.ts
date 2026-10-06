import { describe, expect, it, vi } from "vitest";
import { contextoDaEditoriaPara, resolveVisualAsset } from "./resolver";
import type { Conferente } from "./resolver";
import { buscarFotosDeBanco } from "../prompt-system/stock";

/**
 * A escada da cena (06/10/2026): "sempre tem que ter foto de contexto".
 *
 * A cena era uma busca de três fotos, e a pauta morria quando a conferência
 * recusava as três. Agora ela desce degraus (cena, cena ampla, editoria, reuso)
 * com as mesmas regras duras em cada um.
 */

const ENV = { PEXELS_API_KEY: "chave-de-teste" };

/** Pexels que responde por consulta: cada busca devolve as fotos do mapa. */
function bancoPorConsulta(mapa: Record<string, number[]>) {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);
    if (url.includes("api.pexels.com")) {
      const consulta = decodeURIComponent(new URL(url).searchParams.get("query") ?? "");
      const ids = Object.entries(mapa).find(([k]) => consulta.includes(k))?.[1] ?? [];
      return new Response(
        JSON.stringify({
          photos: ids.map((id) => ({
            src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=940` },
            photographer: "F",
            url: `https://pexels.com/photo/${id}`,
          })),
        }),
        { status: 200 },
      );
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

/** Pauta sem entidade nomeada, de política: o tema fixo é o Capitólio. */
const PAUTA = {
  storyId: "pauta-sem-entidade",
  titulo: "Quem paga imposto federal nos EUA vê o orçamento crescer",
  resumo: "O orçamento federal americano cresceu no ano fiscal.",
  categoria: "politica",
  classificacao: { atores: [], lugares: [], acontecimento: ["orçamento"], pais: "EUA" },
};

const aprovaSo = (ids: number[]): Conferente => async (asset) => {
  const ok = ids.some((id) => asset.imageUrl.includes(`/photos/${id}/`));
  return {
    aprovada: ok,
    descricao: ok ? "prédio do Capitólio" : "pessoa identificável",
    motivo: ok ? "contexto honesto" : "pessoa identificável",
    paisAparente: null,
    confianca: 90,
    falhou: false,
  };
};

describe("a escada da cena", () => {
  it("o tema fixo da pauta reprovado, desce até o contexto da editoria", async () => {
    const editoria = contextoDaEditoriaPara("politica", "EUA");
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: bancoPorConsulta({ [editoria]: [900, 901], "": [1, 2, 3, 4, 5, 6] }),
      somenteLeitura: true,
      conferenciaVisual: aprovaSo([900]),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.degrau).toBe("editoria");
    expect(r.asset?.metadata.degrau).toBe("editoria");
    expect(r.fontesConsultadas.some((f) => f.nota.includes("degrau editoria"))).toBe(true);
  });

  it("para no primeiro degrau que serve, como antes", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: bancoPorConsulta({ "": [1, 2, 3] }),
      somenteLeitura: true,
      conferenciaVisual: aprovaSo([2]),
    });

    expect(r.degrau).toBe("cena");
    expect(r.fontesConsultadas.some((f) => f.nota.includes("degrau editoria"))).toBe(false);
  });

  it("o reuso é o último degrau: aceita foto dos últimos 30 dias, nunca a de hoje", async () => {
    const recentes = [1, 2, 3].map((id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`);
    const hoje = new Set([`https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=940`]);
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: bancoPorConsulta({ "": [1, 2, 3] }),
      somenteLeitura: true,
      jaUsadasRecentemente: recentes,
      jaUsadosNestaEdicao: hoje,
      conferenciaVisual: aprovaSo([1, 2]),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.degrau).toBe("reuso");
    expect(r.asset?.imageUrl).toContain("/photos/2/");
  });

  it("as regras duras descem junto: tudo reprovado em todos os degraus, sem foto", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: bancoPorConsulta({ "": [1, 2, 3] }),
      somenteLeitura: true,
      conferenciaVisual: aprovaSo([]),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
  });

  it("a foto da cena é conferida como contexto, não como retrato do assunto", async () => {
    const papeis: Array<string | undefined> = [];
    await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: bancoPorConsulta({ "": [1] }),
      somenteLeitura: true,
      conferenciaVisual: async (_a, contexto) => {
        papeis.push(contexto.papel);
        return { aprovada: true, descricao: "", motivo: "", paisAparente: null, confianca: 90, falhou: false };
      },
    });

    expect(papeis).toEqual(["cena"]);
  });

  it("pauta do Brasil ganha contexto do Brasil", () => {
    expect(contextoDaEditoriaPara("economia", "Brasil")).toContain("brazil");
    expect(contextoDaEditoriaPara("brasil", "Brasil")).toContain("brasilia");
    expect(contextoDaEditoriaPara("desconhecida", "EUA")).toContain("american");
  });
});

describe("o banco numa chamada só", () => {
  it("seis candidatas saem de UMA busca no Pexels, e não de seis", async () => {
    const fetcher = bancoPorConsulta({ casa: [1, 2, 3, 4, 5, 6, 7] });
    const fotos = await buscarFotosDeBanco("casa rua", 6, { env: ENV, fetcher });

    expect(fotos).toHaveLength(6);
    expect((fetcher as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("pula as que já saíram, pela identidade da foto", async () => {
    const fotos = await buscarFotosDeBanco("casa rua", 2, {
      env: ENV,
      fetcher: bancoPorConsulta({ casa: [1, 2, 3] }),
      evitar: ["https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=1200"],
    });

    expect(fotos.map((f) => f.imagemUrl.match(/photos\/(\d+)/)?.[1])).toEqual(["2", "3"]);
  });
});
