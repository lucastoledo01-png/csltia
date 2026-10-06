import { describe, expect, it } from "vitest";
import { agruparAvisos, contarParaConferir, traduzirAviso } from "./avisos-legiveis";

/*
 * Os textos abaixo são os que a produção gravou em `aprovacoes.avisos` em
 * 06/10/2026, os mesmos que o dono leu em caixa vermelha e não entendeu.
 */
const DO_RAMO = (detalhe: string) => ({ codigo: "AVISO_DO_RAMO", detalhe });

describe("o que a poda apagou vira frase, e é informação, não alerta", () => {
  it("a pergunta apagada por previsão sem lastro (o caso do diesel)", () => {
    const t = traduzirAviso(
      DO_RAMO(
        "APAGADO pergunta.3: previsao sem lastro: O pacote não sustenta uma redução substancial; ao contrário, registra que Kloza não espera diferença significativa no preço geral.",
      ),
      "artigo",
    );
    expect(t.gravidade).toBe("resolvido");
    expect(t.frase).toBe(
      "Uma pergunta do bloco de perguntas e respostas foi apagada porque a fonte não sustenta a previsão. Já saiu da matéria.",
    );
    expect(t.frase).not.toMatch(/AVISO_DO_RAMO|APAGADO|pergunta\.3/);
    expect(t.original).toMatch(/^APAGADO pergunta\.3/);
  });

  it("a resposta que não está no corpo (o caso do Ibovespa)", () => {
    const t = traduzirAviso(DO_RAMO("APAGADO pergunta.1: resposta fora do corpo: só 63% das palavras da resposta estão no corpo"));
    expect(t.gravidade).toBe("resolvido");
    expect(t.frase).toBe(
      "Uma pergunta do bloco de perguntas e respostas foi apagada porque a resposta não estava no texto da matéria. Já saiu da matéria.",
    );
  });

  it("o parágrafo de significado que só repetia o corpo", () => {
    const t = traduzirAviso(DO_RAMO("APAGADO significado.0: repete o corpo (72% das palavras já estão nele)"));
    expect(t.frase).toBe('Um parágrafo de "O que isso significa" foi apagado porque só repetia o que o texto já diz. Já saiu da matéria.');
  });

  it("número sem lastro e atribuição trocada, cada um com o porquê", () => {
    expect(traduzirAviso(DO_RAMO('APAGADO secao.1.2: sem lastro: numero "39"')).frase).toBe(
      'Um parágrafo do corpo foi apagado porque citava um número ("39") que a fonte não traz. Já saiu da matéria.',
    );
    expect(traduzirAviso(DO_RAMO('APAGADO abertura.0: atribuição sem lastro: "39" atribuído a Axios')).frase).toMatch(
      /^Um parágrafo da abertura foi apagado porque atribuía um número a uma fonte que não o traz/,
    );
  });

  it("tópico do essencial em matéria curta", () => {
    const t = traduzirAviso(DO_RAMO("APAGADO essencial.0: corpo com 359 palavras: o bloco só existe acima de 400"));
    expect(t.frase).toBe('Um tópico de "O que você precisa saber" foi apagado porque a matéria é curta demais para esse bloco. Já saiu da matéria.');
  });
});

describe("assuntos descartados", () => {
  it("um assunto acima do teto", () => {
    const t = traduzirAviso(DO_RAMO('ASSUNTO DESCARTADO "AAA": acima do teto'));
    expect(t.gravidade).toBe("resolvido");
    expect(t.frase).toBe('Assunto "AAA" descartado: passou do limite de assuntos da matéria (até cinco, com no máximo três nomes).');
  });

  it("três do mesmo motivo viram uma frase só", () => {
    const g = agruparAvisos(
      [
        DO_RAMO("APAGADO pergunta.1: resposta fora do corpo: só 63% das palavras da resposta estão no corpo"),
        DO_RAMO('ASSUNTO DESCARTADO "Ibovespa": acima do teto'),
        DO_RAMO('ASSUNTO DESCARTADO "salário mínimo": acima do teto'),
        DO_RAMO('ASSUNTO DESCARTADO "contas públicas": acima do teto'),
      ],
      "artigo",
    );
    expect(g.confira).toEqual([]);
    expect(g.resolvidos).toHaveLength(2);
    expect(g.resolvidos[1].frase).toBe(
      '3 assuntos descartados ("Ibovespa", "salário mínimo" e "contas públicas"): passou do limite de assuntos da matéria (até cinco, com no máximo três nomes).',
    );
    // Os detalhes técnicos continuam com os três textos originais.
    expect(g.resolvidos[1].original.split("\n")).toHaveLength(3);
  });

  it("palavra genérica e termo fora da lista", () => {
    expect(traduzirAviso(DO_RAMO('ASSUNTO DESCARTADO "água": genérico')).frase).toBe(
      'Assunto "água" descartado: é palavra genérica demais para virar assunto.',
    );
    expect(traduzirAviso(DO_RAMO('ASSUNTO DESCARTADO "robôs": fora da lista')).frase).toMatch(/lista fechada de temas/);
  });
});

describe("o que pede o olhar do dono", () => {
  it("risco de alucinação e nota baixa da newsletter", () => {
    expect(traduzirAviso({ codigo: "RISCO_DE_ALUCINACAO", detalhe: "o QA marcou risco de fato inventado" }).gravidade).toBe("confira");
    const nota = traduzirAviso({ codigo: "QA_REPROVOU", detalhe: "QA 72/100" });
    expect(nota.gravidade).toBe("confira");
    expect(nota.frase).toBe("A revisão automática deu nota 72 de 100, abaixo do mínimo. Leia com atenção.");
  });

  it("nome que não está na fonte, e auditoria que não rodou", () => {
    const nome = traduzirAviso(DO_RAMO('nome não conferido: "Natalie Harp"'));
    expect(nome.gravidade).toBe("confira");
    expect(nome.frase).toBe('O nome "Natalie Harp" está no texto e não aparece na fonte. Confira se está certo.');
    expect(traduzirAviso(DO_RAMO("auditoria de conclusões não rodou: timeout")).gravidade).toBe("confira");
  });

  it("formato desconhecido cai em confira, com o texto cru: na dúvida, o dono olha", () => {
    const t = traduzirAviso(DO_RAMO("ALGO NOVO: que ninguém traduziu"));
    expect(t.gravidade).toBe("confira");
    expect(t.frase).toBe("ALGO NOVO: que ninguém traduziu");
  });

  it("a confirmação ao aprovar só conta o que é para conferir", () => {
    const avisos = [
      DO_RAMO("APAGADO significado.0: repete o corpo (72% das palavras já estão nele)"),
      DO_RAMO('ASSUNTO DESCARTADO "AAA": acima do teto'),
    ];
    expect(contarParaConferir(avisos, "artigo")).toBe(0);
    expect(contarParaConferir([...avisos, DO_RAMO('nome não conferido: "X"')], "artigo")).toBe(1);
  });
});

describe("newsletter e post", () => {
  it("a pauta retirada da edição", () => {
    const t = traduzirAviso(
      DO_RAMO(
        'pauta retirada: "Mercado brasileiro dispara com vantagem de Flávio no primeiro turno" (impacto: O pacote informa as condições da bolsa e do dólar, mas não afirma que brasileiros investidores estejam sendo afetados ou como lidam com elas.)',
      ),
      "newsletter",
    );
    expect(t.gravidade).toBe("resolvido");
    expect(t.frase).toBe(
      'A pauta "Mercado brasileiro dispara com vantagem de Flávio no primeiro turno" saiu da edição: o efeito sobre o leitor não estava na fonte.',
    );
  });

  it("o post reescrito sozinho é informação; o apontamento da guarda é para conferir", () => {
    expect(traduzirAviso(DO_RAMO("reparado: manchete sem país"), "post").gravidade).toBe("resolvido");
    const guarda = traduzirAviso({ codigo: "PAIS_AMBIGUO", detalhe: "a manchete não diz de que país é" }, "post");
    expect(guarda.gravidade).toBe("confira");
    expect(guarda.frase).toBe("A conferência do post apontou: a manchete não diz de que país é.");
  });
});
