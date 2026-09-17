import { describe, expect, it } from "vitest";
import { paisNaoIdentificavel } from "./leitor";

/**
 * "Isso se refere ao Brasil ou aos EUA?"
 *
 * A pergunta é do dono, em 17/09/2026, lendo a capa de um post que tinha
 * acabado de sair: "QUEM GANHA MENOS QUASE NÃO PARTICIPOU DO RECORDE DE RENDA
 * FAMILIAR EM 2025". Ele completou: "não dá pra entender, parece que está
 * falando negativamente dos EUA".
 *
 * As duas observações são o mesmo defeito visto de dois ângulos. A frase serve
 * para os dois países palavra por palavra, e o leitor brasileiro assume o
 * Brasil, porque é onde ele está. Quando alguém enfim entende que é sobre os
 * Estados Unidos, o que sobra é a metade ruim do fato, porque ela abre a frase.
 *
 * A régua aqui pega a ambiguidade, que é objetiva. A ordem do fato e da
 * ressalva é instrução de prompt, porque depende do pacote factual.
 */

describe("o título diz de que país ele fala", () => {
  it("acusa a manchete real que motivou a regra", () => {
    expect(
      paisNaoIdentificavel(
        "Quem ganha menos quase não participou do recorde de renda familiar em 2025",
      ),
    ).toBe(true);
  });

  it("a correção resolve, e sem trocar o fato", () => {
    expect(
      paisNaoIdentificavel("Renda familiar nos EUA bate recorde, e o avanço se concentrou no topo"),
    ).toBe(false);
  });

  /**
   * Não é obrigatório escrever "EUA". Qualquer marca que situe o leitor serve,
   * e as manchetes boas já trazem uma sem esforço.
   */
  it("órgão, cidade, estado e figura pública situam tanto quanto o nome do país", () => {
    const situadas = [
      "Quem tem visto de estudante segue no prazo até 27 de outubro, decisão em Boston",
      "O Fed manteve os juros e sinalizou corte em dezembro",
      "A Suprema Corte não ouviu o caso, e a audiência de fiança continua valendo",
      "USCIS passa a aceitar o pedido sem taxa para quem já protocolou",
      "Aluguel na Califórnia sobe pelo quinto trimestre seguido",
      "Trump assina ordem que muda o prazo do visto de estudante",
    ];
    for (const t of situadas) expect(paisNaoIdentificavel(t), t).toBe(false);
  });

  /**
   * O Brasil situa igual, e é por isso que a régua não se chama "falta EUA".
   * O defeito é a ambiguidade, não a ausência de um país específico: a
   * publicação compara os dois, e uma pauta brasileira identificada está certa.
   */
  it("o Brasil situa o leitor tanto quanto os Estados Unidos", () => {
    const brasileiras = [
      "Brasil mantém o maior juro real entre 40 economias",
      "O Supremo derrubou a regra e o prazo volta a valer",
      "A Selic fica em 13,75% e o crédito segue caro",
    ];
    for (const t of brasileiras) expect(paisNaoIdentificavel(t), t).toBe(false);
  });

  it("acusa a manchete genérica de órgão, que não situa nada", () => {
    const ambiguas = [
      "Corte adia regra de prazo fixo",
      "Nova regra muda o cálculo do benefício a partir de janeiro",
      "Inflação desacelera pelo terceiro mês seguido",
    ];
    for (const t of ambiguas) expect(paisNaoIdentificavel(t), t).toBe(true);
  });

  /**
   * Fronteira de palavra, pela mesma razão que derrubou o banco conceitual:
   * "fed" não pode casar dentro de "federal" nem "eua" dentro de outra palavra,
   * senão a régua aprova por acidente e para de acusar qualquer coisa.
   */
  it("não aceita marca que está no meio de outra palavra", () => {
    expect(paisNaoIdentificavel("A regra federal muda o cálculo do benefício")).toBe(true);
  });
});
