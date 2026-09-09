import { describe, expect, it } from "vitest";
import { CATALOGO_EVERGREEN } from "./catalogo";
import { ehFonteCanonica } from "./grounding";
import { identidadeDoItem, todosOsItens } from "./tipos";

/**
 * O catálogo é o maior artefato desta fase, e o que mais tende a derivar.
 *
 * Ele foi escrito uma vez com as URLs conferidas por requisição. A partir de
 * agora, quem acrescentar um tópico à mão pode colar uma fonte que não é
 * oficial, repetir um id, ou trazer justamente o tipo de assunto que vence em
 * duas semanas. Estes testes são a régua que sobra depois de a conferência
 * manual acabar.
 */

const ITENS = todosOsItens(CATALOGO_EVERGREEN);

describe("volume", () => {
  it("tem estoque para o giro não repetir", () => {
    /*
     * Com cooldown de 30 dias por par e janela de 7 dias por tópico, um
     * catálogo pequeno esgota e o seletor devolve dia vazio. O pedido era 40 a
     * 60 tópicos e ao menos 100 combinações.
     */
    expect(CATALOGO_EVERGREEN.length).toBeGreaterThanOrEqual(40);
    expect(ITENS.length).toBeGreaterThanOrEqual(100);
  });

  it("as sete famílias estão representadas", () => {
    const familias = new Set(CATALOGO_EVERGREEN.map((t) => t.familia));
    for (const f of [
      "visa_explainer",
      "glossary",
      "faq",
      "comparison",
      "process_explainer",
      "evidence_education",
      "professional_education",
    ]) {
      expect(familias, f).toContain(f);
    }
  });

  it("nenhuma família domina o catálogo", () => {
    // Se uma família tiver metade do estoque, ela vence todo desempate.
    for (const f of new Set(CATALOGO_EVERGREEN.map((t) => t.familia))) {
      const quantos = CATALOGO_EVERGREEN.filter((t) => t.familia === f).length;
      expect(quantos / CATALOGO_EVERGREEN.length, f).toBeLessThan(0.4);
    }
  });
});

describe("identidade", () => {
  it("ids de tópico não repetem", () => {
    const ids = CATALOGO_EVERGREEN.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ângulos não repetem dentro do tópico", () => {
    for (const t of CATALOGO_EVERGREEN) {
      const ids = t.angulos.map((a) => a.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
    }
  });

  it("a identidade de cada item é única e tem o prefixo que o store reconhece", () => {
    // `evg:` é o que faz `resolverOrigem` marcar origin_channel = evergreen.
    const chaves = ITENS.map(identidadeDoItem);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const c of chaves) expect(c.startsWith("evg:")).toBe(true);
  });

  it("todo tópico tem ao menos um ângulo", () => {
    for (const t of CATALOGO_EVERGREEN) expect(t.angulos.length, t.id).toBeGreaterThan(0);
  });
});

describe("fontes", () => {
  it("toda fonte é de domínio oficial", () => {
    for (const t of CATALOGO_EVERGREEN) {
      expect(t.fontesCanonicas.length, t.id).toBeGreaterThan(0);
      for (const u of t.fontesCanonicas) {
        expect(ehFonteCanonica(u), `${t.id}: ${u}`).toBe(true);
      }
    }
  });

  it("nenhuma fonte é notícia", () => {
    // Matéria descreve o estado de um dia; o evergreen afirma o que vale em geral.
    for (const t of CATALOGO_EVERGREEN) {
      for (const u of t.fontesCanonicas) {
        for (const proibido of ["news.google", "jdsupra", "natlawreview", "g1.globo", "cnbc"]) {
          expect(u, t.id).not.toContain(proibido);
        }
      }
    }
  });
});

describe("o que não pode entrar no catálogo", () => {
  /**
   * Duas exceções conferidas à mão, e o motivo fica escrito para ninguém
   * relitigar: o tópico do Visa Bulletin trata do MECANISMO e declara no resumo
   * que nunca olha o número do mês; o da taxa de imigrante trata da EXISTÊNCIA
   * da etapa, sem valor nenhum. Os dois foram autorizados explicitamente.
   */
  const EXCECOES = new Set(["visa-bulletin-como-funciona", "taxa-de-imigrante-uscis"]);

  it("nenhum tópico promete informação que vence em semanas", () => {
    const VENCE = ["atual", "deste mês", "do mês", "prazo de processamento", "tempo de espera", "valor da taxa"];

    for (const t of CATALOGO_EVERGREEN) {
      if (EXCECOES.has(t.id)) continue;
      const texto = `${t.id} ${t.nome} ${t.resumo}`.toLowerCase();
      for (const v of VENCE) expect(texto, `${t.id} contém "${v}"`).not.toContain(v);
    }
  });

  it("nenhum ângulo pergunta por número, prazo ou valor de agora", () => {
    const VENCE = ["quanto custa hoje", "qual o prazo atual", "quanto tempo demora hoje", "qual a taxa hoje"];
    for (const item of ITENS) {
      const p = item.angulo.pergunta.toLowerCase();
      for (const v of VENCE) expect(p, identidadeDoItem(item)).not.toContain(v);
    }
  });

  it("nenhum ângulo afirma elegibilidade individual", () => {
    /*
     * "Você se qualifica" é aconselhamento jurídico individual, e nem o
     * catálogo nem a copy podem dizer isso. A pergunta pode ser sobre o
     * caminho, nunca sobre a pessoa.
     */
    for (const item of ITENS) {
      const p = item.angulo.pergunta.toLowerCase();
      for (const v of ["você se qualifica", "voce se qualifica", "você tem direito", "é garantido"]) {
        expect(p, identidadeDoItem(item)).not.toContain(v);
      }
    }
  });
});

describe("diversidade disponível", () => {
  it("há programas suficientes para o teto por programa não travar o dia", () => {
    const programas = new Set(
      CATALOGO_EVERGREEN.map((t) => t.programa?.trim()).filter((p): p is string => Boolean(p)),
    );
    // Com teto de 2 por programa e 10 vagas, cinco programas já bastariam.
    expect(programas.size).toBeGreaterThanOrEqual(8);
  });

  it("há tópicos sem programa, que são os que sustentam o dia monotema", () => {
    // Glossário e processo não têm programa, então não disputam aquele teto.
    const semPrograma = CATALOGO_EVERGREEN.filter((t) => !t.programa?.trim());
    expect(semPrograma.length).toBeGreaterThanOrEqual(10);
  });
});
