import { describe, expect, it } from "vitest";
import { veioDeDentroDoSite } from "./BotaoVoltar";

describe("botão de voltar", () => {
  it("volta pelo histórico quando houve página do site antes", () => {
    expect(veioDeDentroDoSite(["/", "/artigos/a"], "/artigos/a")).toBe(true);
    expect(veioDeDentroDoSite(["/", "/artigos/a", "/artigos/b"], "/artigos/b")).toBe(true);
  });
  it("vai para a home quando a matéria foi a primeira página da aba", () => {
    expect(veioDeDentroDoSite(["/artigos/a"], "/artigos/a")).toBe(false);
    expect(veioDeDentroDoSite([], "/artigos/a")).toBe(false);
  });
});
