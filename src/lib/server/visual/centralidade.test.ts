import { describe, expect, it } from "vitest";
import { centralidadeDaEntidade, escolherPorCentralidade } from "./centralidade";
import type { EntidadeVisual } from "./tipos";

function ent(nome: string, tipo: EntidadeVisual["tipo"] = "institution"): EntidadeVisual {
  return {
    nome,
    normalizado: nome.toLowerCase(),
    tipo,
    qid: "Q1",
    imagemPrincipal: null,
    categoriaCommons: null,
    siteOficial: null,
    origem: "teste",
    confianca: 100,
    evidencias: [],
  };
}

describe("centralidade", () => {
  it("entidade do título vence menção secundária do corpo", () => {
    const r = escolherPorCentralidade([ent("Datafolha"), ent("Ibovespa")], {
      titulo: "Dólar fecha a R$ 5,1300 e Ibovespa recua",
      resumo: "O movimento veio depois de uma pesquisa Datafolha divulgada nesta sexta.",
      atores: ["Datafolha", "Ibovespa"],
    });

    expect(r.escolhida?.nome).toBe("Ibovespa");
    expect(r.nota?.motivo).toBe("citada no título");
  });

  it("agente do fato vence quem só é citado depois, mesmo sem estar no título", () => {
    const r = escolherPorCentralidade([ent("Deborah Boardman", "person"), ent("Casa Branca")], {
      titulo: "Juíza suspende ordem sobre cidadania por nascimento",
      resumo:
        "Uma juíza federal dos Estados Unidos, Deborah Boardman, suspendeu a ordem. " +
        "A Casa Branca havia apresentado a medida como combate ao turismo de nascimento.",
      atores: ["Deborah Boardman", "Casa Branca"],
    });

    expect(r.escolhida?.nome).toBe("Deborah Boardman");
    expect(r.nota?.motivo).toBe("ator principal da classificação");
  });

  it("três entidades igualmente centrais no título dão ambiguidade", () => {
    const r = escolherPorCentralidade([ent("Supremo Tribunal Federal"), ent("Polícia Federal"), ent("Congresso Nacional")], {
      titulo: "A crise institucional que alcançou STF, PF e Congresso Nacional",
      resumo: "A investigação atingiu os três poderes nesta semana.",
      atores: ["Supremo Tribunal Federal", "Polícia Federal", "Congresso Nacional"],
    });

    expect(r.escolhida).toBeNull();
    expect(r.ambigua).toBe(true);
    expect(r.detalhe).toContain("igualmente centrais");
  });

  it("entidade de contexto não vence só por ter Wikidata mais completo", () => {
    const r = escolherPorCentralidade([ent("Palácio do Planalto")], {
      titulo: "A crise institucional que alcançou STF, PF e Congresso",
      resumo: "Ministros divergiram publicamente e o Palácio do Planalto acompanhou o caso.",
      atores: ["Supremo Tribunal Federal"],
    });

    expect(r.escolhida).toBeNull();
    expect(r.ambigua).toBe(false);
    expect(r.detalhe).toContain("não vira o rosto da matéria");
  });

  it("entidade ausente do texto tem centralidade zero", () => {
    const n = centralidadeDaEntidade(ent("Tesla"), {
      titulo: "USCIS amplia prazo do EAD",
      resumo: "O órgão informou a mudança.",
      atores: ["USCIS"],
    });

    expect(n.valor).toBe(0);
  });

  it("sigla no título casa com o nome longo do Wikidata", () => {
    const n = centralidadeDaEntidade(ent("Supremo Tribunal Federal"), {
      titulo: "Supremo Tribunal Federal decide sobre a regra",
      resumo: "",
      atores: [],
    });

    expect(n.valor).toBe(100);
  });
});
