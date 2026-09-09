import { describe, expect, it } from "vitest";
import { descreverModoSocial, modoDoPipelineSocial, permiteEnforce } from "./modo";

/**
 * O modo efetivo é o que o processo leu, não o que o painel mostra.
 *
 * A lição é desta semana: `VISUAL_RESOLVER_V2` ficou duplicado em dois
 * serviços, o painel mostrava `off` e o processo lia `enforce`. Foram três
 * tentativas até a variável valer de fato.
 */

describe("modo do pipeline social", () => {
  it("ausente cai em off", () => {
    expect(modoDoPipelineSocial({})).toBe("off");
  });

  it("valor irreconhecível cai em off, nunca em enforce", () => {
    // "dry-run" com hífen entra aqui de propósito: é o erro de digitação mais
    // provável, e cair em off é o desfecho seguro.
    for (const v of ["sim", "true", "1", "on", "dry-run", "ligado", "enforce!", ""]) {
      expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: v }), v).toBe("off");
    }
  });

  it("reconhece os três estados escritos como se espera", () => {
    expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: "off" })).toBe("off");
    expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: "dry_run" })).toBe("dry_run");
    expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: "enforce" })).toBe("enforce");
  });

  it("tolera espaço e maiúscula, que é como se digita no painel", () => {
    expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: "  Enforce  " })).toBe("enforce");
    expect(modoDoPipelineSocial({ SOCIAL_PIPELINE_V2: "DRY_RUN" })).toBe("dry_run");
  });

  it("descreve cada estado em uma linha", () => {
    expect(descreverModoSocial("off")).toMatch(/desligado/);
    expect(descreverModoSocial("dry_run")).toMatch(/não publica/);
  });
});

describe("enforce implementado e não liberado", () => {
  it("bloqueado enquanto o resolvedor visual não estiver aprovado", () => {
    const r = permiteEnforce({ SOCIAL_PIPELINE_V2: "enforce", VISUAL_RESOLVER_V2: "off" });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/temporal e de centralidade/);
  });

  it("visual aprovado não basta: falta a liberação explícita", () => {
    const r = permiteEnforce({ VISUAL_RESOLVER_V2: "enforce" });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/SOCIAL_V2_ENFORCE_LIBERADO/);
  });

  it("com as duas condições, libera", () => {
    const r = permiteEnforce({ VISUAL_RESOLVER_V2: "enforce", SOCIAL_V2_ENFORCE_LIBERADO: "true" });
    expect(r.permitido).toBe(true);
  });
});
