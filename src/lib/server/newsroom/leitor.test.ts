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
      "Famílias que já protocolaram devem acompanhar o novo prazo.",
      "Quem espera a autorização recebe resposta mais rápido.",
    ]) {
      const r = conferirLinguagemDoLeitor(edicao([materia({ why_it_matters: quem, practical_impact: quem })]));
      expect(r.map((x) => x.motivo), quem).not.toContain("LOW_READER_RELEVANCE");
    }
  });

  it("campo vazio é apontado", () => {
    const r = conferirLinguagemDoLeitor(edicao([materia({ why_it_matters: "", practical_impact: "" })]));
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
