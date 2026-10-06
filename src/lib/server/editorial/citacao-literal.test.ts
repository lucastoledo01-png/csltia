import { describe, expect, it } from "vitest";
import {
  citacoesLiterais,
  citacoesSemAtribuicao,
  falaSustentada,
  validarAncoragem,
  type PacoteFactual,
} from "./pacote-factual";

/*
 * A citação de famoso é formato desde 06/10/2026, e só existe literal e
 * atribuída. O caso é o da auditoria: Jensen Huang dizendo que data centers
 * podem criar 1 milhão de empregos.
 */

const TEXTO =
  'Nvidia CEO Jensen Huang said on Monday that "data centers could create a million jobs in America over the next decade," speaking at a conference in Washington.';

function pacote(over: Partial<PacoteFactual> = {}): PacoteFactual {
  return {
    verified_facts: ["Jensen Huang falou numa conferência em Washington"],
    people: ["Jensen Huang"],
    organizations: ["Nvidia"],
    places: ["Washington"],
    dates: [],
    numbers: ["1 milhão de empregos"],
    gaps: [],
    source_urls: ["https://exemplo.com"],
    texto_de_origem: TEXTO,
    ...over,
  };
}

const CITACOES = citacoesLiterais(
  [
    {
      autor: "Jensen Huang",
      original: "data centers could create a million jobs in America over the next decade",
      traducao: "data centers podem criar um milhão de empregos nos Estados Unidos na próxima década",
    },
    // Inventada: não está no texto, e não pode entrar no pacote.
    { autor: "Jensen Huang", original: "AI will replace every programmer by 2030", traducao: "a IA vai substituir todo programador até 2030" },
    { autor: "", original: "data centers could create", traducao: "" },
  ],
  TEXTO,
);

describe("as citações do pacote", () => {
  it("só fica a fala que está no texto de origem, com autor", () => {
    expect(CITACOES).toHaveLength(1);
    expect(CITACOES[0].autor).toBe("Jensen Huang");
  });

  it("aceita lixo do modelo sem quebrar", () => {
    expect(citacoesLiterais(null, TEXTO)).toEqual([]);
    expect(citacoesLiterais("fala", TEXTO)).toEqual([]);
    expect(citacoesLiterais([{ autor: "X" }], TEXTO)).toEqual([]);
  });
});

describe("fala entre aspas na ancoragem", () => {
  const comCitacao = pacote({ citacoes: CITACOES });

  it("a tradução conferida entre aspas tem lastro", () => {
    const r = validarAncoragem('Jensen Huang: "data centers podem criar um milhão de empregos nos Estados Unidos"', comCitacao);
    expect(r.naoSustentadas.filter((x) => x.tipo === "citacao")).toEqual([]);
  });

  it("a fala inventada ou melhorada entre aspas é bloqueio", () => {
    const r = validarAncoragem('Jensen Huang: "a inteligência artificial vai gerar empregos para todo mundo nos EUA"', comCitacao);
    const falas = r.naoSustentadas.filter((x) => x.tipo === "citacao");
    expect(falas).toHaveLength(1);
    expect(falas[0].severidade).toBe("bloqueio");
    expect(r.ancorado).toBe(false);
  });

  it("sem citação conferida no pacote, a tradução não tem lastro; o original tem", () => {
    expect(falaSustentada("data centers podem criar um milhão de empregos nos Estados Unidos", pacote())).toBe(false);
    expect(falaSustentada("a million jobs in America over the next decade", pacote())).toBe(true);
  });

  it("cortar com reticências pode; emendar com palavra nova não", () => {
    expect(falaSustentada("data centers podem criar um milhão de empregos... na próxima década", comCitacao)).toBe(true);
    expect(falaSustentada("data centers podem criar um milhão de empregos... para brasileiros", comCitacao)).toBe(true);
    expect(falaSustentada("data centers podem criar um milhão de empregos... para brasileiros que sonham", comCitacao)).toBe(false);
  });

  it("expressão curta entre aspas não é conferida", () => {
    const r = validarAncoragem('As empresas assumiram um compromisso "moralmente vinculante" com a Casa Branca', pacote());
    expect(r.naoSustentadas.filter((x) => x.tipo === "citacao")).toEqual([]);
  });
});

describe("a citação no post precisa de dono", () => {
  const comCitacao = pacote({ citacoes: CITACOES });

  it("com o sobrenome no post, está atribuída", () => {
    expect(citacoesSemAtribuicao('"data centers podem criar um milhão de empregos nos Estados Unidos", diz Huang', comCitacao)).toEqual([]);
  });

  it("sem o nome, a fala conferida é recusada", () => {
    const r = citacoesSemAtribuicao('"data centers podem criar um milhão de empregos nos Estados Unidos"', comCitacao);
    expect(r).toHaveLength(1);
    expect(r[0].autor).toBe("Jensen Huang");
  });
});
