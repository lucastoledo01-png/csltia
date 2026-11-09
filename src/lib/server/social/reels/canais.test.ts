import { describe, expect, it } from "vitest";
import { canalDoCandidato, lerCanais, playlistDeUploads, videosDosCanais, type CanalDoYoutube } from "./canais";
import { configDosReels } from "./descoberta";
import { casaComNichoEmIngles, orientacaoDeVisto, ordenarVideos } from "./ordem";
import type { VideoAchado } from "./tipos";

const AGORA = Date.parse("2026-11-09T15:00:00Z");
const BLOOMBERG = "UCIALMKvObZNtJ6AmdCLP7Lg";
const WHITE_HOUSE = "UCYxRlFDqcWM4y7FfpiAN3KQ";

type Pedido = { url: URL };

/** Um YouTube de mentira: anota os pedidos e responde pelo caminho. */
function youtubeFalso(respostas: Record<string, (u: URL) => unknown>) {
  const pedidos: Pedido[] = [];
  const fetcher = (async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    pedidos.push({ url });
    const caminho = url.pathname.split("/").pop() ?? "";
    const corpo = respostas[caminho]?.(url) ?? { error: { message: `sem resposta para ${caminho}` } };
    return new Response(JSON.stringify(corpo), { status: (corpo as { error?: unknown }).error ? 400 : 200 });
  }) as unknown as typeof fetch;
  return { fetcher, pedidos };
}

function item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    snippet: {
      title: "Trump says tariffs on China will stay, White House confirms",
      description: "Bloomberg's interview",
      channelTitle: "Bloomberg Television",
      publishedAt: "2026-11-09T10:00:00Z",
      liveBroadcastContent: "none",
      ...(extra.snippet as object),
    },
    statistics: { viewCount: "50000", likeCount: "900", commentCount: "40" },
    contentDetails: { duration: "PT4M10S", ...(extra.contentDetails as object) },
  };
}

describe("a configuração dos canais", () => {
  it("lê id ou handle, exige o idioma, e o crédito cai no nome", () => {
    const { canais, avisos } = lerCanais([
      { id: BLOOMBERG, nome: "Bloomberg Television", idioma: "en", credito: "Bloomberg" },
      { handle: "WhiteHouse", nome: "The White House", idioma: "en" },
      { id: "nao-e-id", nome: "Torto", idioma: "en" },
      { id: WHITE_HOUSE, nome: "Sem idioma" },
      { id: BLOOMBERG, nome: "Repetido", idioma: "en" },
    ]);
    expect(canais).toEqual([
      { id: BLOOMBERG, handle: null, nome: "Bloomberg Television", idioma: "en", credito: "Bloomberg" },
      { id: null, handle: "@WhiteHouse", nome: "The White House", idioma: "en", credito: "The White House" },
    ]);
    expect(avisos).toHaveLength(2);
  });

  it("o padrão do código é nenhum canal, e a busca por termo continua", () => {
    const c = configDosReels({ settings: {} });
    expect(c.canaisYoutube).toEqual([]);
    expect(c.termosYoutube.length).toBeGreaterThan(0);
    const comCanal = configDosReels({ settings: { reels: { canais_youtube: [{ id: BLOOMBERG, nome: "B", idioma: "en" }], termos_youtube: ["x"] } } });
    expect(comCanal.canaisYoutube).toHaveLength(1);
    expect(comCanal.termosYoutube).toEqual(["x"]);
  });

  it("a playlist de uploads sai do id do canal", () => {
    expect(playlistDeUploads(BLOOMBERG)).toBe("UUIALMKvObZNtJ6AmdCLP7Lg");
  });
});

describe("a leitura dos canais", () => {
  const canais: CanalDoYoutube[] = [
    { id: BLOOMBERG, handle: null, nome: "Bloomberg Television", idioma: "en", credito: "Bloomberg" },
    { id: null, handle: "@WhiteHouse", nome: "The White House", idioma: "en", credito: "Casa Branca" },
  ];

  it("lê uploads (1 unidade por canal), resolve handle, e fica com o que serve", async () => {
    const { fetcher, pedidos } = youtubeFalso({
      channels: () => ({ items: [{ id: WHITE_HOUSE }] }),
      playlistItems: (u) =>
        u.searchParams.get("playlistId") === playlistDeUploads(BLOOMBERG)
          ? {
              items: [
                { contentDetails: { videoId: "novo", videoPublishedAt: "2026-11-09T10:00:00Z" } },
                { contentDetails: { videoId: "aovivo", videoPublishedAt: "2026-11-09T11:00:00Z" } },
                { contentDetails: { videoId: "longo", videoPublishedAt: "2026-11-09T11:00:00Z" } },
                { contentDetails: { videoId: "velho", videoPublishedAt: "2026-11-01T10:00:00Z" } },
              ],
            }
          : { items: [{ contentDetails: { videoId: "casa", videoPublishedAt: "2026-11-09T12:00:00Z" } }] },
      videos: () => ({
        items: [
          item("novo"),
          item("aovivo", { snippet: { liveBroadcastContent: "live" } }),
          item("longo", { contentDetails: { duration: "PT1H2M" } }),
          item("casa", { snippet: { channelTitle: "The White House", title: "President Trump delivers remarks" } }),
        ],
      }),
    });
    const r = await videosDosCanais(canais, "CHAVE", { fetcher, agoraMs: AGORA, janelaHoras: 48 });

    expect(r.videos.map((v) => v.origemId).sort()).toEqual(["casa", "novo"]);
    // channels (1, só o handle) + playlistItems (2) + videos (1, numa chamada só).
    expect(r.unidades).toBe(4);
    expect(pedidos.filter((p) => p.url.pathname.endsWith("/videos"))).toHaveLength(1);
    const novo = r.videos.find((v) => v.origemId === "novo")!;
    expect(novo.idioma).toBe("en");
    expect(canalDoCandidato(novo.metricas)).toEqual({ nome: "Bloomberg Television", idioma: "en", credito: "Bloomberg", id: BLOOMBERG });
    expect(novo.permalink).toBe("https://www.youtube.com/watch?v=novo");
  });

  it("canal que falha vira mensagem, e a chave nunca aparece nela", async () => {
    const { fetcher } = youtubeFalso({
      channels: () => ({ error: { message: "quota for key CHAVE exceeded" } }),
      playlistItems: () => ({ items: [] }),
    });
    const r = await videosDosCanais(canais, "CHAVE", { fetcher, agoraMs: AGORA });
    const branca = r.leituras.find((l) => l.canal === "The White House")!;
    expect(branca.ok).toBe(false);
    expect(branca.mensagem).not.toContain("CHAVE");
    expect(r.leituras.find((l) => l.canal === "Bloomberg Television")!.ok).toBe(true);
  });

  it("sem chave, não pede nada", async () => {
    const { fetcher, pedidos } = youtubeFalso({});
    expect((await videosDosCanais(canais, "", { fetcher })).videos).toEqual([]);
    expect(pedidos).toHaveLength(0);
  });
});

describe("o nicho dos Reels", () => {
  function video(extra: Partial<VideoAchado>): VideoAchado {
    return {
      fonte: "youtube",
      origemId: "1",
      permalink: "",
      urlVideo: null,
      autor: "CNBC Television",
      titulo: "",
      legenda: "",
      publicadoEm: "2026-11-09T10:00:00Z",
      metricas: {},
      notaDaFonte: 50,
      ...extra,
    };
  }

  it("o vídeo em inglês do canal entra pelo nicho em inglês", () => {
    expect(casaComNichoEmIngles("Powell says the Fed will hold rates")).toBe(true);
    expect(casaComNichoEmIngles("US stocks close higher")).toBe(true);
    expect(casaComNichoEmIngles("Come join us for the show")).toBe(false);
    expect(casaComNichoEmIngles("NFL highlights: Chiefs beat Bills in Texas")).toBe(false);
  });

  it("a imigração como notícia política entra; a orientação de visto fica fora", () => {
    const { ordenados, foraDoNicho } = ordenarVideos(
      [
        video({ origemId: "a", idioma: "en", titulo: "Trump says Congress must pass immigration bill" }),
        video({ origemId: "b", idioma: "en", titulo: "How to apply for a US green card in 2026" }),
        video({ origemId: "c", idioma: "en", titulo: "H-1B visa interview tips from an immigration lawyer" }),
        video({ origemId: "d", titulo: "Como tirar o visto americano: passo a passo" }),
      ],
      [],
    );
    expect(ordenados.map((v) => v.origemId)).toEqual(["a"]);
    expect(foraDoNicho.map((v) => v.origemId).sort()).toEqual(["b", "c", "d"]);
    expect(orientacaoDeVisto("Trump signs executive order on asylum")).toBe(false);
  });
});
