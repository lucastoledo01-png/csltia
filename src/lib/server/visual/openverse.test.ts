import { describe, expect, it, vi } from "vitest";
import { buscarNoOpenverse, candidatoParaAsset, hostPermitido, textoDaLicenca } from "./openverse";
import type { EntidadeVisual } from "./tipos";

/**
 * O Openverse é índice de terceiro, e é por isso que ele é conferido aqui.
 *
 * Ele devolve foto de cinco acervos, com licença de cada item e host de cada
 * provedor. As três coisas que não podem passar dele para dentro: licença que
 * a allowlist recusa, host que o `next/image` não conhece, e conteúdo marcado
 * como sensível.
 */

const entidade: EntidadeVisual = {
  nome: "Moakley Courthouse",
  normalizado: "moakley courthouse",
  tipo: "place",
  confianca: 0.9,
  evidencias: [],
} as unknown as EntidadeVisual;

function resposta(results: unknown[]) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ result_count: results.length, results }), { status: 200 }),
  ) as unknown as typeof fetch;
}

function item(over: Record<string, unknown> = {}) {
  return {
    id: "abc-123",
    title: "John Joseph Moakley United States Courthouse",
    url: "https://live.staticflickr.com/3471/foto_b.jpg",
    creator: "David Arpi",
    license: "by",
    license_version: "2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    attribution: '"Moakley" by David Arpi is licensed under CC BY 2.0.',
    foreign_landing_url: "https://www.flickr.com/photos/1/2",
    source: "flickr",
    width: 1600,
    height: 1067,
    tags: [{ name: "boston" }, { name: "courthouse" }],
    ...over,
  };
}

describe("a licença vira texto que a allowlist reconhece", () => {
  it("traduz as quatro famílias aceitas", () => {
    expect(textoDaLicenca("by", "2.0")).toBe("CC BY 2.0");
    expect(textoDaLicenca("by-sa", "4.0")).toBe("CC BY-SA 4.0");
    expect(textoDaLicenca("cc0", "1.0")).toBe("CC0 1.0");
    expect(textoDaLicenca("pdm", "1.0")).toBe("Public Domain Mark 1.0");
  });

  it("licença que a allowlist recusa não vira asset", () => {
    // ND proíbe obra derivada, e recortar a foto para o formato da peça é
    // derivada. O filtro da busca já pede só as quatro famílias, e esta é a
    // segunda conferência, do lado de cá.
    const r = candidatoParaAsset(
      {
        id: "x",
        titulo: "t",
        imageUrl: "https://live.staticflickr.com/a.jpg",
        paginaUrl: "https://flickr.com/x",
        autor: "a",
        licenca: "CC BY-ND 2.0",
        licencaUrl: "",
        atribuicao: "",
        provedor: "flickr",
        largura: 1600,
        altura: 1000,
        mime: "image/jpeg",
        tags: "",
      },
      entidade,
    );
    expect(r.ok).toBe(false);
  });
});

describe("o host precisa estar liberado no next/image", () => {
  it("aceita os dois provedores conhecidos e recusa o resto", () => {
    expect(hostPermitido("https://live.staticflickr.com/1/2.jpg")).toBe(true);
    expect(hostPermitido("https://upload.wikimedia.org/a/b.jpg")).toBe(true);
    // Host desconhecido derruba a página inteira do artigo, não só a capa.
    expect(hostPermitido("https://cdn.exemplo.com/foto.jpg")).toBe(false);
    expect(hostPermitido("nao e url")).toBe(false);
  });

  it("resultado de host desconhecido é descartado na busca", async () => {
    const busca = await buscarNoOpenverse(entidade, {
      fetcher: resposta([item({ url: "https://cdn.exemplo.com/foto.jpg" })]),
    });
    expect(busca.candidatos).toHaveLength(0);
  });
});

describe("conteúdo sensível não entra", () => {
  it("descarta o que o índice marca como mature", async () => {
    const busca = await buscarNoOpenverse(entidade, { fetcher: resposta([item({ mature: true })]) });
    expect(busca.candidatos).toHaveLength(0);
  });

  it("descarta o que tem marcação de sensibilidade", async () => {
    const busca = await buscarNoOpenverse(entidade, {
      fetcher: resposta([item({ unstable__sensitivity: ["provider_supplied_sensitive"] })]),
    });
    expect(busca.candidatos).toHaveLength(0);
  });
});

describe("o asset sai completo", () => {
  it("usa a atribuição pronta do índice e preenche a metadata", async () => {
    const busca = await buscarNoOpenverse(entidade, { fetcher: resposta([item()]) });
    expect(busca.candidatos).toHaveLength(1);

    const r = candidatoParaAsset(busca.candidatos[0], entidade);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.asset.source).toBe("openverse");
    expect(r.asset.license).toBe("CC BY");
    expect(r.asset.attribution).toContain("David Arpi");
    expect(r.asset.sourcePageUrl).toContain("flickr.com");
    /*
     * Metadata vazia é mais perigosa que recusa: as barreiras de datação e de
     * figura não central leem descrição e categorias, e fonte que chega sem
     * esses campos passa por elas sem ser conferida.
     */
    expect(r.asset.metadata.descricao).toBeTruthy();
    expect(r.asset.metadata.categorias).toContain("boston");
  });
});
