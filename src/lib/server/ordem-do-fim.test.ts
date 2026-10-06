import { describe, expect, it } from "vitest";
import { corpoNaOrdemDoFim, tituloDasPerguntas } from "./dados-estruturados-do-artigo";

const html =
  '<section class="abertura"><p>Fato.</p></section>' +
  '<section class="leia-tambem"><h2>Leia também</h2><ul><li>a</li></ul></section>' +
  '<section class="perguntas"><h2>Perguntas e respostas</h2><h3>P1?</h3><p>R1.</p><h3>P2?</h3><p>R2.</p></section>' +
  '<section class="fontes"><h2>Fontes</h2><ul><li>Axios</li></ul></section>';

describe("fim da matéria (06/10/2026)", () => {
  it("perguntas, fontes e só então o Leia também", () => {
    const out = corpoNaOrdemDoFim(html);
    const ordem = [...out.matchAll(/<section class="([a-z-]+)"/g)].map((m) => m[1]);
    expect(ordem).toEqual(["abertura", "perguntas", "fontes", "leia-tambem"]);
  });
  it("o título das perguntas diz quantas são", () => {
    expect(corpoNaOrdemDoFim(html)).toContain("<h2>Entenda em 2 perguntas</h2>");
    expect(tituloDasPerguntas(1)).toBe("Entenda em 1 pergunta");
  });
  it("nada some e nada duplica", () => {
    const out = corpoNaOrdemDoFim(html);
    expect((out.match(/<section/g) ?? []).length).toBe(4);
    expect(corpoNaOrdemDoFim(out)).toBe(out);
  });
});

import { corpoComLeiaTambem } from "./dados-estruturados-do-artigo";

describe("Leia também refeito na hora (06/10/2026)", () => {
  it("o gravado no corpo é trocado pelas matérias publicadas agora", () => {
    const gravado = '<section class="abertura"><p>F.</p></section><section class="leia-tambem"><h2>Leia também</h2><ul><li><a href="/artigos/arquivada">Arquivada</a></li></ul></section>';
    const out = corpoComLeiaTambem(gravado, [{ slug: "publicada", titulo: "Publicada" }], null);
    expect(out).not.toContain("/artigos/arquivada");
    expect(out).toContain("/artigos/publicada");
    expect((out.match(/class="leia-tambem"/g) ?? []).length).toBe(1);
  });
  it("sem relacionada publicada, fica só o link da editoria", () => {
    const gravado = '<section class="leia-tambem"><h2>Leia também</h2><ul><li><a href="/artigos/arquivada">A</a></li></ul></section>';
    const out = corpoComLeiaTambem(gravado, [], { nome: "Política", href: "/editoria/governo" });
    expect(out).not.toContain("arquivada");
    expect(out).toContain("Mais de Política");
  });
});
