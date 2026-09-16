import { describe, expect, it } from "vitest";
import { buscasDoDia, fonteDeBusca } from "./busca-dinamica";

describe("a fonte de busca", () => {
  it("monta a URL do Google News com a consulta escapada", () => {
    const f = fonteDeBusca("Black Friday deals", "en", "calendario", "us-black-friday-2026");

    expect(f.url).toContain("news.google.com/rss/search");
    expect(f.url).toContain("Black%20Friday%20deals");
    // O coletor corta em 24h o que vem do Google News: o operador faz o
    // próprio Google devolver só o que sobreviveria à janela.
    expect(f.url).toContain("when%3A1d");
    expect(f.url).toContain("hl=en-US");
    expect(f.type).toBe("rss");
  });

  /**
   * Prioridade 2 não é detalhe de configuração.
   *
   * A pontuação dá 14 pontos de credibilidade à fonte de prioridade 1 e 9 à de
   * prioridade 2. Uma pauta que chegou por busca num agregador não pode entrar
   * na edição com o mesmo peso de um comunicado do Federal Reserve.
   */
  it("sempre entra como prioridade 2", () => {
    expect(fonteDeBusca("qualquer coisa", "en", "tendencia", "x").priority).toBe(2);
    expect(fonteDeBusca("qualquer coisa", "pt", "calendario", "y").priority).toBe(2);
  });

  it("busca data brasileira em português e o resto em inglês", () => {
    expect(fonteDeBusca("imposto de renda", "pt", "calendario", "br").url).toContain("hl=pt-BR");
    expect(fonteDeBusca("jobs report", "en", "calendario", "us").url).toContain("hl=en-US");
  });
});

describe("as buscas do dia", () => {
  it("tira do calendário as datas de maior peso, respeitando o teto", () => {
    // 20/11/2026: Black Friday e Thanksgiving no radar.
    const r = buscasDoDia({ hoje: "2026-11-20" });

    expect(r.fontes.length).toBeLessThanOrEqual(3);
    expect(r.doCalendario.every((d) => d.pesoParaOBrasileiro >= 2)).toBe(true);
    expect(r.doCalendario.map((d) => d.id)).toContain("us-black-friday-2026");
  });

  it("junta tendência e calendário na mesma saída", () => {
    const r = buscasDoDia({
      hoje: "2026-11-20",
      tendencias: [
        { termo: "layoffs", eixo: "trabalho", consulta: "tech layoffs wave", motivo: "emprego" },
        { termo: "gas prices", eixo: "custo_de_vida", consulta: "gas prices rise", motivo: "bolso" },
      ],
    });

    expect(r.deTendencia).toHaveLength(2);
    expect(r.fontes.some((f) => f.id.startsWith("busca-tendencia-"))).toBe(true);
    expect(r.fontes.some((f) => f.id.startsWith("busca-calendario-"))).toBe(true);
  });

  it("dia sem nada no radar e sem tendência não cria busca nenhuma", () => {
    // 5 de janeiro de 2027: nenhuma data com antecedência aberta.
    expect(buscasDoDia({ hoje: "2027-01-05" }).fontes).toEqual([]);
  });

  it("o teto é respeitado nas duas pontas", () => {
    const muitas = Array.from({ length: 10 }, (_, i) => ({
      termo: `termo ${i}`,
      eixo: "economia",
      consulta: `consulta ${i}`,
      motivo: "teste",
    }));

    const r = buscasDoDia({
      hoje: "2026-11-20",
      tendencias: muitas,
      limites: { doCalendario: 2, deTendencia: 2 },
    });

    expect(r.fontes).toHaveLength(4);
  });

  it("id de fonte é estável e sem acento, para não depender do texto", () => {
    const r = buscasDoDia({
      hoje: "2026-11-20",
      tendencias: [{ termo: "inflação e juros", eixo: "economia", consulta: "inflation", motivo: "x" }],
      limites: { doCalendario: 0, deTendencia: 1 },
    });

    expect(r.fontes[0].id).toBe("busca-tendencia-inflacao-e-juros");
  });
});
