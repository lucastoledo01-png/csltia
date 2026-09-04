import { describe, expect, it, vi } from "vitest";
import { bancoConfigurado, buscarFotoDeBanco, consultaDeBusca } from "./stock";

describe("consultaDeBusca", () => {
  it("descarta palavra de instrução e mantém o que descreve a cena", () => {
    // "use uma foto sua" é instrução para quem lê o prompt, não descrição de
    // imagem: mandá-la para o Pexels devolve resultado aleatório.
    const q = consultaDeBusca("Use uma foto sua na feira de rua de São Paulo");
    expect(q).not.toContain("use");
    expect(q).not.toContain("foto");
    expect(q).toContain("feira");
    expect(q).toContain("rua");
  });

  it("limita o tamanho — busca longa não encontra nada nos dois bancos", () => {
    const q = consultaDeBusca(
      "fachada colorida azulejo varanda janela portao muro calcada arvore poste",
    );
    expect(q.split(" ").length).toBeLessThanOrEqual(5);
  });

  it("não repete a mesma palavra vinda da aplicação e do conceito", () => {
    const q = consultaDeBusca("praia de Copacabana", "praia carioca");
    expect(q.split(" ").filter((p) => p === "praia")).toHaveLength(1);
  });
});

describe("bancoConfigurado", () => {
  it("é falso sem nenhuma chave — o recurso nasce desligado", () => {
    expect(bancoConfigurado({})).toBe(false);
    expect(bancoConfigurado({ PEXELS_API_KEY: "   " })).toBe(false);
  });

  it("basta uma das duas chaves", () => {
    expect(bancoConfigurado({ UNSPLASH_ACCESS_KEY: "k" })).toBe(true);
  });
});

describe("buscarFotoDeBanco", () => {
  it("captura o crédito do fotógrafo junto da URL, num ato só", () => {
    // O crédito não é reconstruível depois: a mesma busca amanhã pode devolver
    // outra foto. Ou sai daqui com a URL, ou a atribuição se perde.
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          photos: [
            {
              src: { large2x: "https://img/1.jpg" },
              photographer: "Ana Lima",
              photographer_url: "https://pexels.com/@ana",
              url: "https://pexels.com/photo/1",
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    return buscarFotoDeBanco("feira rua", { env: { PEXELS_API_KEY: "k" }, fetcher }).then((foto) => {
      expect(foto?.imagemUrl).toBe("https://img/1.jpg");
      expect(foto?.credito.fotografo).toBe("Ana Lima");
      expect(foto?.credito.atribuicao).toContain("Ana Lima");
      expect(foto?.credito.atribuicao).toContain("Pexels");
    });
  });

  it("cai no Unsplash quando o Pexels não tem resultado", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const alvo = String(url);
      if (alvo.includes("pexels")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
      return new Response(
        JSON.stringify({
          results: [
            {
              urls: { regular: "https://img/2.jpg" },
              user: { name: "Bruno Sá", links: { html: "https://unsplash.com/@bruno" } },
              links: { html: "https://unsplash.com/p/2", download_location: "https://api/dl" },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const foto = await buscarFotoDeBanco("feira rua", {
      env: { PEXELS_API_KEY: "k", UNSPLASH_ACCESS_KEY: "u" },
      fetcher,
    });

    expect(foto?.credito.provedor).toBe("unsplash");
    // Os termos da API do Unsplash exigem o disparo de download quando a foto é
    // usada. Não é opcional, então é invariante testável.
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(chamadas).toContain("https://api/dl");
  });

  it("devolve null — nunca lança — quando os dois falham", async () => {
    const fetcher = vi.fn(async () => new Response("erro", { status: 500 })) as unknown as typeof fetch;
    await expect(
      buscarFotoDeBanco("x", { env: { PEXELS_API_KEY: "k", UNSPLASH_ACCESS_KEY: "u" }, fetcher }),
    ).resolves.toBeNull();
  });

  it("não chama ninguém com consulta vazia", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(buscarFotoDeBanco("  ", { env: { PEXELS_API_KEY: "k" }, fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
