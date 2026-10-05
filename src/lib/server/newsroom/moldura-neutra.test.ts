import { describe, expect, it } from "vitest";
import { molduraNeutra } from "./pipeline";
import { EditionContentSchema } from "./schemas";

const historia = (title: string) => ({ title }) as never;

describe("moldura neutra da edição", () => {
  it("só repete os títulos já auditados, sem afirmar nada novo", () => {
    const m = molduraNeutra({ stories: [historia("Fed corta juros."), historia("Emprego sobe nos EUA")] });
    expect(m.intro).toBe("Bom dia. Nesta edição: Fed corta juros; e Emprego sobe nos EUA.");
    expect(m.quick_bits).toEqual([]);
    expect(m.closing.length).toBeGreaterThanOrEqual(10);
  });

  it("cabe nos limites do schema da edição, mesmo com títulos curtos ou longos", () => {
    const curtos = molduraNeutra({ stories: [historia("A"), historia("B")] });
    expect(EditionContentSchema.shape.intro.safeParse(curtos.intro).success).toBe(true);
    const longos = molduraNeutra({ stories: Array.from({ length: 6 }, () => historia("x".repeat(200))) });
    expect(EditionContentSchema.shape.intro.safeParse(longos.intro).success).toBe(true);
    expect(EditionContentSchema.shape.closing.safeParse(longos.closing).success).toBe(true);
  });
});
