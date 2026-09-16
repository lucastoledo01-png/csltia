import { describe, expect, it } from "vitest";
import {
  agenda,
  agendaEmTexto,
  datasDoAno,
  diasEntre,
  enesimoDiaDaSemana,
  pascoa,
  saidaDoRelatorioDeEmprego,
  somarDias,
  termosDaAgenda,
  ultimoDiaDaSemana,
} from "./calendario";

/**
 * Um calendário errado é pior do que calendário nenhum: ele faz a redação
 * anunciar a data errada com confiança. Por isso cada regra é conferida contra
 * uma data conhecida de um ano que ainda não aconteceu, que é o uso real.
 */
describe("as regras que valem para qualquer ano", () => {
  it("acha a enésima ocorrência de um dia da semana", () => {
    // Thanksgiving de 2026: quarta quinta de novembro.
    expect(enesimoDiaDaSemana(2026, 11, 4, 4)).toBe("2026-11-26");
    // Terceira segunda de janeiro de 2027, o dia de Martin Luther King.
    expect(enesimoDiaDaSemana(2027, 1, 1, 3)).toBe("2027-01-18");
    // Primeira segunda de setembro de 2026, o Labor Day.
    expect(enesimoDiaDaSemana(2026, 9, 1, 1)).toBe("2026-09-07");
  });

  it("acha a última ocorrência do mês", () => {
    // Memorial Day de 2027 é a última segunda de maio.
    expect(ultimoDiaDaSemana(2027, 5, 1)).toBe("2027-05-31");
    expect(ultimoDiaDaSemana(2026, 5, 1)).toBe("2026-05-25");
  });

  it("calcula a Páscoa, de onde saem três feriados brasileiros", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(pascoa(2028)).toBe("2028-04-16");
    expect(pascoa(2030)).toBe("2030-04-21");
  });

  it("soma dias sem escorregar no fuso", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(diasEntre("2026-09-16", "2026-11-26")).toBe(71);
  });
});

describe("as datas de um ano", () => {
  it("põe a Black Friday no dia seguinte ao Thanksgiving", () => {
    const d = datasDoAno(2027);
    const thanksgiving = d.find((x) => x.id === "us-thanksgiving-2027");
    const black = d.find((x) => x.id === "us-black-friday-2027");

    expect(thanksgiving?.data).toBe("2027-11-25");
    expect(black?.data).toBe("2027-11-26");
  });

  it("acha o Carnaval a 47 dias da Páscoa", () => {
    expect(datasDoAno(2027).find((x) => x.id === "br-carnaval-2027")?.data).toBe("2027-02-09");
    expect(datasDoAno(2026).find((x) => x.id === "br-carnaval-2026")?.data).toBe("2026-02-17");
  });

  it("acha o dia da eleição americana, terça depois da primeira segunda", () => {
    expect(datasDoAno(2026).find((x) => x.id === "us-eleicao-2026")?.data).toBe("2026-11-03");
    expect(datasDoAno(2028).find((x) => x.id === "us-eleicao-2028")?.data).toBe("2028-11-07");
  });

  it("muda o peso da eleição em ano ímpar, que rende menos", () => {
    const par = datasDoAno(2028).find((x) => x.id === "us-eleicao-2028");
    const impar = datasDoAno(2027).find((x) => x.id === "us-eleicao-2027");

    expect(par?.pesoParaOBrasileiro).toBe(3);
    expect(impar?.pesoParaOBrasileiro).toBe(1);
  });

  it("gera o calendário econômico mensal dos dois indicadores", () => {
    const d = datasDoAno(2029);
    expect(d.filter((x) => x.id.startsWith("us-emprego-")).length).toBe(12);
    expect(d.filter((x) => x.id.startsWith("us-inflacao-")).length).toBe(12);
  });

  /**
   * A regra do relatório de emprego, conferida contra a realidade.
   *
   * A lenda repetida em toda parte diz "primeira sexta do mês". A regra
   * publicada pelo BLS diz "terceira sexta depois do fim da semana que contém
   * o dia 12 do mês de referência". As duas coincidem na maioria dos meses, e
   * é por isso que a lenda sobrevive; quando divergem, quem usa a lenda
   * anuncia o número mais importante da economia americana no dia errado.
   *
   * O relatório de agosto de 2026 saiu em 4 de setembro de 2026, data lida no
   * feed oficial do BLS em 16/09/2026. É esse número que este teste guarda.
   */
  it("acha a data do relatório de emprego pela regra do BLS, e não pela lenda", () => {
    expect(saidaDoRelatorioDeEmprego(2026, 8)).toBe("2026-09-04");

    // Fevereiro de 2029: a lenda diria 2 de março, a regra diz 9 de março.
    expect(saidaDoRelatorioDeEmprego(2029, 2)).toBe("2029-03-09");
  });

  it("empurra a divulgação que cai em feriado federal", () => {
    // O relatório de dezembro de 2026 cai em 1 de janeiro pela regra, e o BLS
    // não publica no Ano Novo.
    expect(saidaDoRelatorioDeEmprego(2026, 12)).toBe("2027-01-02");
  });

  it("traz as decisões de juros do Fomc nos anos que o Fed já publicou", () => {
    const fomc2027 = datasDoAno(2027).filter((x) => x.id.startsWith("us-fomc-"));
    expect(fomc2027).toHaveLength(8);
    // Copiado do calendário oficial do Federal Reserve: a data é a do segundo
    // dia da reunião, que é quando sai a decisão.
    expect(fomc2027.map((x) => x.data)).toContain("2027-09-15");

    // 2028 ainda não foi publicado, e o calendário não inventa.
    expect(datasDoAno(2028).filter((x) => x.id.startsWith("us-fomc-"))).toEqual([]);
  });

  it("calcula a eleição brasileira por regra, e não por data cravada", () => {
    // Primeiro domingo de outubro. Municipal em ano divisível por 4.
    expect(datasDoAno(2028).find((x) => x.id === "br-eleicao-2028")?.data).toBe("2028-10-01");
    expect(datasDoAno(2030).find((x) => x.id === "br-eleicao-2030")?.data).toBe("2030-10-06");
    expect(datasDoAno(2027).some((x) => x.id.startsWith("br-eleicao-"))).toBe(false);
  });

  it("serve os anos que o dono pediu, de 2026 a 2030", () => {
    for (const ano of [2026, 2027, 2028, 2029, 2030]) {
      const d = datasDoAno(ano);
      expect(d.length).toBeGreaterThan(40);
      expect(d.every((x) => x.data.startsWith(String(ano)))).toBe(true);
      // Ordenado, porque quem consome lê de cima para baixo.
      expect([...d].sort((a, b) => a.data.localeCompare(b.data))).toEqual(d);
    }
  });

  it("traz as datas anunciadas no ano delas, e só nele", () => {
    expect(datasDoAno(2028).some((x) => x.id === "us-olimpiadas-2028")).toBe(true);
    expect(datasDoAno(2027).some((x) => x.id === "us-olimpiadas-2028")).toBe(false);
  });
});

describe("a agenda do dia", () => {
  /**
   * O horizonte é da data, não do calendário. Esta é a regra que faz a Black
   * Friday aparecer com três semanas e o Finados aparecer com três dias.
   */
  it("só mostra a data quando falta menos do que a antecedência dela", () => {
    // Black Friday de 2026 é 27/11. Com 21 dias de antecedência, ela entra em
    // 06/11 e não entra em 05/11.
    expect(agenda("2026-11-06").some((x) => x.id === "us-black-friday-2026")).toBe(true);
    expect(agenda("2026-11-05").some((x) => x.id === "us-black-friday-2026")).toBe(false);
  });

  it("não mostra o que já passou", () => {
    expect(agenda("2026-11-28").some((x) => x.id === "us-black-friday-2026")).toBe(false);
  });

  it("atravessa a virada do ano", () => {
    // Em 28/12/2026, o Ano Novo de 2027 precisa estar no radar.
    expect(agenda("2026-12-28").some((x) => x.id === "us-ano-novo-2027")).toBe(true);
  });

  it("ordena pelo que está mais perto", () => {
    const itens = agenda("2026-11-20");
    const distancias = itens.map((x) => x.faltam);
    expect([...distancias].sort((a, b) => a - b)).toEqual(distancias);
  });

  it("escreve a agenda em português, ou nada quando não há nada", () => {
    const texto = agendaEmTexto("2026-11-25");
    expect(texto).toContain("Thanksgiving");
    expect(texto).toContain("é amanhã");

    // 5 de janeiro de 2027 não tem gancho nenhum, e a resposta certa é vazio.
    expect(agendaEmTexto("2027-01-05")).toBe("");
  });

  it("entrega os termos de busca sem repetir, e sem o que é só contexto", () => {
    const termos = termosDaAgenda("2026-11-20");
    expect(termos).toContain("Black Friday deals");
    expect(new Set(termos).size).toBe(termos.length);
    // Columbus Day tem peso 1: é contexto, e contexto não gasta uma busca.
    expect(termos).not.toContain("Columbus Day");
  });

  /**
   * A densidade importa nos dois sentidos.
   *
   * Calendário que fala todo dia vira ruído e o redator para de ler; calendário
   * que fala uma vez por mês não muda pauta nenhuma. Medido em 2027: 262 dias
   * com algo no radar e 103 sem nada, que é perto de três quartos dos dias.
   */
  it("tem dia com gancho e dia sem, e a proporção é medida", () => {
    let dia = "2027-01-01";
    let comGancho = 0;

    for (let i = 0; i < 365; i++) {
      if (agenda(dia).length > 0) comGancho++;
      dia = somarDias(dia, 1);
    }

    expect(comGancho).toBeGreaterThan(200);
    expect(comGancho).toBeLessThan(330);
  });
});

describe("o dia em que o país realmente para", () => {
  /**
   * A data legal é uma coisa, o dia em que banco, bolsa e consulado fecham é
   * outra. Regra da OPM: feriado de data fixa no sábado é observado na sexta
   * anterior, e no domingo, na segunda seguinte.
   */
  it("marca o dia observado quando o feriado cai no fim de semana", () => {
    // 4 de julho de 2026 é um sábado: observado na sexta, dia 3.
    const julho2026 = datasDoAno(2026).find((x) => x.id === "us-independencia-2026");
    expect(julho2026?.data).toBe("2026-07-04");
    expect(julho2026?.observado).toBe("2026-07-03");

    // 25 de dezembro de 2027 é um sábado: observado na sexta, dia 24.
    expect(datasDoAno(2027).find((x) => x.id === "us-natal-2027")?.observado).toBe("2027-12-24");
  });

  it("não inventa dia observado quando o feriado já cai em dia útil", () => {
    // 4 de julho de 2028 é uma terça-feira.
    expect(datasDoAno(2028).find((x) => x.id === "us-independencia-2028")?.observado).toBeUndefined();
  });
});
