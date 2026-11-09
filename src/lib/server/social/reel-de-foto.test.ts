import { describe, expect, it } from "vitest";
import { htmlDoQuadro, mancheteEmHtml, planoDoRecorte } from "./reel-de-foto";

describe("o Reel de foto", () => {
  it("põe o destaque em vermelho só quando ele é trecho da manchete", () => {
    expect(mancheteEmHtml("EUA criam 165 mil empregos, mais que o dobro", "mais que o dobro")).toBe(
      "EUA criam 165 mil empregos, <em>mais que o dobro</em>",
    );
    expect(mancheteEmHtml("Fed mantém os juros", "corta os juros")).toBe("Fed mantém os juros");
    expect(mancheteEmHtml("A & B <x>", "")).toBe("A &amp; B &lt;x&gt;");
  });

  it("corta a foto larga em 9:16 em volta do foco, sem sair da foto", () => {
    const r = planoDoRecorte(3840, 2560, { x: 0.9, y: 0.2 });
    expect(r).toEqual({ modo: "corte", l: 1440, a: 2560, x: 2400, y: 0 });
    const meio = planoDoRecorte(3840, 2560, { x: 0.5, y: 0.2 });
    expect(meio.modo === "corte" && meio.x).toBe(1200);
  });

  it("corta a foto alta pelo terço de cima, e a pequena demais vai inteira sobre o fundo", () => {
    expect(planoDoRecorte(2000, 4000, { x: 0.5, y: 0.2 })).toEqual({ modo: "corte", l: 2000, a: 3556, x: 0, y: 89 });
    expect(planoDoRecorte(1000, 700, { x: 0.5, y: 0.2 })).toEqual({ modo: "fundo" });
  });

  it("desenha o chapéu em caixa alta e a manchete escapada no quadro", () => {
    const html = htmlDoQuadro({ chapeu: "Economia", mancheteHtml: "X <em>Y</em>", logo: "data:image/png;base64,AA", corpo: 66 });
    expect(html).toContain(">ECONOMIA<");
    expect(html).toContain("font-size:66px");
    expect(html).toContain("bottom:338px");
  });
});
