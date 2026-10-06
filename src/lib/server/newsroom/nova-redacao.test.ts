import { describe, expect, it, vi } from "vitest";
import type { RankedCandidate } from "./ranker";
import { pautasApontadas, redigirComNovasTentativas, type ResultadoRedigivel } from "./nova-redacao";

/**
 * A edição barrada é escrita de novo, e o portão não muda (06/10/2026).
 *
 * Os apontamentos abaixo são os REAIS da edição de 07/10/2026, barrada na
 * produção das 17:00 com QA 94 e risco de alucinação, copiados da linha
 * `failed` de `newsroom_runs`.
 */

const ISSUES_DE_07_10 = [
  "O título da segunda matéria afirma que o padrão para bots de IA é criado 'nos EUA', mas o pacote factual não localiza geograficamente esse padrão.",
  "A expressão 'estaleiro de submarinos' pode sugerir que a instalação construirá submarinos completos; o pacote informa que a Anduril produzirá componentes.",
];

const PAUTAS_DE_07_10 = [
  {
    url: "https://exemplo.org/anduril",
    titulo: "Anduril abre estaleiro de submarinos na Virgínia",
    texto: "A Anduril vai abrir um estaleiro de submarinos e produzir componentes para a classe Virginia.",
  },
  {
    url: "https://exemplo.org/meta-walmart",
    titulo: "Meta e Walmart criam padrão aberto para bots de IA nos EUA",
    texto: "As empresas anunciaram um padrão aberto para agentes de IA.",
  },
  { url: "https://exemplo.org/fed", titulo: "Fed mantém juros", texto: "O Fed manteve a taxa." },
  { url: "https://exemplo.org/dolar", titulo: "Dólar cai abaixo de R$ 5", texto: "O dólar fechou a R$ 4,98." },
];

describe("as matérias que o auditor aponta", () => {
  it("o caso de 07/10: o ordinal aponta a segunda, e o trecho entre aspas aponta a da Anduril", () => {
    expect(pautasApontadas(ISSUES_DE_07_10, PAUTAS_DE_07_10)).toEqual([0, 1]);
  });

  it("um apontamento só, pelo título inteiro", () => {
    const issue = 'O título "Fed mantém juros" acrescenta uma data que o pacote não tem.';
    expect(pautasApontadas([issue], PAUTAS_DE_07_10)).toEqual([2]);
  });

  it("'pauta 4' e 'matéria 4' apontam a quarta", () => {
    expect(pautasApontadas(["A pauta 4 inventa uma cotação."], PAUTAS_DE_07_10)).toEqual([3]);
  });

  it("trecho que aparece em duas matérias não aponta ninguém", () => {
    const pautas = [
      { url: "a", titulo: "Um", texto: "o padrão aberto foi anunciado" },
      { url: "b", titulo: "Dois", texto: "o padrão aberto foi criticado" },
    ];
    expect(pautasApontadas(["A frase 'o padrão aberto' acrescenta efeito."], pautas)).toEqual([]);
  });

  it("apontamento sobre a abertura ou o fechamento não aponta matéria", () => {
    expect(pautasApontadas(["O fechamento afirma um prazo que o pacote não tem."], PAUTAS_DE_07_10)).toEqual([]);
  });

  it("ordinal além do número de matérias é ignorado", () => {
    expect(pautasApontadas(["A quinta matéria inventa um número."], PAUTAS_DE_07_10)).toEqual([]);
  });
});

function candidata(url: string): RankedCandidate {
  return { score: 1, group: { primary: { url, title: url } } } as unknown as RankedCandidate;
}

const RANKED = PAUTAS_DE_07_10.map((p) => candidata(p.url));

function resultado(
  aprovado: boolean,
  lista: RankedCandidate[],
  issues: string[] = [],
  custo = 0.4,
): ResultadoRedigivel & { lista: string[] } {
  return {
    aprovado,
    bloqueios: aprovado ? [] : ["REJECT_EDITORIAL_QA: hallucination_risk"],
    qaResult: { score: aprovado ? 96 : 94, hallucination_risk: !aprovado, issues },
    pautasAuditadas: lista.map((c) => PAUTAS_DE_07_10.find((p) => p.url === c.group.primary.url)!),
    custosPorEtapa: { redacao: custo / 2, auditoria_qa: custo / 4, auditoria_claims: custo / 4 },
    totalUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: custo },
    lista: lista.map((c) => c.group.primary.url),
  };
}

const semEspera = { dormir: async () => {}, log: () => {} };

describe("redigirComNovasTentativas", () => {
  it("aprovada de primeira: uma redação, nenhuma espera", async () => {
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(true, l));
    const dormir = vi.fn(async () => {});
    const r = await redigirComNovasTentativas(RANKED, redigir, { minimo: 2, dormir, log: () => {} });
    expect(redigir).toHaveBeenCalledTimes(1);
    expect(dormir).not.toHaveBeenCalled();
    expect(r.resultado.aprovado).toBe(true);
  });

  it("barrada e depois aprovada: a segunda redação vale, e o custo é a soma", async () => {
    let n = 0;
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(++n > 1, l));
    const esperas: number[] = [];
    const r = await redigirComNovasTentativas(RANKED, redigir, {
      minimo: 2,
      dormir: async (ms) => {
        esperas.push(ms);
      },
      log: () => {},
    });
    expect(r.resultado.aprovado).toBe(true);
    expect(r.tentativas.map((t) => t.aprovado)).toEqual([false, true]);
    expect(esperas).toEqual([15_000]);
    expect(r.resultado.totalUsage.estimatedCostUsd).toBeCloseTo(0.8);
    expect(r.resultado.custosPorEtapa.redacao).toBeCloseTo(0.4);
  });

  it("o portão não muda: barrada nas três, a última volta BARRADA, com o motivo", async () => {
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(false, l));
    const r = await redigirComNovasTentativas(RANKED, redigir, { minimo: 2, ...semEspera });
    expect(redigir).toHaveBeenCalledTimes(3);
    expect(r.resultado.aprovado).toBe(false);
    expect(r.resultado.bloqueios).toEqual(["REJECT_EDITORIAL_QA: hallucination_risk"]);
    expect(r.resultado.totalUsage.estimatedCostUsd).toBeCloseTo(1.2);
  });

  it("UMA matéria apontada sai já da segunda redação", async () => {
    const issue = "O título da segunda matéria afirma que o padrão é criado 'nos EUA'.";
    let n = 0;
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(++n > 1, l, [issue]));
    const r = await redigirComNovasTentativas(RANKED, redigir, { minimo: 2, ...semEspera });
    expect(redigir.mock.calls[1][0].map((c) => c.group.primary.url)).not.toContain("https://exemplo.org/meta-walmart");
    expect(redigir.mock.calls[1][0]).toHaveLength(3);
    expect(r.retiradas).toEqual(["Meta e Walmart criam padrão aberto para bots de IA nos EUA"]);
  });

  it("VÁRIAS apontadas: a segunda redação leva todas, e só a última tira as apontadas", async () => {
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(false, l, ISSUES_DE_07_10));
    const r = await redigirComNovasTentativas(RANKED, redigir, { minimo: 2, ...semEspera });
    expect(redigir.mock.calls[1][0]).toHaveLength(4);
    expect(redigir.mock.calls[2][0].map((c) => c.group.primary.url)).toEqual([
      "https://exemplo.org/fed",
      "https://exemplo.org/dolar",
    ]);
    expect(r.retiradas).toHaveLength(2);
  });

  it("nunca abaixo do mínimo: com duas pautas e mínimo dois, nenhuma sai", async () => {
    const duas = RANKED.slice(0, 2);
    const issue = "O título da segunda matéria afirma que o padrão é criado 'nos EUA'.";
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(false, l, [issue]));
    const r = await redigirComNovasTentativas(duas, redigir, { minimo: 2, ...semEspera });
    for (const chamada of redigir.mock.calls) expect(chamada[0]).toHaveLength(2);
    expect(r.retiradas).toEqual([]);
  });

  it("sem tentativas extras (guarda fora do comando): uma redação, como antes", async () => {
    const redigir = vi.fn(async (l: RankedCandidate[]) => resultado(false, l));
    const r = await redigirComNovasTentativas(RANKED, redigir, { minimo: 2, tentativasExtras: 0, ...semEspera });
    expect(redigir).toHaveBeenCalledTimes(1);
    expect(r.resultado.aprovado).toBe(false);
  });

  it("erro técnico da redação não vira nova tentativa: sobe como antes", async () => {
    const redigir = vi.fn(async () => {
      throw new Error("OpenAI API error (500)");
    });
    await expect(redigirComNovasTentativas(RANKED, redigir, { minimo: 2, ...semEspera })).rejects.toThrow("500");
    expect(redigir).toHaveBeenCalledTimes(1);
  });
});
