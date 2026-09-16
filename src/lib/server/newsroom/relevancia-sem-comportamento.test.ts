import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A instrução não pode pedir o que o auditor vai reprovar.
 *
 * Em 16/09/2026 a edição foi barrada com QA 98 e risco de alucinação NÃO, por
 * quatro conclusões. As quatro eram a mesma frase reescrita pelo laço de
 * reparo, e a objeção do auditor era sempre a mesma forma:
 *
 *   "Estudantes e visitantes de intercâmbio afetados ACOMPANHAM o adiamento"
 *   -> o pacote identifica os grupos e o adiamento, mas não informa que eles
 *      acompanham o adiamento.
 *
 * O auditor estava certo. Nenhuma fonte oficial afirma o que as pessoas estão
 * acompanhando: ela fala de regra, prazo e decisão. Quem estava errado era a
 * instrução, que pedia "o que a pessoa precisa fazer ou observar" e assim
 * fabricava, todo dia, a frase que a régua recusa.
 *
 * O reparo não salvava: ele reescrevia mantendo o verbo, porque o verbo era o
 * que a instrução pedia. Quatro tentativas, quatro recusas, dia perdido.
 *
 * Este teste guarda o contrato entre os dois lados. Não afrouxa a régua: fixa
 * que quem escreve não pode ser instruído a afirmar comportamento.
 */

const PROMPT = readFileSync("src/lib/server/newsroom/pipeline.ts", "utf8");

describe("a instrução de relevância não pede comportamento", () => {
  it("proíbe afirmar o que as pessoas fazem, acompanham ou devem observar", () => {
    // A proibição precisa estar escrita, e com os verbos que apareceram no
    // bloqueio real: foram eles que o modelo escolheu quatro vezes seguidas.
    for (const verbo of ["acompanham", "observam", "esperam"]) {
      expect(PROMPT).toContain(verbo);
    }
    expect(PROMPT).toMatch(/NUNCA afirme o que elas fazem/);
  });

  it("não pede mais o que a pessoa precisa observar", () => {
    // Era esta a frase que fabricava o problema.
    expect(PROMPT).not.toContain("o que a pessoa precisa fazer ou observar.");
  });

  it("oferece a forma que passa, e não só a que falha", () => {
    // Proibir sem mostrar o caminho deixa o modelo sem saída: ele precisa
    // dizer para quem a notícia importa, e agora tem como.
    expect(PROMPT).toMatch(/efeito da regra|EFEITO da regra/i);
    expect(PROMPT).toContain("se você está com F-1");
  });
});
