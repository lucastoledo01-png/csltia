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

  it("interrompe quando o formato não bate, em vez de seguir sem filtro", async () => {
    const fetcher = vi.fn(async () => respostaOpenAI({ pautas: [{ id: "abc" }] }));
    await expect(
      classificarPautas(
        [{ id: "abc", titulo: "t", descricao: "d", fonte: "f", url: "u" }],
        env,
        fetcher as unknown as typeof fetch
      )
    ).rejects.toThrow(/formato inválido/);
  });

  it("não chama o modelo sem pauta nenhuma", async () => {
    const fetcher = vi.fn();
    const { classificacoes } = await classificarPautas([], env, fetcher as unknown as typeof fetch);
    expect(classificacoes.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
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
