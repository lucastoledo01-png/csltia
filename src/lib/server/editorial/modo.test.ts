import { describe, expect, it } from "vitest";
import { modoDaGuarda } from "./modo";

describe("modoDaGuarda", () => {
  it("sem variável nenhuma, roda em observação", () => {
    expect(modoDaGuarda({})).toBe("dry_run");
  });

  it("um deploy não liga a publicação por acidente", () => {
    // Qualquer valor que não seja exatamente "enforce" fica em observação.
    expect(modoDaGuarda({ EDITORIAL_GUARD: "true" })).toBe("dry_run");
    expect(modoDaGuarda({ EDITORIAL_GUARD: "on" })).toBe("dry_run");
    expect(modoDaGuarda({ EDITORIAL_GUARD: "enfroce" })).toBe("dry_run");
    expect(modoDaGuarda({ EDITORIAL_GUARD: "1" })).toBe("dry_run");
  });

  it("aceita os três estados, sem ligar para caixa ou espaço", () => {
    expect(modoDaGuarda({ EDITORIAL_GUARD: "off" })).toBe("off");
    expect(modoDaGuarda({ EDITORIAL_GUARD: " Enforce " })).toBe("enforce");
    expect(modoDaGuarda({ EDITORIAL_GUARD: "DRY_RUN" })).toBe("dry_run");
  });
});
