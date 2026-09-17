import { describe, expect, it } from "vitest";
import { foraDaCobertura } from "./wikidata";
import { ehCodigoDeProgramaOuFormulario } from "./entidade-visual";
import { consultaConceitual } from "./conceitual";

/**
 * O caso que originou as quatro correções, em 17/09/2026.
 *
 * Dois posts ficaram agendados com imagem incoerente e foram retirados da fila
 * pelo dono antes de publicar:
 *
 *   PERM       "Quem busca contratação permanente depende da prova da empresa
 *              no PERM" saiu com a Escola Superior de Economia da cidade de
 *              Perm, na Rússia, com letreiro em cirílico.
 *   SUPREMA    "Certos imigrantes detidos indefinidamente ainda podem pedir
 *      CORTE   audiência de fiança" saiu com um skyline genérico de Manhattan.
 *
 * Os dois registraram `semanticContextFit: 100`, a nota máxima, porque esse
 * número nunca mediu o que o nome promete: ele vale 100 quando o detector de
 * polaridade fica calado.
 *
 * Cada teste aqui prende uma das quatro correções ao caso real que a motivou.
 */

describe("veto geográfico: a cidade de Perm não ilustra o programa PERM", () => {
  it("entidade que declara país fora da cobertura sai antes de pontuar", () => {
    // Q159 é a Rússia. A cidade de Perm declara P17 = Q159.
    expect(foraDaCobertura({ pais: ["Q159"] })).toBe(true);
  });

  it("os dois países da publicação passam", () => {
    expect(foraDaCobertura({ pais: ["Q30"] })).toBe(false);
    expect(foraDaCobertura({ pais: ["Q155"] })).toBe(false);
  });

  /**
   * A ausência de P17 não é evidência contra.
   *
   * Boa parte das organizações não declara país no Wikidata, e exigir o campo
   * recusaria material legítimo. Quem cobre esse caso é a conferência visual.
   */
  it("entidade sem país declarado continua na disputa", () => {
    expect(foraDaCobertura({ pais: [] })).toBe(false);
  });

  /**
   * A penalidade antiga somava 60 contra um limiar de 55, e a cidade russa
   * passava por cinco pontos. Como o veto agora acontece ANTES da pontuação,
   * não existe soma que traga o candidato de volta.
   */
  it("é veto, e não desconto: nenhuma soma reverte", () => {
    const perm = { pais: ["Q159"] };
    expect(foraDaCobertura(perm)).toBe(true);
  });
});

describe("código de programa não vira entidade visual", () => {
  /** Os 27 valores de `programa` do catálogo evergreen, em 17/09/2026. */
  const CODIGOS_DO_CATALOGO = [
    "B-1/B-2", "CR1/IR1", "E-2 x EB-5", "E-2", "EAD", "EB", "EB-1A x EB-2 NIW",
    "EB-1A", "EB-2 NIW x EB-2 PERM", "EB-2 NIW", "EB-3", "EB-5", "F-1 OPT x H-1B",
    "F-1", "H-1B x O-1A", "H-1B", "I-485", "I-765", "I-864", "I-907", "IR5",
    "J-1", "L-1", "N-400", "O-1A", "PERM", "TN",
  ];

  it("bloqueia todos os códigos do catálogo", () => {
    for (const codigo of CODIGOS_DO_CATALOGO) {
      expect(ehCodigoDeProgramaOuFormulario(codigo), codigo).toBe(true);
    }
  });

  /**
   * O problema nunca foi o ramo de sigla do `ehNomeProprio`.
   *
   * Os 27 códigos começam com maiúscula, então todos passavam pelo PRIMEIRO
   * ramo do teste de nome próprio. Mexer só no `/^[A-Z]{2,6}$/` não consertaria
   * um único caso, e este teste existe para que ninguém tente de novo.
   */
  it("pega também os códigos que não são sigla pura", () => {
    for (const codigo of ["EB-2 NIW", "H-1B", "I-485", "O-1A", "F-1 OPT x H-1B"]) {
      expect(/^[A-Z]{2,6}$/.test(codigo), `${codigo} não é sigla pura`).toBe(false);
      expect(ehCodigoDeProgramaOuFormulario(codigo), codigo).toBe(true);
    }
  });

  /**
   * Sigla de ÓRGÃO continua passando, e é de propósito: ICE, USCIS e DOL são
   * instituições com sede, fachada e acervo de foto. Bloquear tudo que é sigla
   * custaria a foto certa em toda pauta de agência.
   */
  it("não bloqueia sigla de órgão", () => {
    for (const orgao of ["ICE", "USCIS", "DOL", "FBI", "NASA", "Supreme Court", "Departamento do Trabalho"]) {
      expect(ehCodigoDeProgramaOuFormulario(orgao), orgao).toBe(false);
    }
  });
});

describe("banco conceitual: o gatilho casa em inglês", () => {
  /**
   * O título real da Vox que produziu o skyline de Manhattan. O tema de
   * tribunal existia e tinha "corte", mas a fonte escreve "court".
   */
  const TITULO_DA_VOX =
    "The successful campaign to make a terrifying Supreme Court immigration case disappear";

  it("a pauta da Suprema Corte vai para o tribunal, não para o skyline", () => {
    const consulta = consultaConceitual(TITULO_DA_VOX, "", "EUA");
    expect(consulta).toContain("courthouse");
    expect(consulta).not.toContain("skyline");
  });

  it("o mesmo assunto em português continua indo para o tribunal", () => {
    const consulta = consultaConceitual(
      "Suprema Corte não ouve caso e mantém decisão sobre fiança",
      "",
      "EUA",
    );
    expect(consulta).toContain("courthouse");
  });

  /**
   * O casamento era substring pura, e "ice" casava dentro de "justice",
   * "police", "service", "office" e "notice". Com os termos em inglês isso
   * ficaria pior: "rent" dentro de "current", "form" dentro de "information".
   */
  it("gatilho curto não casa no meio de outra palavra", () => {
    const enganosos = [
      "Police release notice about the service center",
      "Justice department office issues new information",
      "The current different approach to reform",
    ];
    for (const titulo of enganosos) {
      const consulta = consultaConceitual(titulo, "", "EUA");
      expect(consulta, titulo).not.toContain("government building entrance");
      expect(consulta, titulo).not.toContain("suburban houses");
    }
  });

  it("radical em português continua pegando flexão", () => {
    expect(consultaConceitual("Imigrantes deportados em operação", "", "EUA")).toContain(
      "government building",
    );
    expect(consultaConceitual("Pedido de refugiada foi negado", "", "EUA")).toContain(
      "airport terminal",
    );
  });
});
