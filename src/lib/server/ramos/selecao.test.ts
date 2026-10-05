import { describe, expect, it } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import { carregarConfigEditorial } from "../editorial/config";
import { carregarConfigSocial } from "../social/selecao";
import {
  TETO_DO_INSTAGRAM,
  TETO_DO_PORTAL,
  eventoRepetido,
  limitarTetoDoDia,
  poolDoInstagram,
  preSelecaoParaPacote,
  selecionarParaNewsletter,
  selecionarParaPortal,
} from "./selecao";

/**
 * A seleção de cada ramo sobre o mesmo pool (05/10/2026).
 *
 * Cada régua aqui tem um caso que produz um NÃO de verdade: pauta sem pacote
 * que não entra, acontecimento repetido que sai, matéria já publicada no
 * portal que não volta. Um teste que só mostra o caminho feliz não distingue
 * régua de régua desligada.
 */

let n = 0;
function pauta(e: { titulo: string; nota: number; vetor?: number[] | null; url?: string; pais?: "EUA" | "Brasil"; ator?: string }): PautaAvaliada {
  n += 1;
  return {
    grupo: {
      primary: {
        id: `c${n}`,
        url: e.url ?? `https://fonte${n}.com/materia-${n}`,
        title: e.titulo,
        source_name: "Fonte",
        priority: 1,
        published_at: "2026-10-05T09:00:00Z",
        description: "",
        content: "",
        category: "geral",
        score: 0,
        dedupe_key: `k${n}`,
        window_hours: 72,
      },
      secondary_sources: [],
      secondary_urls: [],
    },
    storyId: `s${n}`,
    classificacao: {
      id: `c${n}`,
      pais: e.pais ?? "EUA",
      imigracao: false,
      leitura: "oportunidade",
      eixo: "economia",
      natureza: "official_action",
      relevancia: 7,
      atores: e.ator ? [e.ator] : [],
      lugares: [],
      acontecimento: [],
      justificativa: "",
    },
    enriquecimento: { texto: "texto da matéria" } as never,
    motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
    veredito: { repetida: false } as never,
    pontuacao: { total: e.nota, partes: {}, explicacao: "" } as never,
    vetor: e.vetor ?? null,
  } as unknown as PautaAvaliada;
}

const PACOTE: PacoteFactual = {
  verified_facts: ["fato"],
  people: [],
  organizations: [],
  places: [],
  dates: [],
  numbers: [],
  gaps: [],
  source_urls: [],
  texto_de_origem: "fato",
};

function comPacote(...ps: PautaAvaliada[]): Map<string, PacoteFactual> {
  return new Map(ps.map((p) => [p.grupo.primary.url, PACOTE]));
}

const CONFIG = carregarConfigEditorial({});

// Vetores unitários: [1,0,0] e [0.95,0.31,0] têm cosseno ~0.95 (mesmo fato);
// [0,1,0] é ortogonal (fato distinto).
const MESMO_A = [1, 0, 0];
const MESMO_B = [0.95, 0.31, 0];
const OUTRO = [0, 1, 0];
const MAIS_OUTRO = [0, 0, 1];

describe("newsletter (RF-07)", () => {
  it("pauta sem pacote factual NÃO entra, mesmo com a maior nota", () => {
    const sem = pauta({ titulo: "a melhor, sem pacote", nota: 99, vetor: MAIS_OUTRO });
    const a = pauta({ titulo: "a", nota: 80, vetor: MESMO_A });
    const b = pauta({ titulo: "b", nota: 70, vetor: OUTRO });

    const r = selecionarParaNewsletter([sem, a, b], comPacote(a, b), CONFIG);

    expect(r.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["a", "b"]);
    expect(r.semPacote).toEqual(["a melhor, sem pacote"]);
    expect(r.viavel).toBe(true);
  });

  it("o mesmo acontecimento NÃO entra duas vezes (cosseno acima de 0.70)", () => {
    const a = pauta({ titulo: "liminar, veículo 1", nota: 90, vetor: MESMO_A });
    const b = pauta({ titulo: "liminar, veículo 2", nota: 85, vetor: MESMO_B });
    const c = pauta({ titulo: "juros", nota: 60, vetor: OUTRO });

    const r = selecionarParaNewsletter([a, b, c], comPacote(a, b, c), CONFIG);

    expect(r.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["liminar, veículo 1", "juros"]);
    expect(eventoRepetido(r.escolhidas, CONFIG.limiarDeAgrupamento)).toBeNull();
  });

  it("com uma pauta só, a edição NÃO fecha: o mínimo é dois", () => {
    const a = pauta({ titulo: "sozinha", nota: 90, vetor: MESMO_A });
    const r = selecionarParaNewsletter([a], comPacote(a), CONFIG);
    expect(r.viavel).toBe(false);
    expect(r.motivo).toContain("mínimo 2");
  });

  it("nunca passa de quatro", () => {
    const ps = [MESMO_A, OUTRO, MAIS_OUTRO, [0.5, 0, -0.86], [-1, 0, 0]].map((v, i) =>
      pauta({ titulo: `p${i}`, nota: 90 - i, vetor: v, ator: `ator${i}` }),
    );
    const r = selecionarParaNewsletter(ps, comPacote(...ps), CONFIG);
    expect(r.escolhidas.length).toBe(4);
  });
});

describe("conferência independente do acontecimento repetido", () => {
  it("acusa o par acima do limiar e silencia abaixo", () => {
    const a = pauta({ titulo: "a", nota: 1, vetor: MESMO_A });
    const b = pauta({ titulo: "b", nota: 1, vetor: MESMO_B });
    const c = pauta({ titulo: "c", nota: 1, vetor: OUTRO });
    expect(eventoRepetido([a, b], 0.7)?.score).toBeGreaterThan(0.9);
    expect(eventoRepetido([a, c], 0.7)).toBeNull();
  });
});

describe("portal (RF-12)", () => {
  it("leva até três, inclusive pauta que a newsletter não levaria", () => {
    const ps = [MESMO_A, OUTRO, MAIS_OUTRO, [-1, 0, 0]].map((v, i) =>
      pauta({ titulo: `p${i}`, nota: 90 - i, vetor: v, ator: `ator${i}` }),
    );
    const r = selecionarParaPortal(ps, comPacote(...ps), [], CONFIG);
    expect(r.escolhidas).toHaveLength(TETO_DO_PORTAL);
  });

  it("o que já saiu no portal NÃO sai de novo", () => {
    const publicada = pauta({ titulo: "Fed corta juros", nota: 95, vetor: OUTRO, url: "https://fonte.com/fed" });
    const nova = pauta({ titulo: "Aluguel cai em Miami", nota: 60, vetor: MESMO_A });
    const historico: RegistroHistorico[] = [
      {
        projectId: "p",
        storyId: "x",
        canal: "article",
        titulo: "Fed corta juros",
        url: "https://fonte.com/fed",
        urlCanonica: "https://fonte.com/fed",
        publicadoEm: "2026-10-04T09:00:00Z",
      },
    ];

    const r = selecionarParaPortal([publicada, nova], comPacote(publicada, nova), historico, CONFIG);

    expect(r.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["Aluguel cai em Miami"]);
    expect(r.repetidasNoCanal.map((x) => x.titulo)).toEqual(["Fed corta juros"]);
  });

  it("o mesmo fato publicado na NEWSLETTER não impede o portal: repetir é proibido só dentro do canal", () => {
    const p = pauta({ titulo: "Fed corta juros", nota: 95, vetor: OUTRO, url: "https://fonte.com/fed" });
    const historico: RegistroHistorico[] = [
      { projectId: "p", storyId: "x", canal: "newsletter", titulo: "Fed corta juros", url: "https://fonte.com/fed", urlCanonica: "https://fonte.com/fed" },
    ];
    const r = selecionarParaPortal([p], comPacote(p), historico, CONFIG);
    expect(r.escolhidas).toHaveLength(1);
  });

  it("sem pacote, NÃO entra", () => {
    const p = pauta({ titulo: "sem pacote", nota: 95, vetor: OUTRO });
    const r = selecionarParaPortal([p], new Map(), [], CONFIG);
    expect(r.escolhidas).toHaveLength(0);
    expect(r.semPacote).toEqual(["sem pacote"]);
  });
});

describe("pré-seleção para o pacote", () => {
  it("é a união dos ramos, sem pagar pacote da mesma pauta duas vezes", () => {
    const ps = [MESMO_A, OUTRO, MAIS_OUTRO].map((v, i) => pauta({ titulo: `p${i}`, nota: 90 - i, vetor: v, ator: `ator${i}` }));
    const pre = preSelecaoParaPacote(ps, CONFIG, []);
    expect(new Set(pre.map((p) => p.grupo.primary.url)).size).toBe(pre.length);
    expect(pre.length).toBe(3);
  });
});

describe("Instagram (RF-15)", () => {
  it("as extras entram no pool e a mesma pauta pelas duas portas conta uma vez", () => {
    const a = pauta({ titulo: "a", nota: 1 });
    const b = pauta({ titulo: "b", nota: 1 });
    const extraRepetida = { ...a } as PautaAvaliada;
    const extraNova = pauta({ titulo: "do perfil de referência", nota: 1 });
    const pool = poolDoInstagram([a, b], [extraRepetida, extraNova]);
    expect(pool.map((p) => p.grupo.primary.title)).toEqual(["a", "b", "do perfil de referência"]);
  });

  it("o teto do ramo baixa o do ambiente e NÃO sobe", () => {
    const dez = carregarConfigSocial({});
    expect(limitarTetoDoDia(dez, TETO_DO_INSTAGRAM).maximoPorDia).toBe(5);
    const tres = carregarConfigSocial({ SOCIAL_POSTS_MAX_PER_DAY: "3", SOCIAL_POSTS_TARGET_PER_DAY: "3" });
    expect(limitarTetoDoDia(tres, TETO_DO_INSTAGRAM).maximoPorDia).toBe(3);
    expect(limitarTetoDoDia(dez, undefined)).toBe(dez);
  });
});
