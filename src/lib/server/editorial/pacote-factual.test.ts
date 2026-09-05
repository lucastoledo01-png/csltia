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
