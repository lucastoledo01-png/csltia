import { describe, expect, it } from "vitest";
import { editoriaDaPauta, EDITORIAS } from "./editorias";

/**
 * O agrupamento existe porque o rótulo da redação não agrupa.
 *
 * Em 23 pautas publicadas apareceram 19 categorias distintas. O rótulo é bom
 * para a matéria e inútil para a seção, e é essa distinção que o mapa faz.
 */
describe("editoria da pauta", () => {
  it("o mais específico vence o mais geral", () => {
    // "profissional" também aparece em Trabalho, e não pode roubar esta.
    expect(editoriaDaPauta("Green card profissional")).toBe("green-card");
  });

  it.each([
    ["Boletim de vistos", "vistos"],
    ["Vistos profissionais", "vistos"],
    ["Vistos e família", "vistos"],
    ["Trabalho nos EUA", "trabalho"],
    ["Fiscalização do ICE", "fiscalizacao"],
    ["Responsabilidade no ICE", "fiscalizacao"],
    ["Detenção e Saúde", "fiscalizacao"],
    ["Brasil e câmbio", "brasil"],
    ["Brasil", "brasil"],
    ["USCIS", "vistos"],
    ["Governo dos EUA", "governo"],
  ])("%s cai em %s", (rotulo, esperada) => {
    expect(editoriaDaPauta(rotulo)).toBe(esperada);
  });

  it("rótulo desconhecido não fica sem editoria", () => {
    // Sobras da vertical anterior ainda existem no banco.
    expect(EDITORIAS.map((e) => e.id)).toContain(editoriaDaPauta("Produtividade"));
  });

  it("o título ajuda quando o rótulo é vago", () => {
    expect(editoriaDaPauta("Análise", "O que muda no H1B em 2026")).toBe("vistos");
  });
});
