import { describe, expect, it } from "vitest";
import { dataCurta } from "./PortalPecas";

describe("dataCurta", () => {
  it("formata a data da edição", () => {
    expect(dataCurta("2026-10-04")).toBe("04/10/2026");
  });
  it("formata o instante completo da manchete fixada, que saía quebrado na home", () => {
    expect(dataCurta("2026-09-24T09:19:54.472+00:00")).toBe("24/09/2026");
  });
});
