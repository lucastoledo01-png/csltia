import { describe, expect, it } from "vitest";
import { dolarEmPortugues } from "./dolar-em-portugues";
import { limparVicios } from "../newsroom/anti-vicios";
import { formatarNumerosDoTexto } from "../newsroom/numeros-editoriais";
import { validarAncoragem } from "./pacote-factual";
import type { PacoteFactual } from "./pacote-factual";

describe("dólar em português", () => {
  it("o caso da amostra do FDIC: $250,000 vira US$ 250.000", () => {
    expect(dolarEmPortugues("Quem guarda dinheiro em banco segurado nos EUA tem cobertura de até $250,000")).toBe(
      "Quem guarda dinheiro em banco segurado nos EUA tem cobertura de até US$ 250.000",
    );
  });

  it.each([
    ["$250,000", "US$ 250.000"],
    ["$1,234.56", "US$ 1.234,56"],
    ["$19.99", "US$ 19,99"],
    ["$0.99", "US$ 0,99"],
    ["$5", "US$ 5"],
    ["$1,000,000", "US$ 1.000.000"],
    ["US$250,000", "US$ 250.000"],
    ["US $250,000", "US$ 250.000"],
    ["U$ 3,000", "US$ 3.000"],
    ["USD 3,000", "US$ 3.000"],
    ["USD3,000", "US$ 3.000"],
    ["3,000 USD", "US$ 3.000"],
    ["$1.5 million", "US$ 1,5 milhão"],
    ["$1 billion", "US$ 1 bilhão"],
    ["$2 trillion", "US$ 2 trilhões"],
    ["$36 trillion", "US$ 36 trilhões"],
    ["$2.5 billion", "US$ 2,5 bilhões"],
    ["$250K", "US$ 250 mil"],
    ["$5M", "US$ 5 milhões"],
    ["$3 bi", "US$ 3 bilhões"],
    ["$250 mil", "US$ 250 mil"],
    ["$7.25 por hora", "US$ 7,25 por hora"],
  ])("%s vira %s", (antes, depois) => {
    expect(dolarEmPortugues(antes)).toBe(depois);
  });

  it.each([
    "US$ 250.000",
    "US$ 1,5 milhão",
    "US$ 19,99",
    "US$ 2.500,50",
    "US$ 200 bilhões",
  ])("o que já está certo fica igual: %s", (certo) => {
    expect(dolarEmPortugues(certo)).toBe(certo);
    expect(dolarEmPortugues(dolarEmPortugues(certo))).toBe(certo);
  });

  /*
   * A vírgula com um grupo só de três dígitos é o único caso ambíguo. Depois de
   * "US$" o texto já está em português, e cotação de três casas fica decimal;
   * cifrão solto e "USD" são grafia americana.
   */
  it("vírgula ambígua: o prefixo decide", () => {
    expect(dolarEmPortugues("o euro vale US$ 1,169")).toBe("o euro vale US$ 1,169");
    expect(dolarEmPortugues("o euro vale $1,169")).toBe("o euro vale US$ 1.169");
    expect(dolarEmPortugues("USD 1,239")).toBe("US$ 1.239");
    expect(dolarEmPortugues("US$ 12,500")).toBe("US$ 12.500");
  });

  it("não quebra o real nem outra moeda com cifrão", () => {
    for (const t of ["R$ 1.234,56", "R$1.500", "A$ 300", "C$20", "HK$ 1,000", "AUS$ 50"]) {
      expect(dolarEmPortugues(t)).toBe(t);
    }
  });

  it("não toca em número que não é dinheiro", () => {
    const texto = "Foram 250,000 pedidos em 2026, 3,5% do total, no formulário I-765, seção 245(a), por 90 dias.";
    expect(dolarEmPortugues(texto)).toBe(texto);
  });

  it("não toca no endereço de uma página", () => {
    const texto = "Fonte: https://example.gov/pagina?valor=$250,000 e o teto é $250,000.";
    expect(dolarEmPortugues(texto)).toBe("Fonte: https://example.gov/pagina?valor=$250,000 e o teto é US$ 250.000.");
  });

  it("pontuação no fim da frase não entra no número", () => {
    expect(dolarEmPortugues("O teto é $250,000. Depois, $5, e $1.5 million, ok?")).toBe(
      "O teto é US$ 250.000. Depois, US$ 5, e US$ 1,5 milhão, ok?",
    );
  });

  it("letra solta com espaço não vira escala", () => {
    expect(dolarEmPortugues("um negócio de $5 M&A")).toBe("um negócio de US$ 5 M&A");
  });

  it("vários valores na mesma frase", () => {
    expect(dolarEmPortugues("Entre $1,000 e USD 2,500.50, ou R$ 5.000,00.")).toBe(
      "Entre US$ 1.000 e US$ 2.500,50, ou R$ 5.000,00.",
    );
  });
});

describe("onde a regra roda", () => {
  it("limparVicios aplica em toda string da copy gerada", () => {
    const copy = limparVicios({
      headline: "Cobertura de até $250,000 por depositante nos EUA",
      slides: [{ titulo: "Teto", corpo: "O FDIC cobre $250,000 por banco." }],
      hashtags: ["#FDIC"],
    });
    expect(copy.headline).toBe("Cobertura de até US$ 250.000 por depositante nos EUA");
    expect(copy.slides[0].corpo).toBe("O FDIC cobre US$ 250.000 por banco.");
  });

  /*
   * A formatação da newsletter lia "$250,000" como número brasileiro, 250 com
   * três casas, e devolvia "$ 250". A regra do dólar roda antes dela.
   */
  it("a formatação de números da newsletter não encolhe o valor americano", () => {
    expect(formatarNumerosDoTexto("O teto é $250,000 por conta.")).toBe("O teto é US$ 250.000 por conta.");
    expect(formatarNumerosDoTexto("Dólar fecha a R$ 5,0857")).toBe("Dólar fecha a R$ 5,09");
  });
});

describe("a ancoragem continua reconhecendo o valor da fonte", () => {
  const pacote = (texto: string): PacoteFactual =>
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

  it.each([
    ["The standard insurance amount is $250,000 per depositor.", "Quem tem conta tem cobertura de até $250,000."],
    ["The company raised $1.5 million in its first round.", "A empresa levantou $1.5 million na primeira rodada."],
    ["Fees of USD 3,000 apply.", "A taxa é de USD 3,000."],
  ])("fonte %j, texto %j", (fonte, gerado) => {
    const normalizado = dolarEmPortugues(gerado);
    expect(normalizado).not.toBe(gerado);
    const r = validarAncoragem(normalizado, pacote(fonte));
    expect(r.naoSustentadas.filter((c) => c.tipo === "numero")).toEqual([]);
  });

  it("e um valor que a fonte não tem continua sem lastro", () => {
    const r = validarAncoragem(dolarEmPortugues("Cobertura de até $500,000."), pacote("Coverage is $250,000."));
    expect(r.naoSustentadas.some((c) => c.tipo === "numero")).toBe(true);
  });
});
