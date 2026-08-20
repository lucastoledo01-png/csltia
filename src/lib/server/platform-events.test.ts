import { describe, expect, it } from "vitest";
import { normalizePageview, normalizeSignupEvent } from "./platform-events";

describe("platform events", () => {
  it("normaliza pageviews sem aceitar caminho externo", () => {
    expect(normalizePageview({ path: "/artigos/ia-semana-sem-hype", referrer: "https://google.com" })).toEqual({
      path: "/artigos/ia-semana-sem-hype",
      referrer: "https://google.com",
    });

    expect(() => normalizePageview({ path: "https://evil.test" })).toThrow("path invalido");
  });

  it("normaliza leads de newsletter em lowercase", () => {
    expect(normalizeSignupEvent({ email: "OI@CASALOTI.IA.BR", source: "artigos" })).toEqual({
      email: "oi@casaloti.ia.br",
      source: "artigos",
    });
  });
});
