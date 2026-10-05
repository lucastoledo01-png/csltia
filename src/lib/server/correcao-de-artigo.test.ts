import { describe, expect, it } from "vitest";
import {
  conferirProposta,
  descricaoPorRegra,
  editoriaPorRegra,
  proporComplementos,
  secoesDoCorpo,
  tituloDeBuscaPorRegra,
  trocarIntertitulos,
  trocarIntertitulosNoConteudo,
} from "./correcao-de-artigo";

/** O corpo real da matéria de Hollywood, como o desmonte das edições gravou. */
const HOLLYWOOD =
  `<section><p>Investidores privados estão entrando no financiamento de Hollywood com interesse em filmes independentes, propriedade intelectual e audiência. Anita Verma-Lallian, da Camelback Productions, diz que as fontes tradicionais de dinheiro começaram a diminuir, embora não espere que o capital privado vire a principal fonte do setor.</p>` +
  `<p>Algumas produções independentes foram concluídas em cerca de um ano, contra <strong>cinco a dez anos</strong> no sistema tradicional.</p></section>` +
  `<section><h2>Contexto</h2><p>Netflix e Amazon continuam aumentando os gastos com conteúdo, enquanto Paramount e Warner Bros. Discovery estão entre os grandes participantes de uma possível consolidação.</p></section>` +
  `<p class="fonte">Fonte: <a href="https://www.cnbc.com/x" rel="noopener" target="_blank">CNBC</a></p>`;

describe("título de busca por regra", () => {
  it("título que cabe e situa fica como está", () => {
    expect(tituloDeBuscaPorRegra("Emprego nos EUA quase não muda em setembro")).toEqual({
      valor: "Emprego nos EUA quase não muda em setembro",
      precisaDeMao: false,
    });
  });

  it("tira 'nos EUA' quando outra marca já situa", () => {
    expect(tituloDeBuscaPorRegra("Hollywood nos EUA atrai capital privado para filmes independentes").valor).toBe(
      "Hollywood atrai capital privado para filmes independentes",
    );
  });

  it("fica com a metade do fato quando a outra é a ressalva", () => {
    expect(tituloDeBuscaPorRegra("Renda domiciliar nos EUA bate recorde, mas quem ganha menos avança pouco").valor).toBe(
      "Renda domiciliar nos EUA bate recorde",
    );
  });

  it("sem saída por regra: o título inteiro, sem reticências, e a marca de que precisa de mão", () => {
    const r = tituloDeBuscaPorRegra("Juíza considera inconstitucional busca sem mandado no Flock, em Oklahoma");
    expect(r.precisaDeMao).toBe(true);
    expect(r.valor).not.toContain("…");
  });
});

describe("descrição por regra", () => {
  it("frases inteiras do corpo, de 120 a 155, que não repetem o título", () => {
    const r = descricaoPorRegra("Hollywood nos EUA atrai capital privado para filmes independentes", HOLLYWOOD, new Set());
    expect(r.valor).toBe(
      "Investidores privados estão entrando no financiamento de Hollywood com interesse em filmes independentes, propriedade intelectual e audiência.",
    );
    expect(r.valor!.length).toBeGreaterThanOrEqual(120);
    expect(r.valor!.length).toBeLessThanOrEqual(155);
  });

  it("não repete a descrição de outra matéria; sem outra combinação que caiba, vai para a mão", () => {
    const usada = new Set([
      "investidores privados estao entrando no financiamento de hollywood com interesse em filmes independentes, propriedade intelectual e audiencia.",
    ]);
    const r = descricaoPorRegra("Hollywood nos EUA atrai capital privado para filmes independentes", HOLLYWOOD, usada);
    // As outras frases inteiras não fecham 120 a 155: melhor a mão que uma descrição repetida ou cortada.
    expect(r).toEqual({ valor: null, precisaDeMao: true });
  });
});

describe("editoria por regra", () => {
  it("mantém a que já é do portal e infere a que não é", () => {
    expect(editoriaPorRegra("Economia", "x")).toBe("Economia");
    expect(editoriaPorRegra("Edição Diária", "Inflação no Brasil sobe")).toBe("Brasil");
  });
});

describe("a proposta do modelo passa pela conferência do corpo", () => {
  const secoes = secoesDoCorpo(HOLLYWOOD);

  it("lê as seções do HTML, com o intertítulo e sem o crédito da fonte", () => {
    expect(secoes.map((s) => s.intertitulo)).toEqual(["", "Contexto"]);
    expect(secoes[1].texto).toContain("Netflix e Amazon");
  });

  it("pergunta com número inventado cai; a sustentada fica", () => {
    const r = conferirProposta(
      {
        intertitulos: [],
        perguntas: [
          { pergunta: "Quanto tempo leva uma produção independente?", resposta: "Algumas foram concluídas em cerca de um ano, contra cinco a dez anos no sistema tradicional." },
          { pergunta: "Quanto o capital privado investiu?", resposta: "Os investidores aplicaram US$ 3 bilhões em filmes independentes." },
          { pergunta: "Quem é Anita Verma-Lallian?", resposta: "Ela é diretora da Sony Pictures em Hollywood." },
        ],
      },
      secoes,
    );
    expect(r.perguntas.map((p) => p.pergunta)).toEqual(["Quanto tempo leva uma produção independente?"]);
    expect(r.recusas).toHaveLength(2);
  });

  it("intertítulo fiel à seção entra; o que traz nome de fora ou é rótulo cai", () => {
    const r = conferirProposta(
      {
        perguntas: [],
        intertitulos: [
          { secao: 1, texto: "Netflix e Amazon aumentam gastos com conteúdo" },
          { secao: 1, texto: "Disney lidera a consolidação" },
          { secao: 1, texto: "Contexto" },
          { secao: 0, texto: "Investidores privados entram em Hollywood" },
        ],
      },
      secoes,
    );
    expect([...r.intertitulos.entries()]).toEqual([[1, "Netflix e Amazon aumentam gastos com conteúdo"]]);
    expect(r.recusas.map((x) => x.motivo)).toEqual([
      expect.stringMatching(/fora da seção|palavras estão na seção/),
      "rótulo de gaveta",
      "seção sem intertítulo ou inexistente",
    ]);
  });

  it("travessão nunca passa", () => {
    const r = conferirProposta({ intertitulos: [], perguntas: [{ pergunta: "Quanto tempo leva?", resposta: "Cerca de um ano \u2014 contra cinco a dez anos." }] }, secoes);
    expect(r.perguntas).toEqual([]);
  });
});

describe("aplicar ao corpo", () => {
  it("troca só o texto do intertítulo, e nenhum parágrafo", () => {
    const novo = trocarIntertitulos(HOLLYWOOD, new Map([[1, "Netflix e Amazon aumentam gastos com conteúdo"]]));
    expect(novo).toContain("<h2>Netflix e Amazon aumentam gastos com conteúdo</h2>");
    expect(novo.replace(/<h2>[^<]*<\/h2>/g, "")).toBe(HOLLYWOOD.replace(/<h2>[^<]*<\/h2>/g, ""));
  });

  it("o content em JSON muda junto, na mesma posição", () => {
    const conteudo = [
      { heading: "", paragraphs: ["a"] },
      { heading: "Contexto", paragraphs: ["b"] },
    ];
    expect(trocarIntertitulosNoConteudo(conteudo, new Map([[1, "Novo"]]))).toEqual([
      { heading: "", paragraphs: ["a"] },
      { heading: "Novo", paragraphs: ["b"] },
    ]);
  });
});

describe("a chamada", () => {
  it("é uma só, pelo modelo de triagem, e devolve o custo medido", async () => {
    const chamadas: string[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      chamadas.push(JSON.parse(String(init.body)).model);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ intertitulos: [], perguntas: [{ pergunta: "A?", resposta: "b" }] }) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await proporComplementos("T", secoesDoCorpo(HOLLYWOOD), {
      env: { OPENAI_API_KEY: "teste", OPENAI_MODEL_TRIAGE: "modelo-mini" },
      fetcher,
    });
    expect(chamadas).toEqual(["modelo-mini"]);
    expect(r.proposta.perguntas).toHaveLength(1);
    expect(r.custoUsd).toBeGreaterThan(0);
  });
});
