import { describe, expect, it } from "vitest";
import { carregarConfigEditorial } from "./config";
import { comporEdicao, edicaoViavel, pontuarPauta } from "./pontuacao";
import type { PautaOrdenavel } from "./pontuacao";
import type { Classificacao } from "./classificador";

const config = carregarConfigEditorial({});

function classificacao(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: true,
    leitura: "oportunidade",
    eixo: "imigracao",
    natureza: "official_action",
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

describe("comporEdicao", () => {
  /*
   * O acontecimento varia por pauta, e isso não é detalhe de fixture.
   *
   * Existem dois tetos diferentes aqui: um por ator e outro por acontecimento.
   * Com todas as pautas compartilhando o mesmo acontecimento, o segundo cortava
   * antes e o teste do primeiro passava a medir outra coisa.
   */
  function pauta(nome: string, relevancia: number, ator: string, dominio: string): PautaOrdenavel<string> {
    const c = classificacao({ relevancia, atores: [ator], acontecimento: [`fato-${nome}`] });
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
    expect(comporEdicao(lista, config).escolhidas).toHaveLength(config.maximoDePautas);
  });

  it("não deixa um dia movimentado do USCIS tomar a edição inteira", () => {
    const lista = [
      pauta("a", 9, "USCIS", "a.com"),
      pauta("b", 9, "USCIS", "b.com"),
      pauta("c", 9, "USCIS", "c.com"),
      pauta("d", 4, "STF", "d.com"),
    ];
    const escolhidas = comporEdicao(lista, config).escolhidas;
    const uscis = escolhidas.filter((p) => p.classificacao.atores[0] === "USCIS");
    expect(uscis).toHaveLength(2);
  });

  /**
   * Em 16/09/2026 o auditor apontou que as três primeiras histórias da edição
   * cobriam o mesmo adiamento de regra. Os dois tetos existentes não pegavam:
   * veículos diferentes passam no teto de domínio, e atores diferentes na
   * primeira posição passam no teto de ator.
   *
   * O efeito não parou na repetição. Com um fato só esticado em três matérias,
   * a redação não tem o que dizer de diferente e enfeita, e a edição caiu por
   * falta de lastro.
   */
  it("o mesmo acontecimento entra uma vez, e fica a de maior nota", () => {
    const mesmo = ["liminar", "duration of status"];
    const derivada = (nome: string, relevancia: number, ator: string, dominio: string) => {
      const c = classificacao({ relevancia, atores: [ator], acontecimento: mesmo });
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
    };

    const escolhidas = comporEdicao(
      [
        derivada("fraca", 5, "DHS", "a.com"),
        derivada("forte", 9, "DHS", "b.com"),
        derivada("media", 7, "DHS", "c.com"),
        pauta("outra", 6, "Departamento de Estado", "d.com"),
      ],
      config,
    ).escolhidas;

    const doMesmoFato = escolhidas.filter((p) => p.classificacao.acontecimento === mesmo);
    expect(doMesmoFato).toHaveLength(1);
    expect(doMesmoFato[0].item).toBe("forte");
    // A pauta de outro fato continua entrando: o corte é do repetido, não do resto.
    expect(escolhidas.map((p) => p.item)).toContain("outra");
  });

  it("pauta sem acontecimento classificado não bloqueia as outras", () => {
    // Impressão vazia não é chave: se fosse, a primeira pauta sem
    // classificação derrubaria todas as outras na mesma situação.
    const semFato = (nome: string, relevancia: number, dominio: string) => {
      const c = classificacao({ relevancia, atores: [], lugares: [], acontecimento: [] });
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
    };

    const escolhidas = comporEdicao(
      [semFato("x", 8, "a.com"), semFato("y", 7, "b.com")],
      config,
    ).escolhidas;

    expect(escolhidas).toHaveLength(2);
  });

  it("não deixa a crise do STF tomar a edição de uma publicação sobre os EUA", () => {
    function brasileira(nome: string, relevancia: number, dominio: string): PautaOrdenavel<string> {
      const c = classificacao({ relevancia, pais: "Brasil", eixo: "brasil", atores: [nome] });
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
    const escolhidas = comporEdicao(lista, config).escolhidas;
    const brasil = escolhidas.filter((p) => p.classificacao.pais === "Brasil");
    expect(brasil).toHaveLength(config.maximoDePautasBrasil);
    expect(escolhidas.some((p) => p.classificacao.pais === "EUA")).toBe(true);
  });

  /*
   * Os números destes testes são os do pool aprovado de 16/09/2026.
   *
   * Naquele dia o teto por acontecimento tinha acabado de entrar e a edição
   * saiu com três pautas sobre o mesmo adiamento de regra. A impressão do
   * acontecimento não colidiu porque quatro veículos escreveram atores e
   * termos diferentes para o mesmo fato: é isso que as fixtures reproduzem,
   * cada pauta com acontecimento PRÓPRIO e vetor parecido.
   */
  function vetorDistante(semelhanca: number): number[] {
    // Vetor unitário em duas dimensões cujo cosseno com [1, 0] é exatamente o
    // pedido. Duas dimensões bastam: a função sob teste só chama `cosseno`.
    const angulo = Math.acos(semelhanca);
    return [Math.cos(angulo), Math.sin(angulo)];
  }

  function comVetor(
    nome: string,
    relevancia: number,
    ator: string,
    dominio: string,
    vetor: number[] | null,
  ): PautaOrdenavel<string> {
    const c = classificacao({ relevancia, atores: [ator], acontecimento: [`termo-de-${nome}`] });
    return {
      item: nome,
      classificacao: c,
      dominio,
      vetor,
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

  it("agrupa o mesmo fato contado por veículos diferentes, que a impressão não pegava", () => {
    const composicao = comporEdicao(
      [
        comVetor("murthy", 9, "Court", "murthy.com", [1, 0]),
        comVetor("klasko", 8, "DHS", "klaskolaw.com", vetorDistante(0.892)),
        comVetor("ogletree", 7, "District Court", "ogletree.com", vetorDistante(0.805)),
      ],
      config,
    );

    expect(composicao.escolhidas.map((p) => p.item)).toEqual(["murthy"]);
    expect(composicao.absorvidas).toHaveLength(2);
    expect(composicao.absorvidas.every((a) => a.camada === "vetor")).toBe(true);
    // O par e o número ficam registrados: é com eles que o limiar se calibra.
    expect(composicao.absorvidas[0].representante.item).toBe("murthy");
    expect(composicao.absorvidas[0].score).toBeCloseTo(0.892, 3);
  });

  it("dois fatos distintos do mesmo dia continuam entrando", () => {
    // 0.563 foi o par mais próximo entre fatos REALMENTE distintos naquele
    // pool. Se o limiar descer até aqui, a edição perde pauta boa.
    const composicao = comporEdicao(
      [
        comVetor("liminar", 9, "Court", "a.com", [1, 0]),
        comVetor("public charge", 8, "DHS", "b.com", vetorDistante(0.563)),
      ],
      config,
    );

    expect(composicao.escolhidas).toHaveLength(2);
    expect(composicao.absorvidas).toHaveLength(0);
  });

  it("sem vetor, a composição é exatamente a de antes", () => {
    // Dia em que a API de embedding cai. A edição sai com os tetos de sempre,
    // e não sai vazia nem agrupada por engano.
    const composicao = comporEdicao(
      [
        comVetor("a", 9, "Court", "a.com", null),
        comVetor("b", 8, "DHS", "b.com", null),
      ],
      config,
    );

    expect(composicao.escolhidas).toHaveLength(2);
    expect(composicao.absorvidas).toHaveLength(0);
  });

  it("limiar zero desliga a camada sem precisar tirar os vetores", () => {
    const composicao = comporEdicao(
      [
        comVetor("a", 9, "Court", "a.com", [1, 0]),
        comVetor("b", 8, "DHS", "b.com", [1, 0]),
      ],
      { ...config, limiarDeAgrupamento: 0 },
    );

    expect(composicao.escolhidas).toHaveLength(2);
  });

  it("a impressão do acontecimento continua agrupando, e diz que foi ela", () => {
    const mesmo = ["liminar", "duration of status"];
    const doMesmoFato = (nome: string, relevancia: number, dominio: string) => {
      const c = classificacao({ relevancia, atores: ["DHS"], acontecimento: mesmo });
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
    };

    const composicao = comporEdicao(
      [doMesmoFato("forte", 9, "a.com"), doMesmoFato("fraca", 5, "b.com")],
      config,
    );

    expect(composicao.escolhidas.map((p) => p.item)).toEqual(["forte"]);
    expect(composicao.absorvidas[0].camada).toBe("impressao");
  });

  it("limita também o mesmo veículo", () => {
    const lista = [
      pauta("a", 9, "USCIS", "mesmo.com"),
      pauta("b", 9, "STF", "mesmo.com"),
      pauta("c", 9, "Casa Branca", "mesmo.com"),
    ];
    expect(comporEdicao(lista, config).escolhidas).toHaveLength(2);
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
