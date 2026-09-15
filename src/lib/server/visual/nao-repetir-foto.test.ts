import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarFotoDeBanco, identidadeDaFoto } from "../prompt-system/stock";
import { fotosUsadasRecentemente } from "./memoria-de-fotos";

/**
 * A mesma foto não sai duas vezes.
 *
 * Entre 13 e 15/09/2026 a `pexels-photo-3751006` ilustrou quatro posts e a
 * `pexels-photo-6358834` ilustrou dois. Duas causas somadas: a busca pedia um
 * único resultado, então mesma consulta devolvia sempre a mesma foto; e
 * ninguém guardava o que já tinha saído, porque a biblioteca interna indexa
 * por ENTIDADE e a foto conceitual é escolhida por conceito.
 *
 * Estes testes fixam as duas pontas: a busca sabe pular, e a memória sabe
 * dizer o que pular.
 */

const PEXELS = "https://images.pexels.com/photos/3751006/pexels-photo-3751006.jpeg";

function respostaDoPexels(ids: number[]) {
  return {
    ok: true,
    json: async () => ({
      photos: ids.map((id) => ({
        src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=940` },
        photographer: `Fotógrafo ${id}`,
        photographer_url: "https://pexels.com/@x",
        url: `https://pexels.com/photo/${id}`,
      })),
    }),
  } as unknown as Response;
}

describe("identidade da foto", () => {
  it("ignora os parâmetros de entrega, que mudam com o tamanho pedido", () => {
    const a = identidadeDaFoto(`${PEXELS}?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`);
    const b = identidadeDaFoto(`${PEXELS}?w=1200`);

    // Sem isto, a mesma foto em dois tamanhos contaria como duas fotos, e a
    // régua não pegaria exatamente o caso que aconteceu no feed.
    expect(a).toBe(b);
  });
});

describe("a busca no banco conceitual pula o que já saiu", () => {
  it("devolve a segunda foto quando a primeira já foi usada", async () => {
    const fetcher = (async () => respostaDoPexels([3751006, 999111])) as unknown as typeof fetch;

    const foto = await buscarFotoDeBanco("green card interview", {
      env: { PEXELS_API_KEY: "chave" },
      fetcher,
      evitar: [`${PEXELS}?dpr=2&w=940`],
    });

    expect(foto?.imagemUrl).toContain("999111");
  });

  it("sem memória, continua devolvendo a primeira", async () => {
    const fetcher = (async () => respostaDoPexels([3751006, 999111])) as unknown as typeof fetch;

    const foto = await buscarFotoDeBanco("green card interview", {
      env: { PEXELS_API_KEY: "chave" },
      fetcher,
    });

    expect(foto?.imagemUrl).toContain("3751006");
  });

  it("todas já usadas devolve nada, e o post sai sem foto em vez de repetir", async () => {
    const fetcher = (async () => respostaDoPexels([3751006, 999111])) as unknown as typeof fetch;

    const foto = await buscarFotoDeBanco("green card interview", {
      env: { PEXELS_API_KEY: "chave" },
      fetcher,
      evitar: [
        "https://images.pexels.com/photos/3751006/pexels-photo-3751006.jpeg",
        "https://images.pexels.com/photos/999111/pexels-photo-999111.jpeg",
      ],
    });

    expect(foto).toBeNull();
  });
});

describe("a memória lê do mesmo lugar que registra a publicação", () => {
  function bancoCom(linhas: Array<Record<string, unknown>>) {
    return {
      from() {
        const q = {
          select: () => q,
          eq: () => q,
          gte: () => Promise.resolve({ data: linhas, error: null }),
        };
        return q;
      },
    } as unknown as SupabaseClient;
  }

  it("extrai a identidade da foto de cada post que foi ao ar", async () => {
    const client = bancoCom([
      { content_json: { visual: { imageUrl: `${PEXELS}?dpr=2&w=940` } } },
      { content_json: { visual: { imageUrl: `${PEXELS}?w=1200` } } },
      { content_json: { visual: { imageUrl: "https://images.unsplash.com/photo-165416" } } },
      { content_json: { copy: {} } },
    ]);

    const usadas = await fotosUsadasRecentemente(client, "proj-1", "2026-07-01T00:00:00Z");

    // A mesma foto em dois tamanhos conta uma vez, e post sem visual não quebra.
    expect(usadas).toHaveLength(2);
    expect(usadas).toContain(identidadeDaFoto(PEXELS));
  });

  it("falha de leitura devolve memória vazia, e não derruba o ciclo", async () => {
    const client = {
      from() {
        const q = {
          select: () => q,
          eq: () => q,
          gte: () => Promise.resolve({ data: null, error: { message: "timeout" } }),
        };
        return q;
      },
    } as unknown as SupabaseClient;

    await expect(fotosUsadasRecentemente(client, "proj-1", "2026-07-01T00:00:00Z")).resolves.toEqual([]);
  });
});
