import { describe, expect, it } from "vitest";
import { carregarConfigEditorial } from "./config";
import { edicaoViavel, ordenarESelecionar, pontuarPauta } from "./pontuacao";
import type { PautaOrdenavel } from "./pontuacao";
import type { Classificacao } from "./classificador";

const config = carregarConfigEditorial({});

function classificacao(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: true,
    leitura: "oportunidade",
    eixo: "processo",
    relevancia: 5,
    atores: ["USCIS"],
    lugares: ["EUA"],
    acontecimento: ["prorrogação"],
    justificativa: "",
    ...over,
  };
}

const agora = new Date().toISOString();

describe("pontuarPauta", () => {
  it("separa pautas que o ranker antigo empataria em zero", () => {
    const alta = pontuarPauta({
      classificacao: classificacao({ relevancia: 9 }),
      prioridadeDaFonte: 1,
      quantasFontesConfirmam: 2,
      publicadoEm: agora,
      semelhancaComHistorico: 0,
      temCorpoFactual: true,
    });
    const baixa = pontuarPauta({
      classificacao: classificacao({ relevancia: 2 }),
      prioridadeDaFonte: 2,
      quantasFontesConfirmam: 0,
      publicadoEm: agora,
      semelhancaComHistorico: 0,
      temCorpoFactual: true,
    });
    expect(alta.total).toBeGreaterThan(baixa.total);
  });

  it("penaliza pauta parecida com o que já saiu, sem descartá-la", () => {
    const base = {
      classificacao: classificacao({ relevancia: 8 }),
      prioridadeDaFonte: 1 as const,
      quantasFontesConfirmam: 1,
      publicadoEm: agora,
      temCorpoFactual: true,
    };
    const inedita = pontuarPauta({ ...base, semelhancaComHistorico: 0 });
    const parecida = pontuarPauta({ ...base, semelhancaComHistorico: 0.75 });
    expect(parecida.total).toBeLessThan(inedita.total);
    expect(parecida.total).toBeGreaterThan(0);
  });

  it("derruba o frescor de notícia velha", () => {
    const velha = pontuarPauta({
      classificacao: classificacao(),
      prioridadeDaFonte: 1,
      quantasFontesConfirmam: 1,
      publicadoEm: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString(),
      semelhancaComHistorico: 0,
      temCorpoFactual: true,
    });
    expect(velha.partes.frescor).toBe(0);
  });

  it("nota máxima não passa de 100", () => {
    const p = pontuarPauta({
      classificacao: classificacao({ relevancia: 10 }),
      prioridadeDaFonte: 1,
      quantasFontesConfirmam: 5,
      publicadoEm: agora,
      semelhancaComHistorico: 0,
      temCorpoFactual: true,
    });
    expect(p.total).toBeLessThanOrEqual(100);
  });
});

describe("ordenarESelecionar", () => {
  function pauta(nome: string, relevancia: number, ator: string, dominio: string): PautaOrdenavel<string> {
    const c = classificacao({ relevancia, atores: [ator] });
    return {
      item: nome,
      classificacao: c,
      dominio,
      pontuacao: pontuarPauta({
        classificacao: c,
        prioridadeDaFonte: 1,
        quantasFontesConfirmam: 1,
        publicadoEm: agora,
        semelhancaComHistorico: 0,
      temCorpoFactual: true,
      }),
    };
  }

  it("respeita o teto de pautas da edição", () => {
    const lista = [
      pauta("a", 9, "USCIS", "a.com"),
      pauta("b", 8, "STF", "b.com"),
      pauta("c", 7, "Casa Branca", "c.com"),
      pauta("d", 6, "Congresso", "d.com"),
      pauta("e", 5, "Suprema Corte", "e.com"),
    ];
    expect(ordenarESelecionar(lista, config)).toHaveLength(config.maximoDePautas);
  });

  it("não deixa um dia movimentado do USCIS tomar a edição inteira", () => {
    const lista = [
      pauta("a", 9, "USCIS", "a.com"),
      pauta("b", 9, "USCIS", "b.com"),
      pauta("c", 9, "USCIS", "c.com"),
      pauta("d", 4, "STF", "d.com"),
    ];
    const escolhidas = ordenarESelecionar(lista, config);
    const uscis = escolhidas.filter((p) => p.classificacao.atores[0] === "USCIS");
    expect(uscis).toHaveLength(2);
  });

  it("não deixa a crise do STF tomar a edição de uma publicação sobre os EUA", () => {
    function brasileira(nome: string, relevancia: number, dominio: string): PautaOrdenavel<string> {
      const c = classificacao({ relevancia, pais: "Brasil", eixo: "deterioracao_brasil", atores: [nome] });
      return {
        item: nome,
        classificacao: c,
        dominio,
        pontuacao: pontuarPauta({
          classificacao: c,
          prioridadeDaFonte: 1,
          quantasFontesConfirmam: 1,
          publicadoEm: agora,
          semelhancaComHistorico: 0,
      temCorpoFactual: true,
        }),
      };
    }

    const lista = [
      brasileira("STF", 9, "g1.com"),
      brasileira("Fachin", 9, "estadao.com"),
      brasileira("Moraes", 8, "folha.com"),
      pauta("eua", 5, "USCIS", "uscis.gov"),
    ];
    const escolhidas = ordenarESelecionar(lista, config);
    const brasil = escolhidas.filter((p) => p.classificacao.pais === "Brasil");
    expect(brasil).toHaveLength(config.maximoDePautasBrasil);
    expect(escolhidas.some((p) => p.classificacao.pais === "EUA")).toBe(true);
  });

  it("limita também o mesmo veículo", () => {
    const lista = [
      pauta("a", 9, "USCIS", "mesmo.com"),
      pauta("b", 9, "STF", "mesmo.com"),
      pauta("c", 9, "Casa Branca", "mesmo.com"),
    ];
    expect(ordenarESelecionar(lista, config)).toHaveLength(2);
  });
});

describe("pauta que chegou só com a manchete", () => {
  it("perde para a que veio com texto, sem ser vetada", () => {
    const base = {
      classificacao: classificacao({ relevancia: 7 }),
      prioridadeDaFonte: 1 as const,
      quantasFontesConfirmam: 1,
      publicadoEm: agora,
      semelhancaComHistorico: 0,
    };
    const comTexto = pontuarPauta({ ...base, temCorpoFactual: true });
    const soManchete = pontuarPauta({ ...base, temCorpoFactual: false });

    expect(soManchete.total).toBeLessThan(comTexto.total);
    expect(soManchete.total).toBeGreaterThan(0);
    expect(soManchete.explicacao).toContain("só manchete");
  });
});

describe("edicaoViavel", () => {
  it("aceita edição menor em vez de derrubar o dia", () => {
    expect(edicaoViavel(2, config).viavel).toBe(true);
  });

  it("recusa com uma pauta só", () => {
    expect(edicaoViavel(1, config).viavel).toBe(false);
  });
});
