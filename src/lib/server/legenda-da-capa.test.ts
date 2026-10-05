import { describe, expect, it } from "vitest";
import type { PacoteFactual } from "./editorial/pacote-factual";
import { htmlDaLegenda, legendaDaFoto, legendaNeutra } from "./legenda-da-capa";
import { semImagemDaCapaNoCorpo } from "../imagem-da-capa";

const PACOTE: PacoteFactual = {
  verified_facts: ["Chicago tem 39 data centers ativos."],
  people: ["Brandon Johnson"],
  organizations: [],
  places: ["Chicago"],
  dates: [],
  numbers: [],
  gaps: [],
  source_urls: [],
  texto_de_origem: "There are 39 active data centers in Chicago. Mayor Brandon Johnson.",
};

describe("legenda da capa", () => {
  it("descrição sem nome nem número passa, com ponto final", () => {
    expect(legendaDaFoto("edifícios altos vistos de baixo contra um céu nublado", PACOTE)).toBe("Edifícios altos vistos de baixo contra um céu nublado.");
  });

  it("descrição que diz QUEM está na foto sem isso estar no pacote é recusada", () => {
    expect(legendaDaFoto("O governador Gavin Newsom discursa num palanque", PACOTE)).toBeNull();
    expect(legendaDaFoto("Prédios em Nova York", PACOTE)).toBeNull();
  });

  it("a neutra só diz o assunto, e o marcador volta como legenda da capa na página", () => {
    expect(legendaNeutra("data centers")).toBe("Imagem ilustrativa: data centers.");
    const r = semImagemDaCapaNoCorpo(`${htmlDaLegenda("Edifícios altos.")}<section><p>Texto.</p></section>`, "https://x.com/foto.jpg");
    expect(r.legendaDaCapa).toBe("Edifícios altos.");
    expect(r.html).toBe("<section><p>Texto.</p></section>");
  });
});
