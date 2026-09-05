import { describe, expect, it } from "vitest";
import {
  assinaturaDeTitulo,
  impressaoDoAcontecimento,
  mesmoAcontecimento,
  semelhancaDeTitulo,
} from "./fingerprint";

describe("assinatura de título", () => {
  it("é igual quando a ordem muda", () => {
    // É a reescrita que um "não repita" no prompt não pega.
    expect(assinaturaDeTitulo("Tesla abre fábrica no Texas")).toBe(
      assinaturaDeTitulo("Fábrica da Tesla abre no Texas"),
    );
  });

  it("ignora acento e pontuação", () => {
    expect(assinaturaDeTitulo("Decisão do STF: o que muda")).toBe(
      assinaturaDeTitulo("decisao do stf o que muda"),
    );
  });

  it("distingue assuntos diferentes", () => {
    expect(assinaturaDeTitulo("Tesla abre fábrica no Texas")).not.toBe(
      assinaturaDeTitulo("Apple abre loja na Flórida"),
    );
  });
});

describe("semelhança de título", () => {
  it("reconhece a mesma notícia reescrita", () => {
    const s = semelhancaDeTitulo(
      "Tesla anuncia nova fábrica no Texas",
      "Tesla confirma fábrica nova no Texas",
    );
    expect(s).toBeGreaterThan(0.6);
  });

  it("separa notícias de assuntos distintos", () => {
    const s = semelhancaDeTitulo(
      "Tesla anuncia nova fábrica no Texas",
      "STF julga reforma tributária nesta semana",
    );
    expect(s).toBeLessThan(0.2);
  });

  it("não quebra com texto vazio", () => {
    expect(semelhancaDeTitulo("", "qualquer coisa")).toBe(0);
  });
});

describe("impressão do acontecimento", () => {
  const tesla = {
    atores: ["Tesla"],
    lugares: ["Texas"],
    acontecimento: ["fábrica"],
  };

  it("é estável para a mesma combinação escrita de outro jeito", () => {
    expect(impressaoDoAcontecimento(tesla)).toBe(
      impressaoDoAcontecimento({ atores: ["tesla"], lugares: ["texas"], acontecimento: ["Fábrica"] }),
    );
  });

  it("reconhece a mesma notícia com titulo reescrito", () => {
    // O caso do enunciado: quase nenhuma palavra em comum, mesmo fato.
    const outro = { atores: ["Tesla"], lugares: ["Texas"], acontecimento: ["unidade", "fábrica"] };
    expect(mesmoAcontecimento(tesla, outro)).toBe(true);
  });

  it("o mesmo ator em fatos diferentes não é repetição", () => {
    // "Tesla" sozinha aparece em dezenas de notícias distintas.
    const recall = { atores: ["Tesla"], lugares: ["Califórnia"], acontecimento: ["recall"] };
    expect(mesmoAcontecimento(tesla, recall)).toBe(false);
  });

  it("dispensa o lugar quando um dos lados não declara nenhum", () => {
    // Decisão nacional costuma vir sem lugar, e é o tipo que mais se repete.
    const a = { atores: ["STF"], lugares: [], acontecimento: ["julgamento"] };
    const b = { atores: ["STF"], lugares: ["Brasília"], acontecimento: ["julgamento"] };
    expect(mesmoAcontecimento(a, b)).toBe(true);
  });
});
