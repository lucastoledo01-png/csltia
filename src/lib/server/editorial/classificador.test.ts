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
    natureza: "official_action",
    relevancia: 8,
    atores: ["USCIS"],
    lugares: ["EUA"],
    acontecimento: ["prorrogação"],
    justificativa: "prazo maior para renovar",
    ...over,
  };
}

describe("ato e fala", () => {
  it("limita a fala sobre o ato, que fica abaixo do piso", () => {
    const d = decidirPauta(
      classificacao({
        pais: "Brasil",
        imigracao: false,
        eixo: "deterioracao_brasil",
        leitura: "desfavoravel",
        natureza: "political_statement",
        relevancia: 8,
      }),
      config
    );
    expect(d.aprovada).toBe(false);
    expect(d.explicacao).toContain("declaração política");
  });

  it("deixa o ato oficial valer a nota que tem", () => {
    const d = decidirPauta(
      classificacao({
        pais: "Brasil",
        imigracao: false,
        eixo: "deterioracao_brasil",
        natureza: "official_action",
        relevancia: 8,
      }),
      config
    );
    expect(d.aprovada).toBe(true);
  });
});

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

  /** Os ids que o prompt daquela chamada pediu, lidos do corpo da requisição. */
  function idsDoPedido(init?: RequestInit): string[] {
    const corpo = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ content?: string }>;
    };
    const user = corpo.messages?.[1]?.content ?? "";
    return [...user.matchAll(/^id: (.+)$/gm)].map((m) => m[1].trim());
  }

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
    /*
     * O modelo devolve tudo que foi pedido, para a contagem medir só o
     * loteamento. Devolvendo vazio, o retry dos ids ausentes entra e dobra as
     * chamadas, que é comportamento de outro teste.
     */
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const enviados = idsDoPedido(init);
      return respostaOpenAI({ pautas: enviados.map((id) => classificacao({ id })) });
    });
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


  describe("id omitido pelo modelo volta uma vez, e só ele", () => {
    /*
     * O lote volta com JSON válido e mais curto que o pedido, sem erro nenhum.
     * As pautas ausentes são recusadas mais adiante como REJECT_UNCLASSIFIED, e
     * na medição de sete dias isso apareceu como 42 num relatório e 5 no
     * seguinte, com o mesmo código: a omissão é intermitente.
     */
    const tres = [
      { id: "p1", titulo: "t1", descricao: "d", fonte: "f", url: "u1" },
      { id: "p2", titulo: "t2", descricao: "d", fonte: "f", url: "u2" },
      { id: "p3", titulo: "t3", descricao: "d", fonte: "f", url: "u3" },
    ];

    it("repete só os ausentes, não o lote inteiro", async () => {
      const pedidos: string[][] = [];
      const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const ids = idsDoPedido(init);
        pedidos.push(ids);
        // Na primeira, o modelo esquece p2. Na segunda, devolve o que pedirem.
        const devolver = pedidos.length === 1 ? ids.filter((i) => i !== "p2") : ids;
        return respostaOpenAI({ pautas: devolver.map((id) => classificacao({ id })) });
      });

      const { classificacoes, diagnostico } = await classificarPautas(
        tres,
        env,
        fetcher as unknown as typeof fetch,
      );

      expect(pedidos).toHaveLength(2);
      expect(pedidos[0]).toEqual(["p1", "p2", "p3"]);
      // O retry pede um id, não três: repetir o lote seria pagar de novo pelo
      // que já veio.
      expect(pedidos[1]).toEqual(["p2"]);
      expect(classificacoes.size).toBe(3);
      expect(diagnostico.ausentesNaPrimeira).toBe(1);
      expect(diagnostico.reclassificados).toBe(1);
      expect(diagnostico.chamadasDeRetry).toBe(1);
    });

    it("no máximo um retry: o que faltar segue sem classificação", async () => {
      const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const ids = idsDoPedido(init).filter((i) => i !== "p2");
        return respostaOpenAI({ pautas: ids.map((id) => classificacao({ id })) });
      });

      const { classificacoes, diagnostico } = await classificarPautas(
        tres,
        env,
        fetcher as unknown as typeof fetch,
      );

      // Duas chamadas e para: a primeira do lote, a segunda do retry.
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(classificacoes.has("p2")).toBe(false);
      expect(diagnostico.reclassificados).toBe(0);
      // Seguir sem classificação seria publicar sem o filtro editorial, então
      // p2 continua fora e será recusada por precaução.
      expect(classificacoes.size).toBe(2);
    });

    it("sem ausente, não há retry nem custo extra", async () => {
      const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) =>
        respostaOpenAI({ pautas: idsDoPedido(init).map((id) => classificacao({ id })) }),
      );

      const { diagnostico } = await classificarPautas(tres, env, fetcher as unknown as typeof fetch);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(diagnostico).toEqual({ ausentesNaPrimeira: 0, reclassificados: 0, chamadasDeRetry: 0 });
    });

    it("o retry não muda a decisão de quem já foi classificado", async () => {
      /*
       * O retry existe para reduzir omissão, não para dar segunda chance a
       * quem já foi julgado. Se ele reclassificasse todo mundo, uma pauta
       * reprovada na primeira poderia passar na segunda por acaso, e a
       * instabilidade do modelo viraria política editorial.
       */
      const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const ids = idsDoPedido(init);
        if (ids.length === 3) {
          return respostaOpenAI({
            pautas: [classificacao({ id: "p1", relevancia: 9 }), classificacao({ id: "p3", relevancia: 2 })],
          });
        }
        // Se o retry mandasse p1 e p3 de novo, estas notas sobrescreveriam.
        return respostaOpenAI({
          pautas: ids.map((id) => classificacao({ id, relevancia: 5 })),
        });
      });

      const { classificacoes } = await classificarPautas(tres, env, fetcher as unknown as typeof fetch);

      expect(classificacoes.get("p1")?.relevancia).toBe(9);
      expect(classificacoes.get("p3")?.relevancia).toBe(2);
      expect(classificacoes.get("p2")?.relevancia).toBe(5);
    });

    it("o retry respeita o mesmo orçamento de caracteres do lote", async () => {
      // 30 ausentes com resumo longo não podem voltar numa chamada só, pela
      // mesma razão que o lote normal não vai: o que estoura é o texto.
      const muitas = Array.from({ length: 30 }, (_, i) => ({
        id: `x${i}`,
        titulo: "t",
        descricao: "y".repeat(2500),
        fonte: "f",
        url: `u${i}`,
      }));
      // Omite na primeira vez que vê cada id e devolve na segunda: é assim
      // que a omissão intermitente se comporta, e não depende de contar
      // chamadas.
      const vistos = new Set<string>();
      const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        const ids = idsDoPedido(init);
        const devolver = ids.filter((id) => vistos.has(id));
        for (const id of ids) vistos.add(id);
        return respostaOpenAI({ pautas: devolver.map((id) => classificacao({ id })) });
      });

      const { diagnostico } = await classificarPautas(muitas, env, fetcher as unknown as typeof fetch);

      expect(diagnostico.ausentesNaPrimeira).toBe(30);
      expect(diagnostico.chamadasDeRetry).toBeGreaterThan(1);
    });
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

  it("separa ato de fala, em vez de rebaixar toda declaração", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("official_action");
    expect(s).toContain("political_statement");
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

describe("eixo Brasil, o que é custo de vida do leitor", () => {
  it("descarta disputa comercial e commodity do eixo de custo de vida", () => {
    const s = montarSystemDoClassificador();
    expect(s).toContain("NÃO entra aqui disputa comercial entre países");
    expect(s).toContain("Notícia setorial");
  });
});
