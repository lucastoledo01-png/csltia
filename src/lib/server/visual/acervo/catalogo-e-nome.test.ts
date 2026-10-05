import { describe, expect, it } from "vitest";
import {
  CATALOGO_DE_CENAS,
  GRUPOS_DO_ACERVO,
  TAGS_DO_CATALOGO,
  cardapioParaOModelo,
  paisDoAcervo,
  tagDoCatalogo,
} from "./catalogo-de-cenas";
import { lerNomeDoArquivo } from "./nome-do-arquivo";
import { consultaProibida } from "../cena-da-pauta";
import { capacidadeDoAcervo } from "./modo";

/**
 * O catálogo e o nome do arquivo são o formulário que ninguém preenche
 * (decisão de 29/09/2026). Se o catálogo tiver um nome com hífen, o arquivo
 * daquela cena nunca é lido direito; se o nome aceitar terceiro país, a régua
 * de país deixa de existir. Os dois lados são cobrados aqui.
 */

describe("o catálogo de cenas", () => {
  it("todo grupo e toda cena cabem no nome do arquivo: minúsculas ASCII, '_' e nunca hífen", () => {
    for (const g of GRUPOS_DO_ACERVO) {
      expect(g).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
      for (const a of CATALOGO_DE_CENAS[g] as readonly string[]) {
        expect(a).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
      }
    }
  });

  it("tem por volta de 40 grupos, como o guia do designer", () => {
    expect(GRUPOS_DO_ACERVO.length).toBeGreaterThanOrEqual(38);
    expect(GRUPOS_DO_ACERVO.length).toBeLessThanOrEqual(45);
  });

  it("nenhuma cena pede pessoa ou placa, as duas proibições do dono", () => {
    for (const tag of TAGS_DO_CATALOGO) {
      const assunto = tag.split("/")[1].replace(/_/g, " ");
      expect(consultaProibida(assunto), tag).toBeNull();
    }
  });

  it("e a varredura acusaria de verdade uma cena proibida", () => {
    // Sem este caso, uma varredura que nunca acusa é igual a uma que não confere.
    expect(consultaProibida("crowd protest")).not.toBeNull();
  });

  it("retrato não está no cardápio do modelo: pessoa só sai pela entidade", () => {
    expect(cardapioParaOModelo()).not.toContain("pessoas/");
    expect(TAGS_DO_CATALOGO.some((t) => t.startsWith("pessoas/"))).toBe(false);
  });

  it("tag fora do cardápio é recusada", () => {
    expect(tagDoCatalogo("moradia/rua_residencial")).toBe(true);
    expect(tagDoCatalogo("moradia/castelo")).toBe(false);
    expect(tagDoCatalogo("moradia")).toBe(false);
  });

  it("o país da pauta vira o código do arquivo, com os EUA como padrão", () => {
    expect(paisDoAcervo("Brasil")).toBe("br");
    expect(paisDoAcervo("EUA")).toBe("eua");
    expect(paisDoAcervo(undefined)).toBe("eua");
  });
});

describe("o nome do arquivo é o metadado", () => {
  it("lê grupo, país, assunto, detalhe e número", () => {
    const r = lerNomeDoArquivo("/pasta/moradia-eua-rua_residencial-outono-03.jpg");
    expect(r).toEqual({
      ok: true,
      nome: {
        arquivo: "moradia-eua-rua_residencial-outono-03.jpg",
        grupo: "moradia",
        pais: "eua",
        assunto: "rua_residencial",
        detalhe: "outono",
        numero: 3,
        tag: "moradia/rua_residencial",
        noCatalogo: true,
      },
    });
  });

  it("detalhe com mais de um pedaço cai inteiro no detalhe", () => {
    const r = lerNomeDoArquivo("moradia-eua-casa_suburbio-neve-manha-02.jpg");
    expect(r.ok && r.nome.detalhe).toBe("neve-manha");
  });

  it("cena de terceiro país é recusada", () => {
    const r = lerNomeDoArquivo("moradia-pt-rua_residencial-lisboa-01.jpg");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("terceiro país");
  });

  it("retrato de pessoa feito fora da cobertura entra: a régua de país não vale para gente", () => {
    const r = lerNomeDoArquivo("pessoas-fr-emmanuel_macron-retrato-01.jpg");
    expect(r.ok).toBe(true);
  });

  it("grupo brasileiro com país americano é contradição e é recusado", () => {
    expect(lerNomeDoArquivo("brasil_cidades-eua-sao_paulo-avenida-01.jpg").ok).toBe(false);
  });

  it("grupo inexistente, campo com acento, campo faltando e número ausente são recusados", () => {
    expect(lerNomeDoArquivo("castelos-eua-torre-alta-01.jpg").ok).toBe(false);
    expect(lerNomeDoArquivo("moradia-eua-imóveis-rua-01.jpg").ok).toBe(false);
    expect(lerNomeDoArquivo("moradia-eua-rua_residencial-01.jpg").ok).toBe(false);
    expect(lerNomeDoArquivo("moradia-eua-rua_residencial-outono-xx.jpg").ok).toBe(false);
    expect(lerNomeDoArquivo("moradia-eua-rua_residencial-outono-01.txt").ok).toBe(false);
  });

  it("assunto fora do cardápio é aceito e marcado: só a entidade o alcança", () => {
    const r = lerNomeDoArquivo("politica_eua-eua-federal_reserve-fachada-01.jpg");
    expect(r.ok && r.nome.noCatalogo).toBe(false);
  });
});

describe("a capacidade acervo", () => {
  it("não declarada é off: o comportamento de antes", () => {
    expect(capacidadeDoAcervo(null)).toBe("off");
    expect(capacidadeDoAcervo({ settings: { capacidades: { evergreen: "off" } } })).toBe("off");
  });

  it("declarada vale", () => {
    expect(capacidadeDoAcervo({ settings: { capacidades: { acervo: "dry_run" } } })).toBe("dry_run");
    expect(capacidadeDoAcervo({ settings: { capacidades: { acervo: " Enforce " } } })).toBe("enforce");
  });

  it("erro de digitação vira off, nunca enforce", () => {
    expect(capacidadeDoAcervo({ settings: { capacidades: { acervo: "enforced" } } })).toBe("off");
    expect(capacidadeDoAcervo({ settings: { capacidades: { acervo: true } } })).toBe("off");
  });
});
