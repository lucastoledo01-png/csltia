import { describe, expect, it } from "vitest";
import { diagnosticoSocialAusente } from "./ciclo-do-dia";
import { EVENTO_DO_SOCIAL, gravarDiagnosticoDoSocial, montarRegistroDoSocial } from "./diagnostico-gravado";

/*
 * Em 23, 24, 26 e 28/09/2026 o feed saiu sem post de notícia e o motivo só
 * existia no log do contêiner. O cabeçalho de `diagnostico-gravado.ts` conta o
 * caso. Estes testes provam que o motivo chega ao banco, e que gravar nunca
 * custa o ciclo.
 */

const pauta = (storyId: string, title: string) => ({ storyId, grupo: { primary: { title } } }) as never;

describe("montarRegistroDoSocial", () => {
  it("leva o motivo de cada recusa do verificador, que é o que faltou em 23/09", () => {
    const registro = montarRegistroDoSocial(
      {
        diagnostico: diagnosticoSocialAusente("enforce"),
        ciclo: null,
        conferencia: {
          recusadas: [{ pauta: pauta("u_1", "AMD compra World Labs"), motivo: "sem relação com imigração" }],
          emConflito: [],
        } as never,
      },
      { editionDate: "2026-09-23", dryRun: false },
    );

    expect(registro.recusadas).toEqual([
      { storyId: "u_1", titulo: "AMD compra World Labs", motivo: "sem relação com imigração" },
    ]);
    expect(registro.editionDate).toBe("2026-09-23");
  });

  it("corta listas e textos longos, e mantém a contagem no diagnóstico", () => {
    const muitas = Array.from({ length: 50 }, (_, i) => ({ pauta: pauta(`u_${i}`, "x"), motivo: "m".repeat(1000) }));
    const registro = montarRegistroDoSocial(
      { diagnostico: diagnosticoSocialAusente("enforce"), ciclo: null, conferencia: { recusadas: muitas, emConflito: [] } as never },
      { editionDate: "2026-09-23", dryRun: false },
    );

    expect(registro.recusadas).toHaveLength(20);
    expect(registro.recusadas[0].motivo.length).toBeLessThanOrEqual(240);
  });
});

describe("gravarDiagnosticoDoSocial", () => {
  const registro = montarRegistroDoSocial(
    { diagnostico: diagnosticoSocialAusente("enforce"), ciclo: null, conferencia: null },
    { editionDate: "2026-09-29", dryRun: false },
  );

  it("grava em platform_events com o tipo e o projeto", async () => {
    const inseridos: unknown[] = [];
    const client = { from: (t: string) => ({ insert: async (linha: unknown) => (inseridos.push({ t, linha }), { error: null }) }) };

    expect(await gravarDiagnosticoDoSocial(client as never, "p1", registro)).toBeNull();
    expect(inseridos).toEqual([
      { t: "platform_events", linha: { event_type: EVENTO_DO_SOCIAL, project_id: "p1", payload: registro } },
    ]);
  });

  it("devolve o motivo em vez de lançar, quando o banco recusa ou o cliente quebra", async () => {
    const recusa = { from: () => ({ insert: async () => ({ error: { message: "permission denied" } }) }) };
    const quebra = { from: () => { throw new Error("sem cliente"); } };

    expect(await gravarDiagnosticoDoSocial(recusa as never, "p1", registro)).toBe("permission denied");
    expect(await gravarDiagnosticoDoSocial(quebra as never, "p1", registro)).toBe("sem cliente");
  });
});
