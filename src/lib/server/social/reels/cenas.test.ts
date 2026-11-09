import { describe, expect, it } from "vitest";
import { ajustarAosCortesDeCena, tempoDosCortes } from "./corte";

describe("os cortes de cena (09/11/2026)", () => {
  it("lê os tempos do showinfo, em ordem e sem repetir", () => {
    const saida = "[Parsed_showinfo_1] n:0 pts:1 pts_time:16.42 x\n[Parsed_showinfo_1] n:1 pts:2 pts_time:27.96 x\n pts_time:16.42 ";
    expect(tempoDosCortes(saida)).toEqual([16.42, 27.96]);
    expect(tempoDosCortes("nada")).toEqual([]);
  });

  it("encosta o trecho dentro da cena e não mexe no que já está dentro", () => {
    expect(ajustarAosCortesDeCena([{ inicio: 16.0, fim: 32.8 }], [16.42, 27.96])).toEqual([{ inicio: 16.46, fim: 32.8 }]);
    expect(ajustarAosCortesDeCena([{ inicio: 31.75, fim: 43.0 }], [31.66, 42.61])).toEqual([{ inicio: 31.75, fim: 42.57 }]);
    expect(ajustarAosCortesDeCena([{ inicio: 10, fim: 11.2 }], [10.5])).toEqual([{ inicio: 10, fim: 11.2 }]);
  });
});
