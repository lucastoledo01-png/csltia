import { describe, expect, it, vi } from "vitest";
import { resolverEntidadeNoWikidata } from "./wikidata";

/**
 * Wikidata falso reproduzindo o caso real.
 *
 * Buscar "Washington" devolve o ESTADO e cidades homônimas. Washington, D.C.
 * não aparece na busca: ela só é alcançável perguntando qual é a capital do
 * país (P36). É por isso que a desambiguação não pode ser só reordenar
 * candidatos.
 */
function wikidataFalso() {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);
    const params = new URL(url).searchParams;

    if (params.get("action") === "wbsearchentities") {
      return new Response(
        JSON.stringify({
          search: [
            { id: "Q1223", label: "Washington", description: "estado dos Estados Unidos" },
            { id: "Q594697", label: "Washington", description: "city in Washington County, Pennsylvania" },
          ],
        }),
        { status: 200 }
      );
    }

    const ids = (params.get("ids") ?? "").split("|");

    // Rótulo da capital.
    if (params.get("props") === "labels") {
      return new Response(
        JSON.stringify({ entities: { Q61: { labels: { pt: { value: "Washington, D.C." } } } } }),
        { status: 200 }
      );
    }

    const entities: Record<string, { claims: Record<string, unknown> }> = {};
    for (const id of ids) {
      if (id === "Q30") {
        entities.Q30 = { claims: { P36: [{ mainsnak: { datavalue: { value: { id: "Q61" } } } }] } };
      } else if (id === "Q61") {
        entities.Q61 = {
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: "Q5119" } } } }],
            P18: [{ mainsnak: { datavalue: { value: "Washington DC.jpg" } } }],
            P373: [{ mainsnak: { datavalue: { value: "Washington, D.C." } } }],
            P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
          },
        };
      } else if (id === "Q1223") {
        entities.Q1223 = {
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: "Q35657" } } } }],
            P18: [{ mainsnak: { datavalue: { value: "Puget Sound.jpg" } } }],
            P373: [{ mainsnak: { datavalue: { value: "Washington (state)" } } }],
            P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
          },
        };
      } else {
        entities[id] = {
          claims: {
            P31: [{ mainsnak: { datavalue: { value: { id: "Q1093829" } } } }],
            P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
            P373: [{ mainsnak: { datavalue: { value: "Washington, Pennsylvania" } } }],
          },
        };
      }
    }

    return new Response(JSON.stringify({ entities }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("desambiguação de lugar", () => {
  it("Washington vira D.C. quando a pauta é diplomática ou federal", async () => {
    const r = await resolverEntidadeNoWikidata("Washington", {
      fetcher: wikidataFalso(),
      paisDaPauta: "EUA",
      contexto: "A embaixada do Brasil em Washington segue funcionando após a revogação do visto.",
    });

    expect(r.entidade?.nome).toBe("Washington, D.C.");
    expect(r.entidade?.qid).toBe("Q61");
    expect(r.entidade?.evidencias.join(" ")).toContain("contexto federal ou diplomático");
  });

  it("Washington continua sendo o estado quando a pauta diz estado", async () => {
    const r = await resolverEntidadeNoWikidata("Washington", {
      fetcher: wikidataFalso(),
      paisDaPauta: "EUA",
      contexto: "O incêndio atingiu o estado de Washington, no noroeste do país.",
    });

    expect(r.entidade?.qid).toBe("Q1223");
    expect(r.entidade?.evidencias.join(" ")).toContain("estado de");
  });

  it("sem nada no contexto, admite que é ambíguo em vez de chutar", async () => {
    const r = await resolverEntidadeNoWikidata("Washington", {
      fetcher: wikidataFalso(),
      paisDaPauta: "EUA",
      contexto: "Chuvas fortes derrubaram árvores nesta terça-feira.",
    });

    expect(r.entidade).toBeNull();
    expect(r.ambigua).toBe(true);
    expect(r.nota).toContain("ambíguo");
  });

  it("a evidência nunca é uma caixa-preta que diz só o nome", async () => {
    const r = await resolverEntidadeNoWikidata("Washington", {
      fetcher: wikidataFalso(),
      paisDaPauta: "EUA",
      contexto: "O incêndio atingiu o estado de Washington.",
    });

    expect(r.entidade?.evidencias.length).toBeGreaterThan(1);
    expect(r.entidade?.confianca).toBeGreaterThan(0);
  });
});
