import { describe, expect, it, vi } from "vitest";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDaCapa,
  consultaDaNoticia,
  consultaDeBusca,
} from "./stock";

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

  it("basta uma das duas chaves", () => {
    expect(bancoConfigurado({ UNSPLASH_ACCESS_KEY: "k" })).toBe(true);
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
      // Nulo é o que mantém o Pexels sem crédito na entrega: a licença não
      // exige, e a decisão editorial é não creditar.
      expect(foto?.credito.atribuicao).toBeNull();
    });
  });

  it("cai no Unsplash quando o Pexels não tem resultado, e aí credita", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const alvo = String(url);
      if (alvo.includes("pexels")) return new Response(JSON.stringify({ photos: [] }), { status: 200 });
      if (alvo.includes("api/dl")) return new Response("{}", { status: 200 });
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
      env: { PEXELS_API_KEY: "k", UNSPLASH_ACCESS_KEY: "u", UNSPLASH_APP_NAME: "desbuguei-ia" },
      fetcher,
    });

    expect(foto?.credito.provedor).toBe("unsplash");

    // Diferente do Pexels: aqui as API Guidelines exigem crédito, então o
    // texto tem que existir — é ele que a página de entrega usa para decidir
    // se mostra a linha.
    expect(foto?.credito.atribuicao).toBe("Foto de Bruno Sá no Unsplash");

    // E o link de volta ao perfil precisa do UTM que as guidelines pedem.
    expect(foto?.credito.fotografoUrl).toContain("utm_source=desbuguei-ia");
    expect(foto?.credito.fotografoUrl).toContain("utm_medium=referral");

    // O disparo de download também é termo de uso, não telemetria opcional.
    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(chamadas).toContain("https://api/dl");
  });

  it("não vai ao Unsplash quando o Pexels resolveu", async () => {
    // Ordem importa: o Pexels não gera obrigação de crédito, então quanto mais
    // imagens vierem dele, menos linhas de atribuição na entrega.
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          photos: [{ src: { large2x: "https://img/1.jpg" }, photographer: "Ana" }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await buscarFotoDeBanco("feira", {
      env: { PEXELS_API_KEY: "k", UNSPLASH_ACCESS_KEY: "u" },
      fetcher,
    });

    const chamadas = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(chamadas.some((c) => c.includes("unsplash"))).toBe(false);
  });

  it("devolve null — nunca lança — quando os dois falham", async () => {
    // Falhar aqui não pode custar a imagem: quem chama cai na geração do zero.
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

describe("consulta da capa", () => {
  it("descarta a direção fotográfica e mantém a cena", () => {
    // O prompt de capa traz cena + direção. A direção ("editorial", "natural
    // light", "shallow depth of field") cabe em qualquer foto do acervo e
    // dilui a busca até devolver qualquer coisa.
    const q = consultaDaCapa(
      "Exterior of a United States embassy building with the American flag, people queuing " +
        "outside on the sidewalk, overcast daylight. Editorial photojournalism, realistic " +
        "documentary photograph, natural available light, shallow depth of field",
      "Novo decreto muda critério do visto de trabalho",
    );

    expect(q).toContain("embassy");
    for (const ruido of ["editorial", "light", "photograph", "documentary", "daylight"]) {
      expect(q).not.toContain(ruido);
    }
  });

  it("é curta — busca longa não acha nada no acervo", () => {
    const q = consultaDaCapa(
      "A crowded immigration services waiting room with rows of people holding folders and paperwork",
    );
    expect(q.split(" ").length).toBeLessThanOrEqual(4);
  });

  it("cai no título quando não há prompt de capa", () => {
    const q = consultaDaCapa("", "Fila do green card chega a 179 anos");
    expect(q.length).toBeGreaterThan(0);
    expect(q).toContain("green");
  });
});

describe("consulta da pauta da newsletter", () => {
  it("mapeia o assunto, não a frase — o título é português e o acervo é inglês", () => {
    // "fila do green card chega a 179 anos" devolveria quase nada num acervo
    // indexado em inglês, e o pouco que voltasse não teria relação.
    expect(consultaDaNoticia("Fila do green card chega a 179 anos")).toContain("green card");
    expect(consultaDaNoticia("Agente do ICE é solto sob fiança")).toContain("law enforcement");
    expect(consultaDaNoticia("USCIS estende prazo de comentários")).toContain("paperwork");
  });

  it("pautas de assuntos diferentes não recebem a mesma foto", () => {
    // Era o sintoma: toda pauta ilustrada com a mesma imagem genérica.
    const consultas = [
      consultaDaNoticia("Novo decreto sobre deportação", "ICE"),
      consultaDaNoticia("Fila do green card", "Residência"),
      consultaDaNoticia("Entrevista no consulado muda de regra", "Vistos"),
      consultaDaNoticia("Corte decide sobre asilo", "Justiça"),
    ];
    expect(new Set(consultas).size).toBe(consultas.length);
  });

  it("cai numa consulta do tema quando nada casa", () => {
    const q = consultaDaNoticia("Uma notícia sem palavra reconhecível aqui");
    expect(q).toContain("american");
  });
});
