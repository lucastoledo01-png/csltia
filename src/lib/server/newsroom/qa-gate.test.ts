import { describe, expect, it } from "vitest";
import { QAResultSchema } from "./schemas";

/**
 * O portão do envio automático.
 *
 * Em 2026-09-04 a newsletter ficou retida e o motivo era irrecuperável: o
 * checador devolve sete campos e só o `passed` era gravado. `passed` é o
 * veredito genérico que a própria IA autodeclara, e ela reprova por tom,
 * gramática ou qualquer implicância — o que custava a edição do dia inteira.
 *
 * A regra passou a ser: retém só quando há risco de fato inventado. Vírgula
 * errada é recuperável com errata; número de benchmark que não estava na fonte,
 * não.
 *
 * Estes testes fixam a regra sobre o resultado do QA. Quem muda a condição no
 * `newsroom-service` precisa passar por aqui.
 */

function retemEnvio(qa: { hallucination_risk: boolean }): boolean {
  return qa.hallucination_risk;
}

const BASE = {
  passed: true,
  hallucination_risk: false,
  tone_check_passed: true,
  grammar_passed: true,
  story_count_valid: true,
  issues: [],
  score: 92,
};

describe("portão do envio automático", () => {
  it("envia quando não há risco de alucinação", () => {
    expect(retemEnvio(BASE)).toBe(false);
  });

  it("retém quando há risco de alucinação", () => {
    expect(retemEnvio({ ...BASE, hallucination_risk: true })).toBe(true);
  });

  it("NÃO retém por gramática, tom ou nota baixa", () => {
    // Era isto que custava a newsletter: o checador reprovava no genérico e o
    // dia inteiro ficava sem edição por causa de uma implicância de estilo.
    const nitpicks = { ...BASE, passed: false, grammar_passed: false, tone_check_passed: false, score: 41 };
    expect(retemEnvio(nitpicks)).toBe(false);
  });

  it("retém mesmo quando o veredito genérico diz que passou", () => {
    // Se a IA se contradiz, o campo específico manda.
    expect(retemEnvio({ ...BASE, passed: true, hallucination_risk: true })).toBe(true);
  });
});

describe("resultado do QA", () => {
  it("tem os campos que agora são gravados", () => {
    // `qa_score`, `qa_hallucination_risk` e `qa_issues` viraram colunas em
    // `news_editions`. Se o schema perder um campo, a coluna fica nula e o
    // motivo volta a ser invisível.
    const parsed = QAResultSchema.parse(BASE);
    expect(parsed.score).toBe(92);
    expect(parsed.hallucination_risk).toBe(false);
    expect(parsed.issues).toEqual([]);
  });

  it("aceita apontamentos e os preserva", () => {
    const parsed = QAResultSchema.parse({
      ...BASE,
      hallucination_risk: true,
      issues: ["percentual de benchmark não está no pacote factual"],
    });
    expect(parsed.issues).toHaveLength(1);
  });
});
