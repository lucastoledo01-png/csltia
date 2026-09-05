import { describe, expect, it } from "vitest";
import { gerarStoryId, vetoresDoHistorico } from "./history";
import type { RegistroHistorico } from "./history";

describe("gerarStoryId", () => {
  it("dá a mesma identidade para a mesma matéria com rastreio diferente", () => {
    const a = gerarStoryId({ url: "https://uscis.gov/noticia?utm_source=rss&utm_medium=feed" });
    const b = gerarStoryId({ url: "https://www.uscis.gov/noticia/" });
    expect(a).toBe(b);
  });

  it("cai nas entidades quando não há URL", () => {
    const id = gerarStoryId({
      entidades: { atores: ["uscis"], lugares: ["eua"], acontecimento: ["prorrogacao"] },
    });
    expect(id.startsWith("e_")).toBe(true);
  });

  it("cai no título quando não há URL nem entidades", () => {
    const id = gerarStoryId({ titulo: "USCIS amplia prazo" });
    expect(id.startsWith("t_")).toBe(true);
  });

  it("recusa entrada sem nada identificável em vez de gerar id de string vazia", () => {
    expect(() => gerarStoryId({})).toThrow();
  });

  it("prefixo separa identidade vinda de URL da vinda de título", () => {
    const porUrl = gerarStoryId({ url: "https://exemplo.com/a", titulo: "x" });
    const porTitulo = gerarStoryId({ titulo: "x" });
    expect(porUrl.startsWith("u_")).toBe(true);
    expect(porTitulo.startsWith("t_")).toBe(true);
  });
});

describe("vetoresDoHistorico", () => {
  it("descarta registro sem vetor para não comparar com lista vazia", () => {
    const registros: RegistroHistorico[] = [
      { projectId: "p", storyId: "a", canal: "newsletter", titulo: "com", vetor: [1, 0] },
      { projectId: "p", storyId: "b", canal: "newsletter", titulo: "sem", vetor: null },
      { projectId: "p", storyId: "c", canal: "newsletter", titulo: "vazio", vetor: [] },
    ];
    const saida = vetoresDoHistorico(registros);
    expect(saida).toHaveLength(1);
    expect(saida[0].registro.storyId).toBe("a");
  });
});
