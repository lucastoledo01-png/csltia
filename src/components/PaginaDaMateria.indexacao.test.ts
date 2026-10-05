import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A fileira "Assuntos" da página lê PELO VALIDADOR (06/10/2026). Ler as tags
 * cruas mostraria "água" e "energia" das matérias gravadas antes da regra.
 * O componente é TSX de servidor e não é renderizado nos testes, então a
 * trava é sobre o código: se alguém voltar a chamar `indexacaoDasTags`
 * aqui, este teste quebra.
 */
describe("PaginaDaMateria: assuntos só pelo validador", () => {
  const fonte = fs.readFileSync(path.join(__dirname, "PaginaDaMateria.tsx"), "utf-8");

  it("usa indexacaoValidadaDoArtigo para a fileira", () => {
    expect(fonte).toMatch(/topics=\{indexacaoValidadaDoArtigo\(article\)\.assuntos\}/);
  });

  it("não lê as tags cruas", () => {
    expect(fonte).not.toMatch(/indexacaoDasTags/);
  });
});
