import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import {
  classificarPautas,
  decidirPauta,
  entidadesDaClassificacao,
  montarSystemDoClassificador,
} from "./classificador";
import type { Classificacao } from "./classificador";

const config = carregarConfigEditorial({});

function classificacao(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: true,
    leitura: "oportunidade",
    eixo: "processo",
    relevancia: 8,
    atores: ["USCIS"],
    lugares: ["EUA"],
    acontecimento: ["prorrogação"],
    justificativa: "prazo maior para renovar",
    ...over,
  };
}

describe("decidirPauta", () => {
  it("recusa notícia desfavorável sobre os EUA", () => {
    const d = decidirPauta(
      classificacao({ leitura: "desfavoravel", justificativa: "agente preso" }),
      config
    );
    expect(d.aprovada).toBe(false);
    expect(d.motivo).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);
  });

  it("aprova notícia desfavorável sobre o Brasil, que é o outro lado da comparação", () => {
    const d = decidirPauta(
      classificacao({
        pais: "Brasil",
        imigracao: false,
        leitura: "desfavoravel",
        eixo: "deterioracao_brasil",
      }),
      config
    );
    expect(d.aprovada).toBe(true);
    expect(d.motivo).toBe(MOTIVOS.APROVADO_DESAFIO_BRASIL);
  });

  it("recusa assunto brasileiro fora do eixo editorial", () => {
    const d = decidirPauta(
      classificacao({ pais: "Brasil", imigracao: false, eixo: "outro", leitura: "neutra" }),
      config
    );
    expect(d.aprovada).toBe(false);
  });

  it("recusa pauta irrelevante mesmo sendo dos EUA e positiva", () => {
    const d = decidirPauta(classificacao({ relevancia: 2 }), config);
    expect(d.motivo).toBe(MOTIVOS.REJEITADO_RELEVANCIA);
  });

  it("recusa terceiro país sem relação com imigração", () => {
    const d = decidirPauta(classificacao({ pais: "outro", imigracao: false }), config);
    expect(d.motivo).toBe(MOTIVOS.REJEITADO_SEM_CLASSIFICACAO);
  });

  it("aprova pauta de imigração dos EUA com leitura neutra", () => {
    const d = decidirPauta(classificacao({ leitura: "neutra" }), config);
    expect(d.aprovada).toBe(true);
    expect(d.motivo).toBe(MOTIVOS.APROVADO_IMIGRACAO);
  });
});

describe("classificarPautas", () => {
  const env = { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

  function respostaOpenAI(conteudo: unknown) {
    return new Response(
      JSON.stringify({
        id: "x",
        choices: [{ message: { content: JSON.stringify(conteudo) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 }
    );
  }

  it("indexa a resposta pelo id recebido", async () => {
    const fetcher = vi.fn(async () =>
      respostaOpenAI({ pautas: [classificacao({ id: "abc" })] })
    );
    const { classificacoes } = await classificarPautas(
      [{ id: "abc", titulo: "t", descricao: "d", fonte: "f", url: "u" }],
      env,
      fetcher as unknown as typeof fetch
    );
    expect(classificacoes.get("abc")?.pais).toBe("EUA");
  });

  it("deixa a pauta fora do mapa quando o lote volta em formato inválido", async () => {
    const fetcher = vi.fn(async () => respostaOpenAI({ pautas: [{ id: "abc" }] }));
    const { classificacoes, lotesComFalha } = await classificarPautas(
      [{ id: "abc", titulo: "t", descricao: "d", fonte: "f", url: "u" }],
      env,
      fetcher as unknown as typeof fetch
    );
    // Sem classificação a guarda recusa a pauta, então o resultado prático
    // continua sendo "não publica", com o motivo registrado.
    expect(classificacoes.has("abc")).toBe(false);
    expect(lotesComFalha[0]).toContain("formato inválido");
  });

  it("um lote que falha não derruba os outros", async () => {
    let chamada = 0;
    const fetcher = vi.fn(async () => {
      chamada += 1;
      if (chamada === 1) throw new Error("timeout");
      return respostaOpenAI({ pautas: [classificacao({ id: "b21" })] });
    });

    const pautas = Array.from({ length: 21 }, (_, i) => ({
      id: i === 20 ? "b21" : `a${i}`,
      titulo: "t",
      descricao: "d",
      fonte: "f",
      url: "u",
    }));

    const { classificacoes, lotesComFalha } = await classificarPautas(
      pautas,
      env,
      fetcher as unknown as typeof fetch
    );
    expect(classificacoes.has("b21")).toBe(true);
    expect(lotesComFalha).toHaveLength(1);
  });

  it("quebra a coleta em lotes em vez de mandar tudo numa chamada", async () => {
    const fetcher = vi.fn(async () => respostaOpenAI({ pautas: [] }));
    const pautas = Array.from({ length: 61 }, (_, i) => ({
      id: `a${i}`,
      titulo: "t",
      descricao: "d",
      fonte: "f",
      url: "u",
    }));
    await classificarPautas(pautas, env, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("não chama o modelo sem pauta nenhuma", async () => {
    const fetcher = vi.fn();
    const { classificacoes } = await classificarPautas([], env, fetcher as unknown as typeof fetch);
    expect(classificacoes.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("tolerância ao formato que o modelo devolve", () => {
  const env = { OPENAI_API_KEY: "chave" };

  it("aceita ator no singular sem derrubar as outras pautas do lote", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  pautas: [{ ...classificacao({ id: "a" }), atores: "USCIS", lugares: "EUA" }],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200 }
      )
    );

    const { classificacoes, lotesComFalha } = await classificarPautas(
      [{ id: "a", titulo: "t", descricao: "d", fonte: "f", url: "u" }],
      env,
      fetcher as unknown as typeof fetch
    );
    expect(classificacoes.get("a")?.atores).toEqual(["USCIS"]);
    expect(lotesComFalha).toHaveLength(0);
  });
});

describe("montarSystemDoClassificador, régua de relevância", () => {
  it("mede pauta brasileira pelo problema factual, não pelo efeito no visto", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("Para notícia do Brasil");
    expect(s).toContain("PROBLEMA FACTUAL CONCRETO");
  });

  it("proíbe forçar leitura negativa e proíbe lado partidário", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("Não force leitura negativa");
    expect(s).toContain("não adota lado partidário");
  });

  it("rebaixa declaração de político, que em ano eleitoral domina o feed", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("ALGUÉM TER DITO algo");
    expect(s).toContain("Crítica de candidato");
  });
});

describe("entidadesDaClassificacao", () => {
  it("entrega o formato que a camada de repetição por entidade espera", () => {
    expect(entidadesDaClassificacao(classificacao())).toEqual({
      atores: ["USCIS"],
      lugares: ["EUA"],
      acontecimento: ["prorrogação"],
    });
  });
});

describe("montarSystemDoClassificador", () => {
  it("descreve leitura pelo efeito do fato, não pelo tom do texto", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("não o tom do texto");
  });
});
