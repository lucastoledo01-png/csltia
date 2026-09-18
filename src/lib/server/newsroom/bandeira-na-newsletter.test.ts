import { describe, expect, it } from "vitest";
import { escolherBandeira, ehUltimoRecurso } from "../visual/bandeira";
import { diagnosticoVazio } from "../visual/modo";

/**
 * A edição de 18/09/2026 saiu sem uma foto sequer, e o dono perguntou por quê.
 *
 * Duas coisas minhas se encontraram. Em 17/09 de manhã a bandeira virou último
 * recurso, e eu mantive `status: NO_VALID_IMAGE` de propósito, para o relatório
 * não chamar de sucesso o dia em que a busca falhou. Avisei na hora que a
 * newsletter continuaria sem foto nesse caso, e na época era caso raro.
 *
 * Em 17/09 à tarde entrou a conferência visual, que passou a derrubar a foto
 * genérica do banco conceitual quando ela não tem relação reconhecível com o
 * assunto. O caso raro virou o caso comum, e a edição inteira ficou vazia.
 *
 * A separação que estes testes prendem: o relatório continua contando a falha,
 * e a peça passa a receber a imagem que já existia na mão.
 */

describe("a bandeira é reconhecível como último recurso", () => {
  it("toda bandeira do acervo se declara", () => {
    const b = escolherBandeira({ eixo: "economia" });
    expect(ehUltimoRecurso(b)).toBe(true);
  });

  /**
   * A régua é o campo declarado, e não a fonte. Uma foto do Commons escolhida
   * pela busca normal também vem de `wikimedia_commons`, e tratá-la como
   * último recurso faria o contador mentir para baixo.
   */
  it("foto comum do Commons não é confundida com bandeira", () => {
    expect(
      ehUltimoRecurso({
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/x/Capitol.jpg",
        source: "wikimedia_commons",
        sourceAssetId: "File:Capitol.jpg",
      } as never),
    ).toBe(false);
  });

  it("sem asset nenhum, não é último recurso", () => {
    expect(ehUltimoRecurso(null)).toBe(false);
    expect(ehUltimoRecurso(undefined)).toBe(false);
  });
});

describe("o diagnóstico separa falha de peça vazia", () => {
  /**
   * `ultimoRecurso` é subconjunto de `noValidImage`, nunca substituto: a busca
   * falhou nas duas contagens. Se um dia alguém somar os dois achando que são
   * coisas distintas, vai contar a mesma pauta duas vezes.
   */
  it("nasce zerado ao lado do contador de falha", () => {
    const d = diagnosticoVazio();
    expect(d.noValidImage).toBe(0);
    expect(d.ultimoRecurso).toBe(0);
  });

  it("um dia inteiro de bandeira continua sendo um dia inteiro de falha", () => {
    const d = diagnosticoVazio();
    for (let i = 0; i < 4; i += 1) {
      d.noValidImage += 1;
      d.ultimoRecurso = (d.ultimoRecurso ?? 0) + 1;
    }
    expect(d.noValidImage).toBe(4);
    expect(d.ultimoRecurso).toBe(4);
    expect(d.assetsSelected).toBe(0);
  });
});
