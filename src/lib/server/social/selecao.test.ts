import { describe, expect, it } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import {
  carregarConfigSocial,
  comporFeedSocial,
  feedMonotematico,
  programaDaPauta,
  topicoDaPauta,
} from "./selecao";

/**
 * A composição do feed, que não é a do e-mail.
 *
 * A medição da capacidade mostrou o problema em números: num dia com oito
 * pautas aprovadas, seis desapareceram no corte de composição da newsletter,
 * sem sequer aparecer na lista de recusadas. Aqueles tetos servem a uma peça
 * de quatro pautas; o feed precisa dos seus.
 */

let n = 0;

function pauta(entrada: {
  titulo: string;
  nota: number;
  pais?: "EUA" | "Brasil" | "outro";
  eixo?: string;
  imigracao?: boolean;
  atores?: string[];
  url?: string;
  texto?: string;
  storyId?: string;
  vetor?: number[] | null;
}): PautaAvaliada {
  n += 1;
  return {
    grupo: {
      primary: {
        id: `c${n}`,
        url: entrada.url ?? `https://exemplo${n}.com/materia-${n}`,
        title: entrada.titulo,
        source_name: "Fonte",
        priority: 1,
        published_at: "2026-09-10T12:00:00Z",
        description: entrada.texto ?? "",
        content: "",
        category: "geral",
        score: 0,
        dedupe_key: `k${n}`,
        window_hours: 72,
      },
      duplicates: [],
    },
    storyId: entrada.storyId ?? `s${n}`,
    classificacao: {
      id: `c${n}`,
      pais: entrada.pais ?? "EUA",
      imigracao: entrada.imigracao ?? false,
      leitura: "oportunidade",
      eixo: (entrada.eixo ?? "oportunidade") as never,
      natureza: "official_action",
      relevancia: 7,
      atores: entrada.atores ?? [],
      lugares: [],
      acontecimento: [],
      justificativa: "",
    },
    enriquecimento: { texto: entrada.texto ?? "", origem: "feed", caracteres: 0 } as never,
    motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
    veredito: { repetida: false } as never,
    pontuacao: { total: entrada.nota, partes: {}, explicacao: "" } as never,
    vetor: entrada.vetor ?? null,
  } as unknown as PautaAvaliada;
}

const CONFIG = carregarConfigSocial({});

describe("identidade de tópico", () => {
  it("reconhece o programa migratório citado", () => {
    expect(programaDaPauta("USCIS muda a análise do EB-2 NIW", "")).toBe("eb2-niw");
    expect(programaDaPauta("Novo teto do H-1B", "")).toBe("h1b");
    expect(programaDaPauta("Fim de semana em Miami", "")).toBeNull();
  });

  it("agrupa pelo programa antes de agrupar pelo órgão", () => {
    const p = pauta({ titulo: "USCIS publica guia do EB-2 NIW", nota: 50, atores: ["USCIS"] });
    expect(topicoDaPauta(p)).toBe("programa:eb2-niw");
  });

  it("sem programa, agrupa pelo ator principal", () => {
    const p = pauta({ titulo: "USCIS abre novo escritório", nota: 50, atores: ["USCIS"] });
    expect(topicoDaPauta(p)).toBe("org:uscis");
  });

  it("sem programa e sem ator, sobra o eixo", () => {
    const p = pauta({ titulo: "Dado econômico do mês", nota: 50, eixo: "custo_de_vida" });
    expect(topicoDaPauta(p)).toBe("eixo:custo_de_vida");
  });
});

describe("composição do feed", () => {
  it("pool magro produz feed magro, sem inventar nada", () => {
    const r = comporFeedSocial([pauta({ titulo: "Uma só", nota: 50 })], CONFIG);
    expect(r.escolhidas).toHaveLength(1);
    expect(r.cortadas).toHaveLength(0);
  });

  it("pool vazio produz feed vazio", () => {
    const r = comporFeedSocial([], CONFIG);
    expect(r.escolhidas).toHaveLength(0);
  });

  it("não deixa o mesmo programa migratório dominar o dia", () => {
    const pool = [1, 2, 3, 4].map((i) =>
      pauta({ titulo: `Caso ${i} do EB-2 NIW aprovado`, nota: 60 - i, imigracao: true, atores: [`Órgão ${i}`] }),
    );

    const r = comporFeedSocial(pool, CONFIG);

    expect(r.escolhidas).toHaveLength(CONFIG.maximoPorPrograma);
    expect(r.cortadas.some((c) => c.motivo === "TOPIC_OVERLOAD" || c.motivo === "SAME_VISA_OVERLOAD")).toBe(true);
  });

  it("respeita o teto de pautas migratórias por dia", () => {
    // Eixos distintos de propósito: sem isso o teto por eixo corta antes e o
    // motivo registrado seria outro, o que esconderia a regra sob teste.
    const eixos = ["oportunidade", "processo", "decisao_judicial", "custo_de_vida", "outro"];
    const pool = ["EB-2 NIW", "H-1B", "green card", "asilo", "cidadania"].map((t, i) =>
      pauta({
        titulo: `Novidade sobre ${t}`,
        nota: 60 - i,
        imigracao: true,
        eixo: eixos[i],
        atores: [`Ator ${i}`],
        url: `https://fonte${i}.com/n`,
      }),
    );

    const r = comporFeedSocial(pool, CONFIG);
    const migratorias = r.escolhidas.filter((e) => e.pauta.classificacao.imigracao).length;

    expect(migratorias).toBeLessThanOrEqual(CONFIG.maximoDeImigracao);
    expect(r.cortadas.some((c) => c.motivo === "IMMIGRATION_TOPIC_OVERLOAD")).toBe(true);
  });

  it("limita política brasileira sem depender do eixo declarado", () => {
    const pool = [1, 2, 3, 4].map((i) =>
      pauta({
        titulo: `Ministro do STF decide item ${i}`,
        nota: 60 - i,
        pais: "Brasil",
        eixo: "outro",
        atores: [`Ministro ${i}`],
        url: `https://veiculo${i}.com.br/n`,
      }),
    );

    const r = comporFeedSocial(pool, CONFIG);

    expect(r.escolhidas.length).toBeLessThanOrEqual(CONFIG.maximoDePoliticaBrasileira);
    expect(r.cortadas.some((c) => c.motivo === "POLITICA_BR_OVERLOAD")).toBe(true);
  });

  it("o teto por domínio do feed é mais largo que o do e-mail", () => {
    const pool = [1, 2, 3].map((i) =>
      pauta({
        titulo: `Assunto distinto número ${i}`,
        nota: 60 - i,
        eixo: ["oportunidade", "processo", "custo_de_vida"][i - 1],
        atores: [`Ator ${i}`],
        url: `https://g1.globo.com/materia-${i}`,
      }),
    );

    const r = comporFeedSocial(pool, CONFIG);

    // A newsletter cortaria em 2. Aqui passam 3, que é o teto próprio.
    expect(r.escolhidas).toHaveLength(3);
  });

  it("o mesmo acontecimento não entra duas vezes", () => {
    // Mesmo acontecimento visto por duas fontes: mesmos atores, mesmos
    // lugares, mesmo verbo. O fingerprint junta o que o leitor lê como
    // repetição, mesmo com URLs e títulos diferentes.
    const pool = [
      pauta({ titulo: "USCIS amplia o prazo do EAD", nota: 60, storyId: "a", atores: ["USCIS"] }),
      pauta({ titulo: "Prazo do EAD é ampliado pelo USCIS", nota: 55, storyId: "b", atores: ["USCIS"] }),
    ];

    const r = comporFeedSocial(pool, CONFIG);

    expect(r.escolhidas).toHaveLength(1);
    expect(r.cortadas[0].motivo).toBe("DUPLICATE_EVENT");
  });

  it("nunca passa do máximo por dia", () => {
    const pool = Array.from({ length: 40 }, (_, i) =>
      pauta({
        titulo: `Pauta variada ${i}`,
        nota: 90 - i,
        eixo: ["oportunidade", "processo", "custo_de_vida", "decisao_judicial", "outro"][i % 5],
        atores: [`Ator ${i}`],
        url: `https://dominio${i}.com/n`,
      }),
    );

    const r = comporFeedSocial(pool, CONFIG);
    expect(r.escolhidas.length).toBeLessThanOrEqual(CONFIG.maximoPorDia);
  });

  it("guloso pela nota: a melhor pauta nunca fica de fora", () => {
    const pool = [
      pauta({ titulo: "A melhor do dia", nota: 95, atores: ["X"] }),
      pauta({ titulo: "Uma qualquer", nota: 20, atores: ["Y"] }),
    ];

    const r = comporFeedSocial(pool, CONFIG);
    expect(r.escolhidas[0].pauta.grupo.primary.title).toBe("A melhor do dia");
  });
});

describe("sem persistência, o social não publica", () => {
  it("persistência degradada bloqueia o ciclo", () => {
    const r = comporFeedSocial([pauta({ titulo: "Uma pauta boa", nota: 60 })], CONFIG, {
      persistenciaDegradada: true,
      paraPublicar: true,
    });

    // O cálculo acontece; a liberação é que não.
    expect(r.escolhidas).toHaveLength(1);
    expect(r.bloqueio).toBe("SOCIAL_PERSISTENCE_UNAVAILABLE");
  });

  it("dry-run continua rodando, porque diagnóstico não publica", () => {
    const r = comporFeedSocial([pauta({ titulo: "Uma pauta boa", nota: 60 })], CONFIG, {
      persistenciaDegradada: true,
      paraPublicar: false,
    });

    expect(r.escolhidas).toHaveLength(1);
    expect(r.bloqueio).toBeNull();
  });

  it("com persistência sadia, nada é bloqueado", () => {
    const r = comporFeedSocial([pauta({ titulo: "Uma pauta boa", nota: 60 })], CONFIG, {
      persistenciaDegradada: false,
      paraPublicar: true,
    });
    expect(r.bloqueio).toBeNull();
  });
});

describe("teste de diversidade", () => {
  it("dia magro não é reprovado por falta de variedade", () => {
    const r = comporFeedSocial([pauta({ titulo: "Única", nota: 50 })], CONFIG);
    expect(feedMonotematico(r).monotematico).toBe(false);
  });

  it("feed cheio com poucos tópicos é reprovado", () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      pauta({ titulo: `Assunto ${i}`, nota: 60 - i, eixo: "imigracao", atores: [`Ator ${i}`] }),
    );

    const r = comporFeedSocial(pool, { ...CONFIG, maximoPorEixo: 10, maximoPorTopico: 10 });
    const v = feedMonotematico(r);

    expect(r.escolhidas.length).toBeGreaterThan(2);
    expect(v.monotematico).toBe(true);
    expect(v.motivo).toMatch(/eixo|tópico/);
  });

  it("feed variado passa", () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      pauta({
        titulo: `Assunto ${i}`,
        nota: 60 - i,
        eixo: ["oportunidade", "processo", "custo_de_vida"][i % 3],
        atores: [`Ator ${i}`],
        url: `https://d${i}.com/n`,
      }),
    );

    const r = comporFeedSocial(pool, CONFIG);
    expect(feedMonotematico(r).monotematico).toBe(false);
  });
});

describe("o mesmo acontecimento, escrito de outro jeito", () => {
  /*
   * O feed saiu com dois posts sobre a mesma liminar em 16/09/2026, com
   * manchetes quase iguais. O teto por acontecimento existia e não pegou: ele
   * compara igualdade EXATA de ator, lugar e termo, e dois escritórios
   * cobrindo a mesma decisão escrevem palavras diferentes.
   */
  function vetorDistante(semelhanca: number): number[] {
    const angulo = Math.acos(semelhanca);
    return [Math.cos(angulo), Math.sin(angulo)];
  }

  it("agrupa por semelhança quando a impressão não coincide", () => {
    const r = comporFeedSocial(
      [
        pauta({ titulo: "Corte adia regra de prazo fixo", nota: 90, atores: ["Corte"], vetor: [1, 0] }),
        pauta({
          titulo: "Juiz posterga norma que encerrava permanência aberta",
          nota: 80,
          atores: ["Juiz federal"],
          vetor: vetorDistante(0.85),
        }),
      ],
      carregarConfigSocial({}),
    );

    expect(r.escolhidas).toHaveLength(1);
    expect(r.cortadas[0].motivo).toBe("DUPLICATE_EVENT");
    expect(r.cortadas[0].detalhe).toContain("semelhança");
  });

  it("fatos distintos continuam entrando", () => {
    const r = comporFeedSocial(
      [
        pauta({ titulo: "Corte adia regra de prazo fixo", nota: 90, atores: ["Corte"], vetor: [1, 0] }),
        pauta({
          titulo: "Salário mínimo da Califórnia sobe em 2027",
          nota: 80,
          atores: ["Califórnia"],
          vetor: vetorDistante(0.5),
        }),
      ],
      carregarConfigSocial({}),
    );

    expect(r.escolhidas).toHaveLength(2);
  });

  it("sem vetor, a composição é a de antes", () => {
    const r = comporFeedSocial(
      [
        pauta({ titulo: "Corte adia regra de prazo fixo", nota: 90, atores: ["Corte"] }),
        pauta({ titulo: "Juiz posterga norma de permanência", nota: 80, atores: ["Juiz federal"] }),
      ],
      carregarConfigSocial({}),
    );

    expect(r.escolhidas).toHaveLength(2);
  });
});
