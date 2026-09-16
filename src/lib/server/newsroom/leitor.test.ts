import { describe, expect, it } from "vitest";
import { conferirLinguagemDoLeitor } from "./leitor";
import type { EditionContent, EditionStory } from "./schemas";

/**
 * A newsletter é para quem quer morar nos EUA, não para quem advoga sobre isso.
 *
 * O caso real: "Na Califórnia, acordos nupciais geralmente não encerram o
 * I-864", com o corpo dizendo que "a obrigação federal de suporte permanece no
 * centro da análise". Tecnicamente correto, ilegível para o público.
 */

function materia(over: Partial<EditionStory> = {}): EditionStory {
  return {
    rank: 1,
    category: "Processos",
    title: "USCIS reduz prazo de análise da autorização de trabalho",
    summary: "O prazo cai de 90 para 45 dias a partir de outubro.",
    context: "",
    why_it_matters: "Quem espera a autorização para começar a trabalhar recebe a resposta mais rápido.",
    practical_impact: "Brasileiros com pedido em análise devem acompanhar o prazo novo.",
    source_name: "USCIS",
    source_url: "https://uscis.gov/x",
    secondary_urls: [],
    ...over,
  } as EditionStory;
}

function edicao(stories: EditionStory[]): EditionContent {
  return { stories } as unknown as EditionContent;
}

describe("juridiquês", () => {
  it("matéria clara não gera apontamento", () => {
    expect(conferirLinguagemDoLeitor(edicao([materia()]))).toEqual([]);
  });

  it("o caso real da edição de 09/09 é pego", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia({
          title: "Na Califórnia, acordos nupciais geralmente não encerram o I-864",
          summary:
            "Na Califórnia, um acordo pré-nupcial geralmente não pode encerrar a obrigação federal de suporte prevista no Form I-864. O mesmo se aplica a um acordo pós-nupcial.",
          why_it_matters: "A obrigação federal de suporte permanece no centro da análise.",
          practical_impact: "Um contrato privado não elimina os direitos de execução de agências federais.",
        }),
      ]),
    );

    const motivos = r.map((x) => x.motivo);
    expect(motivos).toContain("LEGAL_JARGON_OVERLOAD");
    expect(motivos).toContain("LOW_READER_RELEVANCE");
  });

  it("termo explicado na hora não conta", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia({
          summary:
            "O Form I-864, documento em que alguém se compromete a sustentar financeiramente o imigrante, continua valendo. " +
            "O affidavit of support é o nome desse mesmo documento no processo. " +
            "O adjustment of status, que é o pedido de residência feito de dentro dos EUA, não muda.",
        }),
      ]),
    );
    expect(r.map((x) => x.motivo)).not.toContain("LEGAL_JARGON_OVERLOAD");
  });

  it("dois termos sem explicar passam; três não", () => {
    // O teto existe para o apontamento não sair em toda edição e ser ignorado.
    const dois = conferirLinguagemDoLeitor(
      edicao([materia({ summary: "O priority date mudou e o parole segue igual." })]),
    );
    expect(dois.map((x) => x.motivo)).not.toContain("LEGAL_JARGON_OVERLOAD");

    const tres = conferirLinguagemDoLeitor(
      edicao([
        materia({ summary: "O priority date mudou, o parole segue igual e o waiver foi negado." }),
      ]),
    );
    expect(tres.map((x) => x.motivo)).toContain("LEGAL_JARGON_OVERLOAD");
  });

  it("o apontamento nomeia os termos, para o reparo saber onde mexer", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia({ summary: "O priority date mudou, o parole segue igual e o waiver foi negado." }),
      ]),
    );
    const jargao = r.find((x) => x.motivo === "LEGAL_JARGON_OVERLOAD")!;
    expect(jargao.descricao).toContain("priority date");
    expect(jargao.descricao).toContain("waiver");
  });
});

describe("relevância para o leitor", () => {
  it("campo que repete o fato em vez de dizer a quem importa é apontado", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia({
          why_it_matters: "A regra passa a valer em outubro.",
          practical_impact: "A mudança entra em vigor.",
        }),
      ]),
    );
    expect(r.map((x) => x.motivo)).toContain("LOW_READER_RELEVANCE");
  });

  it("campo que nomeia quem é afetado passa", () => {
    for (const quem of [
      "Brasileiros com pedido em análise ganham tempo.",
      "Estudantes que pretendem estagiar depois do curso são os afetados.",
      // Era "Famílias que já protocolaram DEVEM ACOMPANHAR o novo prazo", e a
      // frase passava aqui e era reprovada pelo auditor semântico: fonte
      // nenhuma afirma o que as pessoas acompanham. Os dois portões pediam
      // coisas opostas, e a contradição estava escrita nesta fixture.
      "Famílias que já protocolaram passam a ter o prazo antigo mantido.",
      "Quem espera a autorização recebe resposta mais rápido.",
    ]) {
      const r = conferirLinguagemDoLeitor(edicao([materia({ why_it_matters: quem, practical_impact: quem })]));
      expect(r.map((x) => x.motivo), quem).not.toContain("LOW_READER_RELEVANCE");
    }
  });

  /**
   * Silêncio deliberado deixou de ser falha.
   *
   * Nem toda pauta tem relevância com lastro. Uma liminar que só diz "a medida
   * está suspensa" não informa quem é afetado, e não existe frase de impacto
   * que o pacote sustente. Enquanto o vazio era apontado, o laço de reparo
   * insistia, e a redação devolvia o único texto possível: hedge. Em
   * 16/09/2026 a edição foi barrada por isso, com QA 94 e a frase
   * "Pessoas sujeitas à nova regra podem ser afetadas, mas a fonte não informa
   * quais grupos específicos estão abrangidos".
   *
   * O que cedeu foi a exigência de escrever. A régua de lastro não cedeu.
   */
  it("campo vazio não é apontado: é decisão editorial", () => {
    const r = conferirLinguagemDoLeitor(edicao([materia({ why_it_matters: "", practical_impact: "" })]));
    expect(r.map((x) => x.motivo)).not.toContain("LOW_READER_RELEVANCE");
  });

  it("mas relevância escrita pela metade continua sendo apontada", () => {
    // A tolerância é para o silêncio, não para a tentativa malfeita: quem
    // escreveu alguma coisa aceitou a régua de quem escreve.
    const r = conferirLinguagemDoLeitor(
      edicao([materia({ why_it_matters: "Importa muito.", practical_impact: "" })]),
    );
    expect(r.map((x) => x.motivo)).toContain("LOW_READER_RELEVANCE");
  });
});

describe("comprimento do título", () => {
  it("título que ocuparia quatro linhas no celular é apontado", () => {
    const longo =
      "Departamento de Estado publica regra referente ao registro de residência para determinadas crianças nascidas nos Estados Unidos";
    const r = conferirLinguagemDoLeitor(edicao([materia({ title: longo })]));
    const achado = r.find((x) => x.motivo === "HEADLINE_TOO_LONG")!;
    expect(achado).toBeTruthy();
    expect(achado.descricao).toContain("linhas num celular");
  });

  it("título curto passa", () => {
    expect(
      conferirLinguagemDoLeitor(edicao([materia({ title: "Prazo do EAD cai para 45 dias" })]))
        .map((x) => x.motivo),
    ).not.toContain("HEADLINE_TOO_LONG");
  });
});

describe("o apontamento aponta a matéria certa", () => {
  it("o índice corresponde à posição na edição", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia(),
        materia({ why_it_matters: "Vale a partir de outubro.", practical_impact: "Entra em vigor." }),
      ]),
    );
    expect(r.every((x) => x.indice === 1)).toBe(true);
  });
});

describe("a linha de baixo repete a de cima", () => {
  /*
   * O par real da edição de 16/09/2026, que o dono apontou: o preheader era o
   * headline com siglas no lugar das palavras. Nenhum portão via isso, porque
   * a única semelhança de título que o sistema calculava comparava a pauta de
   * hoje com o histórico de outros dias.
   */
  it("pega o par real do topo da edição", () => {
    const r = conferirLinguagemDoLeitor({
      headline: "Corte adia regra para estudantes e intercambistas",
      preheader: "Corte adia regra para F-1, J-1 e I; a nova data de vigência ainda não foi informada",
      stories: [materia()],
    } as unknown as EditionContent);

    const achado = r.find((a) => a.motivo === "REDUNDANT_SUBHEAD");
    expect(achado).toBeDefined();
    expect(achado?.indice).toBe(-1);
    expect(achado?.descricao).toContain("preheader");
  });

  it("linha que acrescenta passa", () => {
    const r = conferirLinguagemDoLeitor({
      headline: "A regra do prazo fixo não vale a partir de hoje",
      preheader: "Quem tem visto de estudante continua com a permanência de sempre, sem pedir extensão",
      stories: [materia()],
    } as unknown as EditionContent);

    expect(r.filter((a) => a.motivo === "REDUNDANT_SUBHEAD")).toHaveLength(0);
  });

  it("compara a PRIMEIRA frase do resumo, não o resumo inteiro", () => {
    // Um resumo longo que começa repetindo o título tem semelhança baixa no
    // todo, e é exatamente o defeito: o leitor trava na primeira linha, que é
    // onde ele decide continuar.
    const r = conferirLinguagemDoLeitor(
      edicao([
        materia({
          title: "USCIS reduz prazo de análise da autorização de trabalho",
          summary:
            "O USCIS reduziu o prazo de análise da autorização de trabalho. " +
            "A mudança vale para pedidos protocolados a partir de outubro e alcança quem já " +
            "está com o processo parado na fila desde o ano passado, segundo o comunicado.",
        }),
      ]),
    );

    const achado = r.find((a) => a.motivo === "REDUNDANT_SUBHEAD");
    expect(achado).toBeDefined();
    expect(achado?.indice).toBe(0);
  });

  it("texto curto demais não é julgado", () => {
    // Abaixo de 15 caracteres não há palavra significativa suficiente para a
    // medida dizer alguma coisa, e apontar aí seria ruído no reparo.
    const r = conferirLinguagemDoLeitor({
      headline: "Prazo novo",
      preheader: "Prazo novo",
      stories: [materia()],
    } as unknown as EditionContent);

    expect(r.filter((a) => a.motivo === "REDUNDANT_SUBHEAD")).toHaveLength(0);
  });
});

describe("o protagonista de terceiro país", () => {
  /*
   * O caso real, apontado pelo dono em 16/09/2026: "O-1B para designer de
   * cenários do México: USCIS aprova com processamento premium". O fato é
   * verdadeiro e o visto interessa, mas quem lê está no Brasil indo para os
   * Estados Unidos, e a nacionalidade de um terceiro ocupava a primeira metade
   * da frase, que é onde deveria estar o que muda e para quem.
   */
  it("pega o gentílico que não é brasileiro nem americano", () => {
    const r = conferirLinguagemDoLeitor(
      edicao([materia({ title: "Cirurgião mexicano tem aprovação em caso de EB-2 NIW" })]),
    );
    const achado = r.find((a) => a.motivo === "FOREIGN_SUBJECT");
    expect(achado).toBeDefined();
    expect(achado?.descricao).toContain("mexicano");
  });

  it("brasileiro e americano continuam livres", () => {
    for (const titulo of [
      "Brasileiros com visto de estudante seguem no prazo de sempre",
      "Empregador americano passa a informar o salário antes do registro",
    ]) {
      const r = conferirLinguagemDoLeitor(edicao([materia({ title: titulo })]));
      expect(r.filter((a) => a.motivo === "FOREIGN_SUBJECT")).toHaveLength(0);
    }
  });

  it("não confunde palavra que contém o gentílico", () => {
    // "indiano" está dentro de "indianópolis", e a régua compara palavra
    // inteira justamente para não apontar isso.
    const r = conferirLinguagemDoLeitor(
      edicao([materia({ title: "Escritório de Indianópolis passa a atender pedidos de trabalho" })]),
    );
    expect(r.filter((a) => a.motivo === "FOREIGN_SUBJECT")).toHaveLength(0);
  });
});
