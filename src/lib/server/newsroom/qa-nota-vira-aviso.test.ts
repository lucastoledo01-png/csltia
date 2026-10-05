import { describe, expect, it } from "vitest";
import { runNewsroomPipeline } from "./pipeline";
import type { RankedCandidate } from "./ranker";
import type { PacoteFactual } from "../editorial/pacote-factual";

/**
 * Nota baixa de QA vira aviso; risco de alucinação continua bloqueando sozinho.
 *
 * Decisão do dono em 05/10/2026, que fecha a divergência registrada em 18/09:
 * o piso de 85 bloqueava a edição por uma nota graduada que muda entre
 * chamadas, embora o documento de decisões dissesse que o portão olhava só o
 * risco de alucinação. Com os ramos no comando, a nota vai para a peça como
 * aviso, e quem aprova vê. Sem os ramos, o piso continua como estava, e isso
 * também está provado aqui.
 */

const PACOTE = (url: string): PacoteFactual => ({
  verified_facts: ["O órgão publicou um aviso em 15 de setembro de 2026."],
  people: [],
  organizations: ["USCIS"],
  places: ["Estados Unidos"],
  dates: ["15 de setembro de 2026"],
  numbers: [],
  gaps: [],
  source_urls: [url],
  texto_de_origem: "O órgão publicou um aviso em 15 de setembro de 2026.",
});

const NOMES = ["Matéria alfa", "Matéria beta"];

function candidata(i: number): RankedCandidate {
  const url = `https://exemplo.org/materia-${i}`;
  return {
    score: 100 - i,
    reasons: [],
    group: {
      primary: {
        title: NOMES[i],
        url,
        source_name: "Fonte",
        source_id: "fonte",
        published_at: "2026-09-16T10:00:00.000Z",
        description: "O órgão publicou um aviso.",
        dedupe_key: `k-${i}`,
      },
      duplicates: [],
    },
  } as unknown as RankedCandidate;
}

function historia(i: number) {
  return {
    rank: i + 1,
    category: "Economia",
    title: NOMES[i],
    summary: "O órgão publicou um aviso em 15 de setembro de 2026.",
    context: "",
    why_it_matters: "",
    practical_impact: "",
    source_name: "Fonte",
    source_url: `https://exemplo.org/materia-${i}`,
    secondary_urls: [],
  };
}

function edicao() {
  return {
    subject_options: ["Uma opção de assunto", "Outra opção de assunto", "Terceira opção aqui"],
    subject: "O aviso que saiu nesta terça-feira",
    preheader: "O que mudou, em duas matérias curtas e diretas",
    headline: "O aviso da semana",
    intro: "Bom dia. Hoje a edição tem dois assuntos, e os dois saíram de aviso publicado por órgão oficial.",
    stories: [historia(0), historia(1)],
    quick_bits: [],
    closing: "Compartilhe com quem acompanha o assunto.",
    final_line: "Até amanhã.",
  };
}

function openaiFalso(qa: { score: number; hallucination_risk: boolean }) {
  const fetcher = (async (_entrada: string | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const pedido = corpo.messages.map((m: { content: string }) => m.content).join("\n");
    let resposta: unknown;
    if (pedido.includes("O QUE É ALUCINAÇÃO AQUI")) {
      resposta = {
        passed: qa.score >= 85 && !qa.hallucination_risk,
        hallucination_risk: qa.hallucination_risk,
        tone_check_passed: true,
        grammar_passed: true,
        story_count_valid: true,
        issues: [],
        score: qa.score,
      };
    } else if (pedido.includes("Pacote factual:") && pedido.includes("Texto escrito:")) {
      resposta = { claims: [] };
    } else {
      resposta = edicao();
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(resposta) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return fetcher;
}

const ENV = { OPENAI_API_KEY: "chave-de-teste", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };
const pacotes = () => new Map([0, 1].map((i) => [`https://exemplo.org/materia-${i}`, PACOTE(`https://exemplo.org/materia-${i}`)]));

function rodar(qa: { score: number; hallucination_risk: boolean }, notaMinima: number, notaDeAviso?: number) {
  return runNewsroomPipeline(
    [candidata(0), candidata(1)],
    ENV,
    openaiFalso(qa),
    undefined,
    { minimo: 2, maximo: 4 },
    pacotes(),
    0,
    notaMinima,
    notaDeAviso !== undefined ? { notaDeAviso } : {},
  );
}

describe("nota baixa de QA", () => {
  it("sem os ramos, o piso de 85 continua BLOQUEANDO (o ciclo de amanhã não muda)", async () => {
    const r = await rodar({ score: 70, hallucination_risk: false }, 85);
    expect(r.aprovado).toBe(false);
    expect(r.bloqueios.join(" ")).toContain("nota 70 abaixo do piso 85");
    expect(r.avisos).toEqual([]);
  });

  it("com os ramos, a nota baixa vira AVISO e a edição sai", async () => {
    const r = await rodar({ score: 70, hallucination_risk: false }, 0, 85);
    expect(r.aprovado).toBe(true);
    expect(r.bloqueios).toEqual([]);
    expect(r.avisos.join(" ")).toContain("QA_LOW_SCORE: nota 70 abaixo de 85");
  });

  it("com os ramos, o risco de alucinação continua BLOQUEANDO, mesmo com nota alta", async () => {
    const r = await rodar({ score: 98, hallucination_risk: true }, 0, 85);
    expect(r.aprovado).toBe(false);
    expect(r.bloqueios.join(" ")).toContain("hallucination_risk");
  });

  it("nota acima do piso não gera aviso nenhum", async () => {
    const r = await rodar({ score: 92, hallucination_risk: false }, 0, 85);
    expect(r.aprovado).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(r.custosPorEtapa.redacao).toBeGreaterThan(0);
    expect(r.custosPorEtapa.auditoria_qa).toBeGreaterThan(0);
  });
});
