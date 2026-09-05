import { describe, expect, it } from "vitest";
import { consultaConceitual, pedeGente } from "./conceitual";

describe("consultaConceitual", () => {
  it("nenhum tema escolhe pessoa", () => {
    const titulos = [
      "USCIS amplia prazo do green card",
      "Novo visto de trabalho H-1B",
      "Juíza decide sobre liminar",
      "Dólar sobe e Ibovespa recua",
      "Emprego americano cresce em agosto",
      "Fila do green card chega a 1 milhão",
      "Fábrica anuncia expansão no Texas",
      "Brasileiros nos EUA enfrentam fila no consulado",
      "Assunto sem tema mapeado nenhum",
    ];
    for (const t of titulos) {
      const consulta = consultaConceitual(t);
      expect(pedeGente(consulta), `"${t}" gerou "${consulta}"`).toBe(false);
    }
  });

  it("não carrega nacionalidade em consulta de pessoa, porque não há consulta de pessoa", () => {
    expect(consultaConceitual("Visto de trabalho para profissionais")).not.toMatch(/american|brazilian/i);
  });

  it("aplica contexto geográfico só em cena, nunca em gente", () => {
    const brasil = consultaConceitual("Reforma tributária avança", "", "Brasil");
    expect(brasil).toContain("brazil");
    expect(pedeGente(brasil)).toBe(false);

    const eua = consultaConceitual("Emprego americano cresce", "", "EUA");
    // Tema de emprego é canteiro de obras: cena, e recebe o contexto.
    expect(pedeGente(eua)).toBe(false);
  });

  it("sem tema conhecido, devolve lugar e não gente", () => {
    const c = consultaConceitual("Assunto completamente novo");
    expect(c).toBe("city skyline architecture daylight");
    expect(pedeGente(c)).toBe(false);
  });
});
