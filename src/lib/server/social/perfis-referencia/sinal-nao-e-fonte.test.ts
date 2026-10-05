import { describe, expect, it } from "vitest";
import { consultaEhDeImigracao, urlPodeSerFontePrimaria } from "./sinal-nao-e-fonte";

describe("o post é sinal, nunca fonte", () => {
  it("NÃO: URL do Instagram não vira pauta", () => {
    expect(urlPodeSerFontePrimaria("https://www.instagram.com/p/DeHcJU7DNq2/")).toBe(false);
    expect(urlPodeSerFontePrimaria("https://m.facebook.com/story.php?id=1")).toBe(false);
    expect(urlPodeSerFontePrimaria("https://x.com/fulano/status/1")).toBe(false);
    expect(urlPodeSerFontePrimaria("https://www.threads.net/@fulano/post/1")).toBe(false);
  });

  it("NÃO: o próprio permalink do sinal é recusado mesmo fora da lista", () => {
    const permalink = "https://insta-espelho.example/p/abc";
    expect(urlPodeSerFontePrimaria(`${permalink}/?utm=1`, [permalink])).toBe(false);
  });

  it("NÃO: URL ilegível não passa", () => {
    expect(urlPodeSerFontePrimaria("não é url")).toBe(false);
  });

  it("matéria de veículo passa", () => {
    expect(urlPodeSerFontePrimaria("https://www.reuters.com/markets/us/fed-holds-rates-2026-10-05/")).toBe(true);
    expect(urlPodeSerFontePrimaria("https://g1.globo.com/economia/noticia/2026/10/05/bolsa.ghtml")).toBe(true);
  });
});

describe("consulta de imigração não vira busca", () => {
  it("NÃO: visto, green card, deportação e fronteira", () => {
    expect(consultaEhDeImigracao("H-1B lottery changes")).toBe(true);
    expect(consultaEhDeImigracao("green card backlog 2026")).toBe(true);
    expect(consultaEhDeImigracao("deportação de brasileiros")).toBe(true);
    expect(consultaEhDeImigracao("US border crossings drop")).toBe(true);
    expect(consultaEhDeImigracao("novas regras de visto americano")).toBe(true);
  });

  it("não confunde palavra que contém o termo", () => {
    // A lição do "ice" dentro de "justice": casamento por início de palavra.
    expect(consultaEhDeImigracao("Supreme Court justice retires")).toBe(false);
    expect(consultaEhDeImigracao("Fed holds interest rates")).toBe(false);
    expect(consultaEhDeImigracao("Ibovespa cai com eleição")).toBe(false);
  });
});
