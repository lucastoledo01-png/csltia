import { describe, expect, it } from "vitest";
import { CATALOGO_EVERGREEN } from "./catalogo";
import { DOMINIOS_CANONICOS, ehFonteCanonica } from "./grounding";
import { identidadeDoItem, todosOsItens } from "./tipos";
import { EDITORIAS } from "../../../editorias";
import { temaPeloSlug } from "../../../temas";
import { CONFIG_PADRAO } from "./selecao";

/**
 * O catálogo é o maior artefato desta fase, e o que mais tende a derivar.
 *
 * Ele foi escrito com as URLs conferidas por requisição (06/10/2026, catálogo
 * da linha sem imigração). A partir de agora, quem acrescentar um tópico à mão
 * pode colar uma fonte que não é oficial, repetir um id, trazer de volta um
 * assunto de visto ou um tema fora da lista fechada. Estes testes são a régua
 * que sobra depois de a conferência manual acabar.
 */

const ITENS = todosOsItens(CATALOGO_EVERGREEN);

describe("volume", () => {
  it("tem de 40 a 60 tópicos, cada um com 2 a 4 ângulos", () => {
    expect(CATALOGO_EVERGREEN.length).toBeGreaterThanOrEqual(40);
    expect(CATALOGO_EVERGREEN.length).toBeLessThanOrEqual(60);
    for (const t of CATALOGO_EVERGREEN) {
      expect(t.angulos.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.angulos.length, t.id).toBeLessThanOrEqual(4);
    }
    expect(ITENS.length).toBeGreaterThanOrEqual(100);
  });

  it("sustenta o teto do dia com a janela de 30 dias por tópico", () => {
    /*
     * Com o tópico fora por 30 dias, o regime permanente é tópicos / 30. Se o
     * teto do dia passar disso, o catálogo seca em dias de pouca notícia e o
     * feed cai para zero no meio do mês.
     */
    expect(CONFIG_PADRAO.janelaDoTopicoEmDias).toBe(30);
    expect(CATALOGO_EVERGREEN.length / CONFIG_PADRAO.janelaDoTopicoEmDias).toBeGreaterThanOrEqual(
      CONFIG_PADRAO.maximoNoDia,
    );
  });

  it("todas as editorias do portal têm tópico", () => {
    const editorias = new Set(CATALOGO_EVERGREEN.map((t) => t.editoria));
    for (const e of EDITORIAS) expect(editorias, e.id).toContain(e.id);
  });

  it("as cinco famílias estão representadas", () => {
    const familias = new Set(CATALOGO_EVERGREEN.map((t) => t.familia));
    for (const f of ["explainer", "glossary", "faq", "comparison", "process_explainer"]) {
      expect(familias, f).toContain(f);
    }
  });

  it("nenhuma editoria domina o catálogo", () => {
    for (const e of new Set(CATALOGO_EVERGREEN.map((t) => t.editoria))) {
      const quantos = CATALOGO_EVERGREEN.filter((t) => t.editoria === e).length;
      expect(quantos / CATALOGO_EVERGREEN.length, e).toBeLessThan(0.35);
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
});

describe("temas da lista fechada", () => {
  it("todo tópico tem de 1 a 3 temas, e todo tema existe em src/lib/temas.ts", () => {
    for (const t of CATALOGO_EVERGREEN) {
      expect(t.temas.length, t.id).toBeGreaterThanOrEqual(1);
      expect(t.temas.length, t.id).toBeLessThanOrEqual(3);
      for (const slug of t.temas) expect(temaPeloSlug(slug), `${t.id}: ${slug}`).not.toBeNull();
    }
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

  it("os domínios de imigração saíram da lista", () => {
    for (const d of ["uscis.gov", "travel.state.gov", "state.gov", "cbp.gov", "ice.gov", "dhs.gov"]) {
      expect(DOMINIOS_CANONICOS as readonly string[], d).not.toContain(d);
      expect(ehFonteCanonica(`https://www.${d}/qualquer`), d).toBe(false);
    }
  });

  it("domínio parecido não passa por sufixo", () => {
    expect(ehFonteCanonica("https://www.bls.gov/cpi/")).toBe(true);
    expect(ehFonteCanonica("https://fiscaldata.treasury.gov/x")).toBe(true);
    expect(ehFonteCanonica("https://www.gov.br/receitafederal")).toBe(true);
    expect(ehFonteCanonica("https://fakebls.gov/cpi/")).toBe(false);
    expect(ehFonteCanonica("https://bls.gov.evil.com/")).toBe(false);
  });

  it("o Brasil entra só como contraste: fonte gov.br só aparece ao lado de fonte americana", () => {
    for (const t of CATALOGO_EVERGREEN) {
      const brasileiras = t.fontesCanonicas.filter((u) => new URL(u).hostname.endsWith("gov.br"));
      if (brasileiras.length === 0) continue;
      expect(t.editoria, t.id).toBe("brasil");
      expect(t.fontesCanonicas.length, t.id).toBeGreaterThan(brasileiras.length);
    }
  });

  it("nenhuma fonte é notícia", () => {
    for (const t of CATALOGO_EVERGREEN) {
      for (const u of t.fontesCanonicas) {
        for (const proibido of ["news.google", "jdsupra", "natlawreview", "g1.globo", "cnbc", "/newsroom/press-releases"]) {
          expect(u, t.id).not.toContain(proibido);
        }
      }
    }
  });
});

describe("o que não pode entrar no catálogo", () => {
  it("nenhum tópico nem ângulo é de imigração", () => {
    /*
     * Imigração saiu da pauta em 05/10/2026, e o catálogo anterior era todo
     * dela. A lista é de palavras que só aparecem quando o assunto é visto,
     * status ou processo migratório.
     */
    const PROIBIDAS = [
      /\bvistos?\b/, /\bvisas?\b/, /green card/, /\buscis\b/, /\bimigra/, /\bcidadania\b/, /\bnaturaliza/,
      /\bdeporta/, /\basilo\b/, /\brefugi/, /\bh-1b\b/, /\beb-[1-5]/, /\bo-1/, /\bf-1\b/, /\bconsulado/,
      /\bembaixada/, /\bfronteira/, /\bborder\b/, /\bdaca\b/, /\btps\b/, /status migrat/,
    ];
    for (const item of ITENS) {
      const texto = `${item.topico.id} ${item.topico.nome} ${item.topico.resumo} ${item.topico.programa ?? ""} ${item.angulo.pergunta}`.toLowerCase();
      for (const p of PROIBIDAS) {
        expect(p.test(texto), `${identidadeDoItem(item)} casa ${p}`).toBe(false);
      }
    }
  });

  it("nenhum tópico promete informação que vence em semanas", () => {
    const VENCE = ["atual", "deste mês", "do mês", "prazo de processamento", "tempo de espera", "cotação", "hoje"];
    for (const t of CATALOGO_EVERGREEN) {
      const texto = `${t.id} ${t.nome} ${t.resumo}`.toLowerCase();
      for (const v of VENCE) expect(texto, `${t.id} contém "${v}"`).not.toContain(v);
    }
  });

  it("nenhum ângulo pergunta por número, prazo ou valor de agora", () => {
    const VENCE = ["quanto custa hoje", "qual o prazo atual", "quanto tempo demora hoje", "qual a taxa hoje", "este ano", "esta semana"];
    for (const item of ITENS) {
      const p = item.angulo.pergunta.toLowerCase();
      for (const v of VENCE) expect(p, identidadeDoItem(item)).not.toContain(v);
    }
  });

  it("nenhum ângulo afirma elegibilidade individual", () => {
    for (const item of ITENS) {
      const p = item.angulo.pergunta.toLowerCase();
      for (const v of ["você se qualifica", "voce se qualifica", "você tem direito", "é garantido"]) {
        expect(p, identidadeDoItem(item)).not.toContain(v);
      }
    }
  });

  it("nada de travessão", () => {
    for (const item of ITENS) {
      const texto = `${item.topico.nome} ${item.topico.resumo} ${item.angulo.pergunta}`;
      expect(texto.includes("\u2014"), identidadeDoItem(item)).toBe(false);
    }
  });
});

describe("diversidade disponível", () => {
  it("há programas suficientes para o teto por programa não travar o dia", () => {
    const programas = new Set(
      CATALOGO_EVERGREEN.map((t) => t.programa?.trim()).filter((p): p is string => Boolean(p)),
    );
    expect(programas.size).toBeGreaterThanOrEqual(20);
  });

  it("a entidade que vai para a busca de foto é instituição, nunca código de programa", () => {
    // A lição da sigla PERM: código mandado como ator achou uma cidade russa.
    for (const t of CATALOGO_EVERGREEN) {
      if (!t.entidade) continue;
      expect(t.entidade.split(/\s+/).length, `${t.id}: ${t.entidade}`).toBeGreaterThanOrEqual(1);
      expect(/\d/.test(t.entidade), `${t.id}: ${t.entidade}`).toBe(false);
      expect(t.entidade, t.id).not.toBe(t.programa);
    }
  });
});
