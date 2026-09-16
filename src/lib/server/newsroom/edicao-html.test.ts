import { describe, expect, it } from "vitest";
import { identidadeDaPauta, renderEditionToHtml } from "./newsroom-service";
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

    for (const trecho of ["Primeira pauta da edição", "Por que a primeira pauta importa."]) {
      expect(email).toContain(trecho);
      expect(portal).toContain(trecho);
    }
  });

  /**
   * O quadro "O que muda na prática" saiu das duas versões.
   *
   * Ele aparecia em toda pauta, e nem toda pauta tem consequência prática para
   * declarar. Quando não tinha, o texto preenchia o quadro assim mesmo e saía
   * hedge com cara de formulário.
   *
   * O campo continua sendo gerado, porque o carrossel usa `practical_impact`.
   * O que saiu foi a renderização. Este teste separa as duas coisas: se o
   * quadro voltar por descuido, ele acusa; se o campo sumir do schema, o
   * carrossel quebra em outro lugar.
   */
  it("o quadro de impacto prático não aparece em nenhuma das versões", () => {
    const email = renderEditionToHtml(EDICAO, new Map());
    const portal = renderEditionToHtml(EDICAO, new Map(), true);

    for (const html of [email, portal]) {
      expect(html).not.toContain("O que muda na prática");
      expect(html).not.toContain("O que muda na prática na primeira pauta.");
    }
  });

  /**
   * Foto sempre na mesma proporção.
   *
   * Com altura automática, foto em pé ocupava a tela inteira do celular e foto
   * deitada ocupava um terço. Na mesma edição isso vira rolagem sem fim entre
   * um título e o próximo, que foi o que o dono relatou.
   */
  it("a foto sai recortada na proporção fixa, e não com altura livre", () => {
    // A chave do mapa é a identidade da pauta, a mesma que o render usa. Montar
    // a chave à mão aqui faria o teste passar com a imagem ausente.
    const primeira = EDICAO.stories[0];
    const imagens = new Map([
      [
        identidadeDaPauta(primeira),
        "https://images.pexels.com/photos/3751006/pexels-photo-3751006.jpeg?auto=compress&h=650&w=940",
      ],
    ]);

    const html = renderEditionToHtml(EDICAO, imagens);
    const img = html.match(/<img[^>]+pexels[^>]*>/)?.[0] ?? "";

    expect(img).not.toContain("height:auto");
    expect(img).toContain("object-fit:cover");
    // Corte na origem: é o que o Outlook recebe, já que ele ignora o CSS.
    expect(img).toContain("fit=crop");
    expect(img).toContain("h=360");
  });
});
