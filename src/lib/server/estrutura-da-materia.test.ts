import { describe, expect, it } from "vitest";
import { distribuicaoDaEstrutura, estruturaDaMateria, estruturaEmMarkdown, faixaDePalavras } from "./estrutura-da-materia";

const curta = {
  slug: "los-angeles-2026-10-05",
  title: "Los Angeles pode eleger uma urbanista para prefeita",
  category: "Política",
  cover_image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg",
  content_html:
    '<section><p>Los Angeles pode eleger uma urbanista para prefeita em novembro, e a eleição está marcada.</p><p>Isso coloca a cidade ao lado de Nova York.</p></section><section><h2>Por que importa</h2><p>A disputa envolve a prefeitura de Los Angeles e uma urbanista do City Council.</p></section><p class="fonte">Fonte: <a href="https://www.axios.com/x">Axios</a></p>',
  tags: ["origem:edicao-2026-10-05"],
};

const completa = {
  slug: "chicago-2026-09-24",
  title: "Chicago propõe um ano sem novos data centers na cidade",
  category: "Política",
  cover_image: "https://images.pexels.com/photos/1/p.jpeg?auto=compress&amp%3Bcs=tinysrgb",
  content_html:
    '<p class="legenda-da-capa">Prédios.</p><p class="credito-da-foto">Foto: Pexels</p><p>Chicago propõe um ano sem novos data centers na cidade, <a href="https://www.axios.com/c">segundo a Axios</a>.</p><h2>O que foi proposto?</h2><p>Uma moratória de 12 meses para data centers na cidade de Chicago.</p><section class="leia-tambem"><h2>Leia também</h2></section><section class="perguntas"><h2>Perguntas e respostas</h2><h3>Quanto tempo?</h3><p>Uma moratória de 12 meses.</p><h3>Onde?</h3><p>Em Chicago, data centers.</p><h3>Quem?</h3><p>Chicago e data centers.</p></section>',
  tags: ["assunto:Chicago", "assunto:data centers", "sobre:Place:Chicago"],
};

describe("estruturaDaMateria", () => {
  it("a matéria do desmonte: curta, sem pergunta, sem link interno, sem crédito gravado", () => {
    const e = estruturaDaMateria(curta);
    expect(e.faixa).toBe("até 299");
    expect(e.intertitulosEmPergunta).toBe(0);
    expect(e.fonteNaAbertura).toBe(false);
    expect(e.leiaTambemNoCorpo).toBe(false);
    expect(e.perguntasVisiveis).toBe(0);
    expect(e.creditoDaCapa).toBe("link do Commons na página");
    expect(e.assuntos).toBe(0);
    expect(e.paragrafosDependentes).toBe(1);
    expect(e.respostaPrimeiro).toBe(true);
  });

  it("a matéria no molde: pergunta no intertítulo, fonte na abertura, perguntas, legenda e crédito", () => {
    const e = estruturaDaMateria(completa);
    expect(e.intertitulosEmPergunta).toBe(1);
    expect(e.fonteNaAbertura).toBe(true);
    expect(e.leiaTambemNoCorpo).toBe(true);
    expect(e.perguntasVisiveis).toBe(3);
    expect(e.legendaDaCapa).toBe(true);
    expect(e.creditoDaCapa).toBe("gravado");
    expect(e.capaMalformada).toBe(true);
    expect(e.assuntos).toBe(2);
  });

  it("a distribuição conta cada medida e vira tabela", () => {
    const d = distribuicaoDaEstrutura([estruturaDaMateria(curta), estruturaDaMateria(completa)]);
    expect(d.total).toBe(2);
    expect(d.semPerguntas).toBe(1);
    expect(d.abaixoDoMinimoDeAssuntos).toBe(1);
    expect(estruturaEmMarkdown(d)).toContain("| Abaixo do piso de 2 assuntos hoje | 1 de 2 |");
    expect(faixaDePalavras(650)).toBe("500 a 900");
  });
});
