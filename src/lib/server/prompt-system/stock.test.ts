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

  it("liga com a chave do Pexels", () => {
    expect(bancoConfigurado({ PEXELS_API_KEY: "k" })).toBe(true);
  });

  it("ignora chave do Unsplash — o provedor foi removido de propósito", () => {
    // As API Guidelines do Unsplash exigem atribuição visível de quem usa a
    // API. Como a decisão editorial é não creditar no post, manter o provedor
    // seria manter um caminho só legítimo com um crédito que não existe.
    expect(bancoConfigurado({ UNSPLASH_ACCESS_KEY: "k" })).toBe(false);
  });
});

describe("buscarFotoDeBanco", () => {
  it("registra a proveniência junto da URL, num ato só", () => {
    // Registro interno, não texto de post: a origem não é reconstruível
    // depois — a mesma busca amanhã devolve outra foto. Ou sai daqui, ou
    // não há como responder a uma contestação sobre esta imagem.
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
      expect(foto?.credito.fotoUrl).toBe("https://pexels.com/photo/1");
    });
  });

  it("devolve null — nunca lança — quando a API falha", async () => {
    // Falhar aqui não pode custar a imagem: quem chama cai na geração do zero.
    const fetcher = vi.fn(async () => new Response("erro", { status: 500 })) as unknown as typeof fetch;
    await expect(
      buscarFotoDeBanco("x", { env: { PEXELS_API_KEY: "k" }, fetcher }),
    ).resolves.toBeNull();
  });

  it("não chama ninguém com consulta vazia", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(buscarFotoDeBanco("  ", { env: { PEXELS_API_KEY: "k" }, fetcher })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
