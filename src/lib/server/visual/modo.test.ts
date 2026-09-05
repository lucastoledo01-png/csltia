import { describe, expect, it } from "vitest";
import { modoDoResolvedorVisual } from "./modo";

describe("modoDoResolvedorVisual", () => {
  it("sem variável, fica desligado", () => {
    expect(modoDoResolvedorVisual({})).toBe("off");
  });

  it("valor irreconhecível não liga nada", () => {
    for (const v of ["true", "on", "1", "enfroce", "ENFORCE!", "sim"]) {
      expect(modoDoResolvedorVisual({ VISUAL_RESOLVER_V2: v }), v).toBe("off");
    }
  });

  it("aceita os três estados, sem ligar para caixa ou espaço", () => {
    expect(modoDoResolvedorVisual({ VISUAL_RESOLVER_V2: " Enforce " })).toBe("enforce");
    expect(modoDoResolvedorVisual({ VISUAL_RESOLVER_V2: "DRY_RUN" })).toBe("dry_run");
    expect(modoDoResolvedorVisual({ VISUAL_RESOLVER_V2: "off" })).toBe("off");
  });
});
