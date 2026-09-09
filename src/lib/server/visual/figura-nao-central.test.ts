import { describe, expect, it } from "vitest";
import { figuraNaoCentralNaImagem, pessoasDeclaradasNaImagem } from "./temporalidade";

/**
 * Pessoa identificável na imagem que não é assunto da pauta, em qualquer
 * contexto declarado.
 *
 * O caso que ficou aberto: uma pauta sobre dado de emprego recebeu a foto
 * "ASSA 2026 - David Wessel, Loretta Mester, Jason Furman, Karen Dynan.jpg",
 * com `image_context_type = institution`, `temporal_relevance = 100` e
 * `semantic_context_fit = 100`. Quatro pessoas identificáveis, nenhuma delas
 * assunto da pauta, e a guarda anterior não alcançava porque só olhava
 * `official_portrait` e `entity_portrait`.
 *
 * Nada aqui olha a imagem. O que se lê é o que o acervo escreveu: nome do
 * arquivo, descrição e categorias. Inferir quem está na foto pela aparência é
 * o que o projeto não faz.
 */

function asset(over: Record<string, unknown> = {}) {
  return {
    sourceAssetId: "File:Bureau of Labor Statistics headquarters.jpg",
    imageContextType: "institution",
    metadata: { descricao: "", categorias: "" },
    ...over,
  };
}

const PAUTA_DE_EMPREGO = ["Bureau of Labor Statistics", "EUA criam 162 mil empregos em agosto"];

describe("o caso do painel de congresso", () => {
  const PAINEL = asset({
    sourceAssetId: "File:ASSA 2026 - David Wessel, Loretta Mester, Jason Furman, Karen Dynan.jpg",
    imageContextType: "institution",
    metadata: { descricao: "Panel at the ASSA 2026 annual meeting.", categorias: "ASSA 2026|Economists" },
  });

  it("as quatro pessoas do nome do arquivo são detectadas", () => {
    const pessoas = pessoasDeclaradasNaImagem(PAINEL);
    expect(pessoas).toContain("David Wessel");
    expect(pessoas).toContain("Loretta Mester");
    expect(pessoas).toContain("Jason Furman");
    expect(pessoas).toContain("Karen Dynan");
  });

  it("é recusada apesar de estar classificada como institution", () => {
    const r = figuraNaoCentralNaImagem(PAINEL, PAUTA_DE_EMPREGO);
    expect(r.recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
    expect(r.detalhe).toContain("David Wessel");
    expect(r.detalhe).toContain("institution");
  });

  it("a mesma foto passa se a pauta for sobre uma dessas pessoas", () => {
    const r = figuraNaoCentralNaImagem(PAINEL, ["Loretta Mester", "Mester defende corte de juros"]);
    expect(r.recusa).toBeNull();
  });
});

describe("a regra vale em qualquer contexto declarado", () => {
  for (const contexto of ["institution", "place", "company", "conceptual", "exact_event"]) {
    it(`alcança ${contexto}`, () => {
      const r = figuraNaoCentralNaImagem(
        asset({
          sourceAssetId: "File:Nancy Pelosi visits the plant.jpg",
          imageContextType: contexto,
        }),
        PAUTA_DE_EMPREGO,
      );
      expect(r.recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
    });
  }
});

describe("o que a regra NÃO pode recusar", () => {
  it("fachada sem gente nenhuma no catálogo", () => {
    const r = figuraNaoCentralNaImagem(asset(), PAUTA_DE_EMPREGO);
    expect(r.recusa).toBeNull();
    expect(pessoasDeclaradasNaImagem(asset())).toEqual([]);
  });

  it("prédio batizado com nome de pessoa", () => {
    /*
     * Nos Estados Unidos quase todo prédio público leva nome de alguém. Sem
     * esta exceção, toda foto de fachada de órgão americano seria recusada.
     */
    for (const nome of [
      "File:Harry S. Truman Building.jpg",
      "File:Ronald Reagan Washington National Airport terminal.jpg",
      "File:Thurgood Marshall Courthouse exterior.jpg",
      "File:John F. Kennedy Library entrance.jpg",
    ]) {
      const r = figuraNaoCentralNaImagem(asset({ sourceAssetId: nome }), PAUTA_DE_EMPREGO);
      expect(r.recusa, nome).toBeNull();
    }
  });

  it("nome de órgão, de lugar e de programa não é nome de pessoa", () => {
    for (const nome of [
      "File:Federal Register volume 91.jpg",
      "File:Diversity Visa lottery form.jpg",
      "File:Supreme Court of the United States.jpg",
      "File:New York skyline at dusk.jpg",
      "File:White House north facade.jpg",
      "File:Department of Homeland Security seal.jpg",
      "File:National Law Review logo.png",
    ]) {
      expect(pessoasDeclaradasNaImagem(asset({ sourceAssetId: nome })), nome).toEqual([]);
    }
  });

  it("sobrenome basta para casar: a pauta escreve Rubio e o arquivo Marco Rubio", () => {
    const r = figuraNaoCentralNaImagem(
      asset({ sourceAssetId: "File:Marco Rubio official photo.jpg", imageContextType: "official_portrait" }),
      ["Marco Rubio anuncia mudança na política de vistos"],
    );
    expect(r.recusa).toBeNull();
  });
});

describe("a pessoa pode estar declarada fora do nome do arquivo", () => {
  it("na descrição", () => {
    const r = figuraNaoCentralNaImagem(
      asset({ metadata: { descricao: "Secretary Janet Yellen speaks at the event.", categorias: "" } }),
      PAUTA_DE_EMPREGO,
    );
    expect(r.recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
    expect(r.detalhe).toContain("Janet Yellen");
  });

  it("nas categorias do Commons", () => {
    const r = figuraNaoCentralNaImagem(
      asset({ metadata: { descricao: "", categorias: "Government buildings|Jerome Powell" } }),
      PAUTA_DE_EMPREGO,
    );
    expect(r.recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
  });
});
