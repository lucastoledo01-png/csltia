import { describe, expect, it } from "vitest";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { atribuicoesDaLegendaSemLastro, conferirDiasDaSemana, conferirFormaDaLegenda, FORMA_DA_LEGENDA } from "./forma-da-legenda";

/**
 * A forma da legenda no método do Not Journal (06/10/2026): lide de uma ou
 * duas frases, de 2 a 5 parágrafos curtos, teto de palavras, a manchete não
 * repetida, e o "segundo X" sendo o X de verdade.
 */

const MANCHETE = "China fecha mais de 670 bancos em um ano para enxugar o setor rural";

const BOA = [
  "A China fechou mais de 670 bancos em um ano, segundo o regulador bancário do país, numa reestruturação que atinge sobretudo bancos rurais pequenos.",
  "A maior parte das instituições fechadas eram bancos de vilarejo e cooperativas de crédito. Muitas foram absorvidas por bancos maiores da mesma província.",
  "De acordo com a Caixin, o movimento acelerou neste ano. O governo quer reduzir o risco de calote em instituições com pouco capital.",
  "Para Jason Bedford, pesquisador do setor, o fechamento organizado evita corridas bancárias. Ele avalia que o processo deve continuar.",
  "Não há meta oficial para o número de fechamentos em 2027.",
].join("\n\n");

describe("a forma", () => {
  it("a legenda no método passa sem apontamento", () => {
    expect(conferirFormaDaLegenda(BOA, MANCHETE)).toEqual([]);
  });

  it("lide com três frases é apontado", () => {
    const corpo = `Frase um do lide. Frase dois do lide. Frase três do lide.\n\n${BOA.split("\n\n").slice(1).join("\n\n")}`;
    expect(conferirFormaDaLegenda(corpo, MANCHETE).map((p) => p.detalhe).join()).toMatch(/lide tem 3 frases/);
  });

  it("lide em pergunta e saudação são apontados", () => {
    const pergunta = conferirFormaDaLegenda("Você sabia que a China fechou 670 bancos?\n\nO resto.", MANCHETE);
    expect(pergunta.map((p) => p.detalhe).join()).toMatch(/não pergunta/);
    const ola = conferirFormaDaLegenda("Olá, a China fechou 670 bancos.\n\nO resto.", MANCHETE);
    expect(ola.map((p) => p.detalhe).join()).toMatch(/sem saudação/);
  });

  it("parágrafo comprido é apontado; número com ponto e abreviação não contam como frase", () => {
    const longo = "Um. Dois. Três. Quatro. Cinco. Seis.";
    expect(conferirFormaDaLegenda(`Lide curto.\n\n${longo}`, MANCHETE).map((p) => p.detalhe).join()).toMatch(
      /parágrafo 2 tem 6 frases/,
    );
    const comNumero = "O índice subiu 1.250 pontos, segundo J. Powell. Foi a maior alta do ano.";
    expect(conferirFormaDaLegenda(`Lide curto.\n\n${comNumero}`, MANCHETE)).toEqual([]);
  });

  it("mais de cinco parágrafos depois do lide é apontado", () => {
    const corpo = ["Lide.", ...Array.from({ length: 6 }, (_, i) => `Parágrafo ${i}.`)].join("\n\n");
    expect(conferirFormaDaLegenda(corpo, MANCHETE).map((p) => p.detalhe).join()).toMatch(/6 parágrafos/);
  });

  it("a faixa de tamanho: acima do teto é enchimento; abaixo do alvo NÃO é problema (pacote fino)", () => {
    const enchido = ["Lide curto.", ...Array.from({ length: 5 }, () => `${"palavra ".repeat(80).trim()}.`)].join("\n\n");
    expect(conferirFormaDaLegenda(enchido, MANCHETE).map((p) => p.detalhe).join()).toMatch(
      new RegExp(`acima de ${FORMA_DA_LEGENDA.tetoDePalavras}`),
    );
    expect(conferirFormaDaLegenda("A China fechou 670 bancos em um ano, segundo o regulador.", MANCHETE)).toEqual([]);
  });

  it("a manchete repetida palavra por palavra é apontada", () => {
    const corpo = `${MANCHETE}, segundo o regulador.\n\nO resto do texto.`;
    expect(conferirFormaDaLegenda(corpo, MANCHETE).map((p) => p.detalhe).join()).toMatch(/repete a manchete/);
  });

  it("emoji e link são apontados", () => {
    expect(conferirFormaDaLegenda("A China fechou 670 bancos 🏦.", MANCHETE)).toHaveLength(1);
    expect(conferirFormaDaLegenda("A China fechou 670 bancos. Veja https://x.com/a.", MANCHETE)).toHaveLength(1);
  });
});

function pacote(extra: Partial<PacoteFactual> = {}): PacoteFactual {
  return {
    verified_facts: [
      "China closed more than 670 banks in a year, according to the banking regulator.",
      "Chicago has 39 active data centers, according to the city.",
    ],
    people: ["Jason Bedford"],
    organizations: ["National Financial Regulatory Administration", "Caixin"],
    places: ["China", "Chicago"],
    dates: [],
    numbers: ["670 banks", "39 data centers"],
    gaps: [],
    source_urls: ["https://www.axios.com/x"],
    texto_de_origem: "China closed more than 670 banks, Caixin reported. Chicago has 39 data centers, according to the city.",
    ...extra,
  };
}

describe("a atribuição dentro da frase", () => {
  it("'segundo X' com X no pacote passa", () => {
    expect(atribuicoesDaLegendaSemLastro("O movimento acelerou, de acordo com a Caixin.", pacote(), "Axios")).toEqual([]);
  });

  it("'segundo X' com X que o pacote não cita é apontado", () => {
    const r = atribuicoesDaLegendaSemLastro("O movimento acelerou, segundo a Bloomberg.", pacote(), "Axios");
    expect(r).toHaveLength(1);
    expect(r[0].detalhe).toMatch(/Bloomberg não aparece no pacote/);
  });

  it("o veículo como dono de um número que no pacote é de outro: o defeito de Chicago", () => {
    const r = atribuicoesDaLegendaSemLastro("Chicago tem 39 data centers ativos, segundo a Axios.", pacote(), "axios.com");
    expect(r).toHaveLength(1);
    expect(r[0].detalhe).toMatch(/outro dono/);
  });

  it("o veículo como dono, sem número, não é conferido (a régua só afirma o que mede)", () => {
    expect(atribuicoesDaLegendaSemLastro("A cidade discute o tema, segundo a Axios.", pacote(), "Axios")).toEqual([]);
  });

  it("'segundo o regulador', sem nome próprio, não é conferido", () => {
    expect(atribuicoesDaLegendaSemLastro("Foram 670 bancos, segundo o regulador.", pacote(), "Axios")).toEqual([]);
  });

  it("sem pacote, nada a conferir", () => {
    expect(atribuicoesDaLegendaSemLastro("Segundo a Bloomberg, 670.", null, "Axios")).toEqual([]);
  });
});

describe("o quando do lide", () => {
  // Terça-feira, 6 de outubro de 2026, 15h em Brasília.
  const AGORA = new Date("2026-10-06T18:00:00Z");

  it("dia da semana que bate com o calendário sai do texto da ancoragem", () => {
    const r = conferirDiasDaSemana("O Fed cortou os juros na segunda-feira (5), e o mercado subiu na terça-feira (6).", AGORA);
    expect(r.problemas).toEqual([]);
    expect(r.paraAncorar).toBe("O Fed cortou os juros na segunda, e o mercado subiu na terça.");
  });

  it("dia da semana errado é apontado e continua no texto", () => {
    const r = conferirDiasDaSemana("O Fed cortou os juros na sexta-feira (5).", AGORA);
    expect(r.problemas).toHaveLength(1);
    expect(r.paraAncorar).toContain("(5)");
  });
});
