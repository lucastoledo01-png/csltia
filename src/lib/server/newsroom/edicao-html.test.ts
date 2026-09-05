import { describe, expect, it } from "vitest";
import { renderEditionToHtml } from "./newsroom-service";
import type { EditionContent } from "./schemas";

/**
 * A mesma edição vai para a caixa de entrada e para o corpo do artigo no
 * portal — e as duas precisam de coisas diferentes.
 *
 * O que aconteceu em produção: a página do artigo desenha o próprio cabeçalho
 * (título, data, resumo) e logo abaixo embutia o HTML do e-mail, que traz
 * outro cabeçalho com os mesmos dados, o índice repetindo todos os títulos e
 * um rodapé com "powered by" e link de descadastro. O leitor viu a edição
 * duplicada.
 */

const EDICAO: EditionContent = {
  subject: "assunto de teste",
  subject_options: ["assunto de teste"],
  preheader: "Um preheader de teste com tamanho suficiente para o schema.",
  headline: "Manchete única da edição de teste",
  intro: "Bom dia. Esta é a abertura da edição, com tamanho suficiente para passar na validação do schema.",
  stories: [
    {
      rank: 1,
      category: "Vistos",
      title: "Primeira pauta da edição",
      summary: "Resumo da primeira pauta, longo o bastante para o schema aceitar sem reclamar do tamanho.",
      context: "Contexto da primeira pauta.",
      why_it_matters: "Por que a primeira pauta importa.",
      practical_impact: "O que muda na prática na primeira pauta.",
      humor_line: "",
      source_name: "Fonte",
      source_url: "https://exemplo.com/1",
    },
  ],
  quick_bits: [],
  closing: "Fechamento da edição.",
  final_line: "Até amanhã. — imigra.us",
} as unknown as EditionContent;

describe("HTML da edição", () => {
  it("no e-mail traz cabeçalho, índice e rodapé", () => {
    const html = renderEditionToHtml(EDICAO, new Map());

    expect(html).toContain("Nesta edição");
    expect(html).toContain("Quem somos");
    expect(html).toContain("UnsubscribeURL");
  });

  it("no portal não repete o que a página já mostra", () => {
    const html = renderEditionToHtml(EDICAO, new Map(), true);

    // A página já tem título e data no topo.
    expect(html).not.toContain("Nesta edição");
    expect(html).not.toContain("Quem somos");

    // Link de descadastro numa página pública é pior que ruído: o visitante
    // não é assinante de lista nenhuma.
    expect(html).not.toContain("UnsubscribeURL");
  });

  it("o título da pauta aparece uma vez só no texto visível do portal", () => {
    // Era o sintoma relatado: cada pauta duas vezes, uma no índice e outra no
    // corpo.
    //
    // A contagem é sobre o texto visível, não sobre a string bruta: o título
    // também aparece dentro do href de compartilhamento do WhatsApp, e isso
    // ninguém lê.
    const visivel = renderEditionToHtml(EDICAO, new Map(), true).replace(/<[^>]+>/g, " ");
    const ocorrencias = visivel.split("Primeira pauta da edição").length - 1;

    expect(ocorrencias).toBe(1);
  });

  it("as pautas em si são idênticas nas duas versões", () => {
    // O corte é de cromo, não de conteúdo. Se uma pauta sumir do portal, o
    // artigo publicado deixa de corresponder ao e-mail enviado.
    const email = renderEditionToHtml(EDICAO, new Map());
    const portal = renderEditionToHtml(EDICAO, new Map(), true);

    for (const trecho of [
      "Primeira pauta da edição",
      "O que muda na prática na primeira pauta.",
      "Por que a primeira pauta importa.",
    ]) {
      expect(email).toContain(trecho);
      expect(portal).toContain(trecho);
    }
  });
});
