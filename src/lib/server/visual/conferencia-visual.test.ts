import { describe, expect, it } from "vitest";
import { conferirImagem } from "./conferencia-visual";

/**
 * A barreira que abre a imagem.
 *
 * Todas as outras leem texto: relevância compara nome de entidade com nome de
 * arquivo, temporalidade compara data, `semanticContextFit` compara polaridade
 * de palavra. Nenhuma delas conseguia dizer que um prédio com letreiro em
 * cirílico não ilustra o Departamento do Trabalho americano.
 *
 * A diferença de natureza é o ponto: as outras perguntam "há indício de erro?"
 * e aprovam no silêncio. Esta pergunta "o que você vê?" e recusa no silêncio.
 */

const ENV = { OPENAI_API_KEY: "chave-de-teste" };

const FOTO = {
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/2/24/Higher_school_of_economics%2C_perm.jpeg",
  sourceAssetId: "File:Higher school of economics, perm.jpeg",
  imageContextType: "place" as const,
};

const PAUTA = {
  titulo: "Quem busca contratação permanente depende da prova da empresa no PERM",
  resumo: "Na certificação permanente de trabalho, o empregador envia a solicitação ao DOL.",
  eixo: "imigracao",
};

function respondendo(conteudo: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(conteudo) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    text: async () => "erro",
  })) as unknown as typeof fetch;
}

describe("a conferência visual", () => {
  it("reprova a universidade russa numa pauta americana", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, {
      env: ENV,
      fetcher: respondendo({
        descricao: "fachada de um prédio universitário com letreiro em cirílico",
        paisAparente: "Rússia",
        aprovada: false,
        motivo: "a cena é russa e a pauta é sobre um programa do governo americano",
        confianca: 96,
      }),
    });

    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.falhou).toBe(false);
    expect(veredicto.paisAparente).toBe("Rússia");
    expect(veredicto.descricao).toContain("cirílico");
  });

  it("aprova a cena de apoio honesta e do país certo", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, {
      env: ENV,
      fetcher: respondendo({
        descricao: "fachada do Departamento do Trabalho em Washington",
        paisAparente: "Estados Unidos",
        aprovada: true,
        motivo: "é o órgão que conduz a etapa descrita na manchete",
        confianca: 92,
      }),
    });

    expect(veredicto.aprovada).toBe(true);
    expect(veredicto.confianca).toBe(92);
  });

  /**
   * "Provavelmente serve" não é critério para um perfil que publica sozinho.
   */
  it("aprovação com confiança abaixo do piso vira recusa", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, {
      env: ENV,
      fetcher: respondendo({
        descricao: "um prédio de escritórios genérico",
        paisAparente: null,
        aprovada: true,
        motivo: "talvez sirva como apoio",
        confianca: 40,
      }),
    });

    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.motivo).toContain("abaixo do piso");
  });

  it("o piso é configurável", async () => {
    const fetcher = respondendo({
      descricao: "fachada de tribunal",
      paisAparente: "Estados Unidos",
      aprovada: true,
      motivo: "serve de apoio",
      confianca: 60,
    });

    expect((await conferirImagem(FOTO, PAUTA, { env: ENV, fetcher })).aprovada).toBe(false);
    expect(
      (await conferirImagem(FOTO, PAUTA, { env: ENV, fetcher, pisoDeConfianca: 50 })).aprovada,
    ).toBe(true);
  });

  /**
   * Falha vira recusa, e não passe livre.
   *
   * Sem chave, com a rede fora ou com resposta ilegível, a alternativa não é
   * publicar sem conferir: é a bandeira, que nunca está errada. O campo
   * `falhou` existe para o relatório separar "estava errada" de "não deu para
   * conferir", que são problemas diferentes.
   */
  it("recusa quando não há credencial", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, { env: {} });
    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.falhou).toBe(true);
    expect(veredicto.motivo).toContain("sem credencial");
  });

  it("recusa quando a chamada quebra", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, {
      env: ENV,
      fetcher: (async () => {
        throw new Error("timeout");
      }) as unknown as typeof fetch,
    });
    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.falhou).toBe(true);
  });

  it("recusa quando a resposta vem fora do formato", async () => {
    const veredicto = await conferirImagem(FOTO, PAUTA, {
      env: ENV,
      fetcher: respondendo({ descricao: "algo", motivo: "algo" }),
    });
    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.falhou).toBe(true);
    expect(veredicto.motivo).toContain("formato inesperado");
  });

  it("recusa imagem sem URL pública, porque não há o que abrir", async () => {
    const veredicto = await conferirImagem(
      { ...FOTO, imageUrl: "" },
      PAUTA,
      { env: ENV, fetcher: respondendo({}) },
    );
    expect(veredicto.aprovada).toBe(false);
    expect(veredicto.falhou).toBe(true);
  });

  /**
   * O modelo de produção não aceita `temperature`, e isso quase custou tudo.
   *
   * Na primeira medição contra a API real, o `gpt-5.6-luna` respondeu 400 em
   * quatro de quatro imagens dizendo que só o valor padrão vale. O portão fez a
   * coisa certa e recusou todas, inclusive as boas: seria uma leva inteira de
   * bandeira por causa de um parâmetro de amostragem.
   */
  it("refaz a chamada sem temperature quando o modelo recusa o parâmetro", async () => {
    const enviados: Array<Record<string, unknown>> = [];
    const fetcher = (async (_url: string, init: { body: string }) => {
      const corpo = JSON.parse(init.body) as Record<string, unknown>;
      enviados.push(corpo);

      if (corpo.temperature !== undefined) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            '{"error":{"message":"Unsupported value: \'temperature\' does not support 0 with this model."}}',
          json: async () => ({}),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  descricao: "fachada do Census Bureau",
                  paisAparente: "Estados Unidos",
                  aprovada: true,
                  motivo: "é o órgão da manchete",
                  confianca: 99,
                }),
              },
            },
          ],
          usage: {},
        }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;

    const veredicto = await conferirImagem(FOTO, PAUTA, { env: ENV, fetcher });

    expect(veredicto.aprovada).toBe(true);
    expect(enviados).toHaveLength(2);
    expect(enviados[0].temperature).toBe(0);
    expect(enviados[1].temperature).toBeUndefined();
  });

  /** Erro que não é de temperatura não ganha segunda chance. */
  it("não repete a chamada quando o erro é outro", async () => {
    let chamadas = 0;
    const fetcher = (async () => {
      chamadas += 1;
      return { ok: false, status: 500, text: async () => "erro interno", json: async () => ({}) };
    }) as unknown as typeof fetch;

    const veredicto = await conferirImagem(FOTO, PAUTA, { env: ENV, fetcher });

    expect(veredicto.falhou).toBe(true);
    expect(chamadas).toBe(1);
  });

  /**
   * Julgamento, não redação: a mesma foto na mesma pauta tem que dar o mesmo
   * veredicto nas duas vezes. Um portão que muda de opinião não é portão.
   */
  it("manda a imagem e pede temperatura zero", async () => {
    let corpo: Record<string, unknown> = {};
    const fetcher = (async (_url: string, init: { body: string }) => {
      corpo = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  descricao: "x",
                  paisAparente: null,
                  aprovada: true,
                  motivo: "y",
                  confianca: 90,
                }),
              },
            },
          ],
          usage: {},
        }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;

    await conferirImagem(FOTO, PAUTA, { env: ENV, fetcher });

    expect(corpo.temperature).toBe(0);
    const mensagens = corpo.messages as Array<{ content: unknown }>;
    const partes = mensagens[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(partes.some((p) => p.type === "image_url" && p.image_url?.url === FOTO.imageUrl)).toBe(true);
    expect(JSON.stringify(partes)).toContain("PERM");
  });
});
