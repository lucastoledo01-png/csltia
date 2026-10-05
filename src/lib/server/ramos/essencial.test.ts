import { describe, expect, it } from "vitest";
import { fatosDoTexto, motivoParaTirarTopico, regrarEssencial, regrarEssencialNoHtml, PALAVRAS_MINIMAS_PARA_O_ESSENCIAL } from "./essencial";

const ABERTURA = [
  "O prefeito Brandon Johnson propôs uma moratória de 12 meses para novos data centers em Chicago, [[segundo a Axios]].",
  "Chicago tem 39 data centers ativos, segundo a cidade, e as propostas seguirão para a câmara municipal.",
];
const CORPO_LONGO = PALAVRAS_MINIMAS_PARA_O_ESSENCIAL + 50;

const BONS = [
  "A votação na câmara está marcada para **15 de outubro**.",
  "O vereador Bill Conway quer regras imediatas, sem pausa.",
  "O governador JB Pritzker suspendeu incentivos fiscais para o setor em Illinois.",
];

describe("O que você precisa saber: as regras do dono (06/10/2026)", () => {
  it("no máximo três tópicos", () => {
    const r = regrarEssencial([...BONS, "A pausa começa em 1º de janeiro de 2027, se aprovada."], ABERTURA, CORPO_LONGO);
    expect(r.mantidos).toEqual(BONS);
    expect(r.removidos).toEqual([expect.objectContaining({ indice: 3, motivo: "acima de 3 tópicos" })]);
  });

  it("tópico que repete uma frase da abertura sai", () => {
    expect(motivoParaTirarTopico("Chicago tem 39 data centers ativos, segundo a cidade.", ABERTURA)).toMatch(/^repete a abertura/);
  });

  it("tópico sem fato próprio sai, mesmo sem repetir palavra por palavra", () => {
    // O número e o nome já estão na abertura: o tópico só reorganiza.
    expect(motivoParaTirarTopico("Brandon Johnson quer 12 meses sem obras novas no setor.", ABERTURA)).toMatch(/^sem fato próprio/);
    // Nenhum número, data, prazo ou nome: é opinião de resumo.
    expect(motivoParaTirarTopico("A proposta daria tempo para estudar efeitos sobre ar, água e energia.", ABERTURA)).toMatch(/^sem fato próprio/);
  });

  it("número, data, próximo passo ou ator novo contam como fato próprio", () => {
    expect(motivoParaTirarTopico("A pausa custaria US$ 450 mil em licenças.", ABERTURA)).toBeNull();
    expect(motivoParaTirarTopico("A votação na câmara deve ser em outubro.", ABERTURA)).toBeNull();
    expect(motivoParaTirarTopico("O vereador Bill Conway quer regras imediatas.", ABERTURA)).toBeNull();
    expect(fatosDoTexto("A votação é em 15 de outubro.")).toEqual(expect.arrayContaining(["n:15", "d:outubro", "p:votacao"]));
  });

  it("com menos de dois tópicos que ficam, o bloco sai inteiro", () => {
    const r = regrarEssencial([BONS[0], "Chicago tem 39 data centers ativos, segundo a cidade."], ABERTURA, CORPO_LONGO);
    expect(r.mantidos).toEqual([]);
    expect(r.removidos.map((x) => x.indice)).toEqual([0, 1]);
  });

  it("só existe em corpo com mais de 400 palavras", () => {
    expect(regrarEssencial(BONS, ABERTURA, PALAVRAS_MINIMAS_PARA_O_ESSENCIAL).mantidos).toEqual([]);
    expect(regrarEssencial(BONS, ABERTURA, PALAVRAS_MINIMAS_PARA_O_ESSENCIAL + 1).mantidos).toEqual(BONS);
  });

  it("no HTML gravado, o <li> que fica fica byte a byte, e o bloco some quando cai abaixo de dois", () => {
    const corpo = `<section><h2>Mais?</h2><p>${"palavra ".repeat(CORPO_LONGO)}</p></section>`;
    const html =
      `<section class="essencial"><h2>O que você precisa saber</h2><ul>` +
      `<li>A votação está marcada para <strong>15 de outubro</strong>.</li>` +
      `<li>Chicago tem 39 data centers ativos, segundo a cidade.</li>` +
      `<li>O vereador Bill Conway quer regras imediatas.</li></ul></section>` +
      `<section class="abertura">${ABERTURA.map((p) => `<p>${p.replace(/\[\[|\]\]/g, "")}</p>`).join("")}</section>${corpo}`;
    const r = regrarEssencialNoHtml(html);
    expect(r.html).toContain("<li>A votação está marcada para <strong>15 de outubro</strong>.</li><li>O vereador Bill Conway quer regras imediatas.</li></ul>");
    expect(r.html).not.toContain("39 data centers ativos, segundo a cidade.</li>");

    const curto = regrarEssencialNoHtml(html.replace(corpo, "<section><p>Curto.</p></section>"));
    expect(curto.html).not.toContain('class="essencial"');
  });
});
