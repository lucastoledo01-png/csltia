import { describe, expect, it } from "vitest";
import { codigoDoMotivo, contarPorCodigo, limitesDoDia, recusasDoDiagnostico } from "./painel-logs";
import { inicioDaSemana, montarSemana } from "./painel-calendario";
import { diffDeLinhas } from "../diff-de-linhas";

/*
 * O painel de logs, o calendário e o diff. Puros, porque o que eles fazem de
 * errado não dá erro: dá uma tela plausível com o dia errado.
 */

describe("motivos com código", () => {
  it("lê o código antes dos dois-pontos", () => {
    expect(codigoDoMotivo("REJECT_US_NEGATIVE: a verificação leu o fato como desfavorável")).toBe("REJECT_US_NEGATIVE");
    expect(codigoDoMotivo("REJECT_LOW_RELEVANCE")).toBe("REJECT_LOW_RELEVANCE");
    expect(codigoDoMotivo("RUN_FAILED: Edição bloqueada")).toBe("RUN_FAILED");
  });

  it("NÃO inventa código para texto que não tem, e não o esconde", () => {
    expect(codigoDoMotivo("descartada sem reparo: SOCIAL_REJECT_UNVERIFIED")).toBe("SEM_CODIGO");
    expect(codigoDoMotivo(null)).toBe("SEM_CODIGO");
    expect(codigoDoMotivo("")).toBe("SEM_CODIGO");
  });

  it("conta por código, do mais frequente ao menos", () => {
    expect(contarPorCodigo(["REJECT_A", "REJECT_B: x", "REJECT_A: y", null])).toEqual([
      { codigo: "REJECT_A", total: 2 },
      { codigo: "REJECT_B", total: 1 },
      { codigo: "SEM_CODIGO", total: 1 },
    ]);
  });

  it("o diagnóstico do social vira recusas com etapa", () => {
    const recusas = recusasDoDiagnostico({
      recusadas: [{ motivo: "REJECT_US_NEGATIVE: x", titulo: "A" }],
      emConflito: [{ motivo: "EDITORIAL_CLASSIFICATION_CONFLICT: y", titulo: "B" }],
      descartados: [{ etapa: "composicao", motivo: "EIXO_OVERLOAD: eixo politica já tem 3", titulo: "C" }],
    });
    expect(recusas.map((r) => [r.etapa, r.codigo])).toEqual([
      ["verificacao", "REJECT_US_NEGATIVE"],
      ["conflito", "EDITORIAL_CLASSIFICATION_CONFLICT"],
      ["composicao", "EIXO_OVERLOAD"],
    ]);
  });

  it("payload estranho não quebra a tela", () => {
    expect(recusasDoDiagnostico(null)).toEqual([]);
    expect(recusasDoDiagnostico({ recusadas: "x" })).toEqual([]);
  });
});

describe("o dia do projeto, e não o dia UTC", () => {
  it("05/10 em Brasília vai de 03:00 UTC a 03:00 UTC do dia seguinte", () => {
    expect(limitesDoDia("2026-10-05", "America/Sao_Paulo")).toEqual({
      deIso: "2026-10-05T03:00:00.000Z",
      ateIso: "2026-10-06T03:00:00.000Z",
    });
  });
});

describe("o calendário da semana", () => {
  const projeto = { timezone: "America/Sao_Paulo", settings: {} };

  it("a semana começa na segunda, inclusive a partir do domingo", () => {
    expect(inicioDaSemana("2026-10-07")).toBe("2026-10-05");
    expect(inicioDaSemana("2026-10-11")).toBe("2026-10-05");
    expect(inicioDaSemana("2026-10-05")).toBe("2026-10-05");
  });

  it("o planejado é a cadência do projeto, dia a dia", () => {
    const semana = montarSemana(projeto, "2026-10-05", { edicoes: [], artigos: [], posts: [] });
    expect(semana).toHaveLength(7);
    expect(semana[0].planejado).toEqual({ newsletter: [], portal: [], instagram: [] });
    expect(semana[1].planejado.portal).toEqual(["06:07", "12:00", "18:00"]);
    expect(semana[1].planejado.instagram).toHaveLength(5);
  });

  it("o post entra no dia LOCAL em que vai ao ar, não no dia UTC", () => {
    // 23:30 de terça em Brasília é 02:30 de quarta em UTC.
    const semana = montarSemana(projeto, "2026-10-05", {
      edicoes: [],
      artigos: [],
      posts: [
        {
          id: "p1",
          title: "Post da noite",
          status: "scheduled",
          scheduled_at: "2026-10-07T02:30:00Z",
          published_at: null,
          edition_date: "2026-10-06",
        },
      ],
    });
    expect(semana[1].itens.map((i) => [i.titulo, i.hora])).toEqual([["Post da noite", "23:30"]]);
    expect(semana[2].itens).toEqual([]);
  });

  it("as datas do calendário editorial aparecem no dia", () => {
    // Segunda, 12/10/2026: Columbus Day nos EUA e Nossa Senhora Aparecida aqui.
    const semana = montarSemana(projeto, "2026-10-12", { edicoes: [], artigos: [], posts: [] });
    const nomes = semana[0].datas.map((d) => d.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Columbus Day", "Nossa Senhora Aparecida"]));
  });
});

describe("o diff de versões", () => {
  it("mostra o que saiu e o que entrou, e o resto igual", () => {
    expect(diffDeLinhas("a\nb\nc", "a\nB\nc")).toEqual([
      { tipo: "igual", texto: "a" },
      { tipo: "saiu", texto: "b" },
      { tipo: "entrou", texto: "B" },
      { tipo: "igual", texto: "c" },
    ]);
  });

  it("versões iguais não têm diferença", () => {
    expect(diffDeLinhas("x\ny", "x\ny").every((l) => l.tipo === "igual")).toBe(true);
  });
});
