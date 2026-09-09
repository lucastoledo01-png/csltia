import { describe, expect, it, vi } from "vitest";
import { montarPacoteFactual, validarAncoragem } from "./pacote-factual";
import type { PacoteFactual } from "./pacote-factual";

const origem =
  "Uma investigação da Polícia Federal sobre supostas irregularidades financeiras envolvendo o " +
  "extinto Banco Master atingiu o Supremo Tribunal Federal, a Procuradoria-Geral da República, o " +
  "Congresso Nacional e o Palácio do Planalto. Relatórios da PF vieram a público e ministros " +
  "divergiram publicamente.";

const pacote: PacoteFactual = {
  verified_facts: [
    "A Polícia Federal investiga supostas irregularidades financeiras envolvendo o Banco Master.",
    "A crise atingiu o Supremo Tribunal Federal e a Procuradoria-Geral da República.",
  ],
  people: [],
  organizations: ["Polícia Federal", "Banco Master", "Supremo Tribunal Federal", "Congresso Nacional"],
  places: ["Brasil"],
  dates: [],
  numbers: [],
  gaps: ["A matéria não informa o valor envolvido."],
  source_urls: ["https://g1.globo.com/x"],
  texto_de_origem: origem,
};

describe("validarAncoragem", () => {
  it("aprova texto que só afirma o que está no material", () => {
    const texto =
      "Uma investigação da Polícia Federal sobre o Banco Master alcançou o Supremo Tribunal Federal " +
      "e a Procuradoria-Geral da República.";
    const r = validarAncoragem(texto, pacote);
    expect(r.ancorado).toBe(true);
    expect(r.naoSustentadas).toEqual([]);
  });

  it("pega a operação com nome inventado, que foi o caso real", () => {
    const texto = "A origem está na Operação Compliance Zero, que apura irregularidades no Banco Master.";
    const r = validarAncoragem(texto, pacote);
    expect(r.ancorado).toBe(false);
    expect(r.naoSustentadas.some((c) => c.valor.includes("Compliance"))).toBe(true);
  });

  it("pega número que não estava na matéria", () => {
    const texto = "A investigação apura desvio de 4,7 bilhões no Banco Master.";
    const r = validarAncoragem(texto, pacote);
    expect(r.naoSustentadas.some((c) => c.tipo === "numero")).toBe(true);
  });

  it("pega data que não estava na matéria", () => {
    const texto = "Os fatos ocorreram em 12 de agosto, segundo a apuração.";
    const r = validarAncoragem(texto, pacote);
    expect(r.naoSustentadas.some((c) => c.tipo === "data")).toBe(true);
  });

  it("não acusa tradução de nome de órgão como invenção", () => {
    const emIngles: PacoteFactual = {
      ...pacote,
      organizations: ["Department of Homeland Security"],
      texto_de_origem: "The Department of Homeland Security changed the rule for green card applicants.",
    };
    const texto = "O Department of Homeland Security alterou a regra do green card.";
    expect(validarAncoragem(texto, emIngles).ancorado).toBe(true);
  });

  it("aceita o mesmo número com outra grafia de separador", () => {
    const comNumero: PacoteFactual = {
      ...pacote,
      numbers: ["1,2 milhão de pedidos"],
      texto_de_origem: "A fila soma 1,2 milhão de pedidos.",
    };
    const r = validarAncoragem("A fila chega a 1,2 milhão de pedidos.", comNumero);
    expect(r.naoSustentadas.filter((c) => c.tipo === "numero")).toEqual([]);
  });

  it("informa quantas afirmações foram conferidas, não só o veredito", () => {
    const r = validarAncoragem("A Polícia Federal investiga o Banco Master.", pacote);
    expect(r.conferidos).toBeGreaterThan(0);
  });
});

describe("montarPacoteFactual", () => {
  it("recusa pacote sem fato nenhum em vez de deixar tudo parecer inventado", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          choices: [{ message: { content: JSON.stringify({ verified_facts: 42 }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200 }
      )
    );

    await expect(
      montarPacoteFactual(
        { titulo: "t", texto: origem, urls: [] },
        { OPENAI_API_KEY: "k" },
        fetcher as unknown as typeof fetch
      )
    ).rejects.toThrow(/nenhum fato verificado/);
  });

  it("guarda o texto de origem no pacote, que é contra o que a ancoragem confere", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verified_facts: ["A PF investiga o Banco Master."],
                  organizations: "Polícia Federal",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200 }
      )
    );

    const { pacote: p } = await montarPacoteFactual(
      { titulo: "t", texto: origem, urls: ["https://x.com/a"] },
      { OPENAI_API_KEY: "k" },
      fetcher as unknown as typeof fetch
    );

    expect(p.texto_de_origem).toBe(origem);
    expect(p.organizations).toEqual(["Polícia Federal"]);
    expect(p.source_urls).toEqual(["https://x.com/a"]);
  });
});

describe("severidade da claim", () => {
  it("paráfrase institucional não bloqueia a edição", () => {
    // "duas Casas" foi acusada como entidade inventada na edição de validação.
    // A matéria falava em Câmara e Senado: é paráfrase, não invenção.
    const soCamaraSenado: PacoteFactual = {
      ...pacote,
      organizations: ["Câmara", "Senado"],
      texto_de_origem: "O texto foi aprovado pela Câmara e pelo Senado na quarta-feira.",
    };
    const r = validarAncoragem("O texto passou pelas duas Casas do Congresso.", soCamaraSenado);
    expect(r.ancorado).toBe(true);
    expect(r.naoSustentadas.every((c) => c.severidade === "aviso")).toBe(true);
  });

  it("palavra isolada capitalizada e desconhecida é aviso", () => {
    const r = validarAncoragem("A decisão saiu em Wisconsin.", pacote);
    const achado = r.naoSustentadas.find((c) => c.valor === "Wisconsin");
    expect(achado?.severidade).toBe("aviso");
    expect(r.ancorado).toBe(true);
  });

  it("nome composto sem lastro continua bloqueando", () => {
    const r = validarAncoragem("A apuração corre na Operação Compliance Zero.", pacote);
    expect(r.ancorado).toBe(false);
    expect(r.naoSustentadas.some((c) => c.severidade === "bloqueio")).toBe(true);
  });

  it("número inventado bloqueia mesmo sozinho", () => {
    const r = validarAncoragem("O desvio soma 4,7 bilhões.", pacote);
    expect(r.ancorado).toBe(false);
  });
});

describe("início de frase", () => {
  it("não acusa a primeira palavra da frase como nome próprio", () => {
    const r = validarAncoragem(
      "A Polícia Federal investiga o caso. Brasileiros acompanham. Desde então, nada mudou.",
      pacote
    );
    const nomes = r.naoSustentadas.filter((c) => c.tipo === "nome").map((c) => c.valor);
    expect(nomes).not.toContain("Brasileiros");
    expect(nomes).not.toContain("Desde");
  });

  it("continua pegando nome próprio no meio da frase", () => {
    const r = validarAncoragem("O caso corre com a Operação Compliance Zero em andamento.", pacote);
    expect(r.ancorado).toBe(false);
  });
});

describe("número sustentado precisa de fronteira de dígito", () => {
  /**
   * A verificação de número era uma verificação de SUBSTRING de dígito.
   *
   * Encontrado na revisão adversarial do carrossel, e vale para qualquer pauta:
   * "a espera chega a 540 dias" passava quando a fonte dizia "1540 pedidos",
   * porque "540" está dentro de "1540". No conteúdo permanente é pior, porque o
   * palheiro é a página inteira de um manual oficial, cheia de número de seção,
   * de formulário e de taxa, e cada um autoriza um prazo que ninguém escreveu.
   */
  const comOrigem = (texto: string): PacoteFactual =>
    ({
      verified_facts: [],
      people: [],
      organizations: [],
      places: [],
      dates: [],
      numbers: [],
      gaps: [],
      source_urls: [],
      texto_de_origem: texto,
    }) as unknown as PacoteFactual;

  const passa = (origem: string, gerado: string) =>
    validarAncoragem(gerado, comOrigem(origem)).naoSustentadas.filter((c) => c.severidade === "bloqueio")
      .length === 0;

  it("540 não é sustentado por 1540", () => {
    expect(passa("Foram 1540 pedidos protocolados.", "A espera chega a 540 dias.")).toBe(false);
  });

  it("440 não é sustentado por 1.440", () => {
    expect(passa("The filing fee is $1,440.", "A taxa e 440 dolares.")).toBe(false);
  });

  it("o mesmo número em outra grafia continua sustentado", () => {
    expect(passa("The filing fee is $1,440.", "A taxa e 1.440 dolares.")).toBe(true);
    expect(passa("Foram 1,2 milhao de pedidos.", "Foram 1.2 milhao de pedidos.")).toBe(true);
  });

  it("o número que está na fonte continua sustentado", () => {
    expect(passa("O prazo e de 540 dias.", "A espera chega a 540 dias.")).toBe(true);
  });

  it("LIMITE CONHECIDO: número de norma citado na fonte ancora qualquer prazo", () => {
    /*
     * Isto NÃO é fronteira de dígito: em "INA 245(a)" o 245 é um número solto
     * de verdade, com parêntese depois. Separar "número da norma" de
     * "quantidade" exige entender o que a frase diz, o que uma verificação
     * determinística não faz.
     *
     * Fica travado aqui como comportamento conhecido, e não como acerto: se
     * alguém resolver isso, é este teste que muda, de propósito, para o valor
     * novo aparecer em revisão em vez de passar em silêncio.
     */
    expect(passa("See 8 CFR 245.1(c)(8) and INA 245(a).", "O processo leva 245 dias.")).toBe(true);
  });
});
