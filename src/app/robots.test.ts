import { describe, expect, it } from "vitest";
import robots, { ROBOS_DE_BUSCA_DE_IA, ROBOS_DE_TREINO_DE_IA } from "./robots";

describe("robots.txt", () => {
  const regras = robots().rules;
  const lista = Array.isArray(regras) ? regras : [regras];

  it.each([...ROBOS_DE_BUSCA_DE_IA, ...ROBOS_DE_TREINO_DE_IA])("%s está liberado no site, por decisão de 05/10/2026", (robo) => {
    const grupo = lista.find((r) => (Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent]).includes(robo));
    expect(grupo?.allow).toBe("/");
  });

  it("nenhum grupo deixa o painel ou a API no rastreio", () => {
    for (const r of lista) expect(r.disallow).toEqual(expect.arrayContaining(["/admin", "/api/"]));
  });
});
