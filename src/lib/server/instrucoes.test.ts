import { describe, expect, it } from "vitest";
import { instrucaoDaEtapa } from "./instrucoes";

describe("instrucaoDaEtapa", () => {
  it("sem instrução gravada, devolve o padrão do código, byte a byte", async () => {
    const padrao = "Escreva como e-mail.\nSem travessão.";
    await expect(instrucaoDaEtapa("00000000-0000-4000-8000-000000000001", "redacao_newsletter", padrao)).resolves.toBe(
      padrao,
    );
  });
});
