import { describe, expect, it } from "vitest";
import {
  alternarGramatica,
  gramaticaDoEixo,
  recortesSeguidosNoFim,
  TETO_DE_RECORTES_SEGUIDOS,
} from "./ritmo-do-recorte";

/**
 * A segunda gramática de capa finalmente entra no feed.
 *
 * O `recorte_post` estava pronto e testado desde 16/09/2026 e nunca desenhou
 * uma peça: nenhum ponto da produção pedia a gramática, e o padrão era
 * "jornal". Faltava a decisão de QUANDO ele entra, e ela veio em 17/09: o eixo
 * decide, a alternância é a rede.
 */

const cabe = (eixo: string) => ({ eixo, cabeNoRecorte: true, temFoto: true });

describe("o eixo decide a gramática", () => {
  it("os eixos que comentam nascem no recorte", () => {
    for (const eixo of ["custo_de_vida", "trabalho", "cultura", "tecnologia"]) {
      expect(gramaticaDoEixo(eixo), eixo).toBe("recorte");
    }
  });

  /**
   * Fato com data e efeito pede a peça que afirma. Uma decisão judicial ou o
   * Fed mexendo no juro não é comentário.
   */
  it("os eixos que afirmam ficam no jornal", () => {
    for (const eixo of ["politica", "seguranca", "imigracao", "economia", "brasil", "outro"]) {
      expect(gramaticaDoEixo(eixo), eixo).toBe("jornal");
    }
  });

  it("sem eixo, jornal: é a gramática que aceita qualquer tamanho de texto", () => {
    expect(gramaticaDoEixo("")).toBe("jornal");
    expect(gramaticaDoEixo(null)).toBe("jornal");
    expect(gramaticaDoEixo(undefined)).toBe("jornal");
  });
});

describe("a alternância é a rede", () => {
  it("dois recortes seguidos passam, o terceiro vira jornal", () => {
    const leva = alternarGramatica(
      [cabe("cultura"), cabe("trabalho"), cabe("tecnologia"), cabe("custo_de_vida")],
      0,
    );
    expect(leva).toEqual(["recorte", "recorte", "jornal", "recorte"]);
  });

  it("o teto é dois, e está declarado", () => {
    expect(TETO_DE_RECORTES_SEGUIDOS).toBe(2);
  });

  /**
   * O estado vem do feed e não da leva. Sem ele, cada execução recomeçaria a
   * contagem e três recortes se encostariam na virada do dia, que é
   * exatamente onde o leitor percebe repetição.
   */
  it("o feed que já termina no teto força o jornal na primeira peça", () => {
    expect(alternarGramatica([cabe("cultura"), cabe("trabalho")], 2)).toEqual([
      "jornal",
      "recorte",
    ]);
  });

  it("um jornal no meio zera a contagem", () => {
    const leva = alternarGramatica(
      [cabe("cultura"), cabe("politica"), cabe("trabalho"), cabe("tecnologia")],
      0,
    );
    expect(leva).toEqual(["recorte", "jornal", "recorte", "recorte"]);
  });

  /**
   * Caber é condição necessária, não suficiente, e a recíproca também vale:
   * não caber derruba mesmo quando a editoria pede. Quem mede é
   * `gramaticaEfetiva`, no módulo da arte, porque o orçamento de caracteres é
   * propriedade do desenho.
   */
  it("o que não cabe no recorte sai em jornal, mesmo com o eixo pedindo", () => {
    const leva = alternarGramatica(
      [{ eixo: "cultura", cabeNoRecorte: false, temFoto: true }, cabe("trabalho")],
      0,
    );
    expect(leva).toEqual(["jornal", "recorte"]);
  });

  it("uma leva inteira de eixos que afirmam não produz recorte nenhum", () => {
    const leva = alternarGramatica([cabe("politica"), cabe("imigracao"), cabe("economia")], 0);
    expect(leva).toEqual(["jornal", "jornal", "jornal"]);
  });

  /**
   * Descoberto renderizando: sem foto, o gancho de 65 caracteres deixa dois
   * terços da peça em branco, porque o bloco de texto do recorte é faixa fixa
   * e o tipo não cresce. Sem foto quem desenha é a capa tipográfica do jornal.
   */
  it("sem foto não há recorte, mesmo com eixo e espaço sobrando", () => {
    const leva = alternarGramatica(
      [
        { eixo: "cultura", cabeNoRecorte: true, temFoto: false },
        { eixo: "trabalho", cabeNoRecorte: true, temFoto: true },
      ],
      0,
    );
    expect(leva).toEqual(["jornal", "recorte"]);
  });
});

describe("a contagem lida do feed", () => {
  it("conta os recortes colados no fim e para no primeiro jornal", () => {
    expect(
      recortesSeguidosNoFim([
        { gramatica: "recorte" },
        { gramatica: "recorte" },
        { gramatica: "jornal" },
        { gramatica: "recorte" },
      ]),
    ).toBe(2);
  });

  /**
   * Peça anterior a 18/09/2026 não tem o campo gravado, e ausência conta como
   * jornal: era a única gramática que existia na prática. O efeito é permitir
   * o recorte a seguir, que é o lado neutro do erro.
   */
  it("registro ausente conta como jornal", () => {
    expect(recortesSeguidosNoFim([{}, {}])).toBe(0);
    expect(recortesSeguidosNoFim([{ gramatica: null }])).toBe(0);
  });

  it("feed vazio começa do zero", () => {
    expect(recortesSeguidosNoFim([])).toBe(0);
  });
});
