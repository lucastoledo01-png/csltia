import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, selecionarEvergreen } from "./selecao";
import { calcularVagas, comporFeedDoDia } from "./compositor";
import { identidadeDoItem } from "./tipos";
import type { TopicoEvergreen, UsoAnterior } from "./tipos";

/**
 * O risco do evergreen não é falta de assunto, é repetição.
 *
 * O que não pode acontecer, e é o caso que o dono do produto descreveu:
 * segunda "O que é EB-2 NIW?", quinta "Entenda o EB-2 NIW", domingo "Você
 * conhece o EB-2 NIW?" — três posts que o leitor vê como um só, publicado três
 * vezes.
 */

const HOJE = Date.parse("2026-09-09T12:00:00Z");
const diasAtras = (n: number) => new Date(HOJE - n * 24 * 60 * 60 * 1000).toISOString();

function topico(over: Partial<TopicoEvergreen> = {}): TopicoEvergreen {
  return {
    id: "eb2-niw",
    nome: "EB-2 NIW",
    familia: "visa_explainer",
    programa: "EB-2",
    resumo: "Residência por interesse nacional.",
    fontesCanonicas: ["https://www.uscis.gov/x"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o EB-2 NIW?" },
      { id: "evidencia", pergunta: "Que tipo de evidência aparece nesse pedido?" },
    ],
    ...over,
  };
}

const CATALOGO: TopicoEvergreen[] = [
  topico(),
  topico({ id: "o1a", nome: "O-1A", programa: "O-1", angulos: [{ id: "o-que-e", pergunta: "O que é o O-1A?" }] }),
  topico({
    id: "priority-date",
    nome: "Priority date",
    familia: "glossary",
    programa: undefined,
    angulos: [{ id: "o-que-e", pergunta: "O que é priority date?" }],
  }),
  topico({
    id: "visa-bulletin",
    nome: "Visa Bulletin",
    familia: "glossary",
    programa: undefined,
    angulos: [{ id: "como-funciona", pergunta: "Como o Visa Bulletin funciona?" }],
  }),
  topico({
    id: "consular",
    nome: "Processo consular",
    familia: "process_explainer",
    programa: undefined,
    angulos: [{ id: "etapas", pergunta: "Quais são as etapas do processo consular?" }],
  }),
];

const semHistorico: UsoAnterior[] = [];

/** Catálogo com folga em programa e família, para o teto do dia ser o que limita. */
const CATALOGO_GRANDE: TopicoEvergreen[] = [
  ...CATALOGO,
  topico({ id: "h1b", nome: "H-1B", programa: "H-1B", familia: "faq", angulos: [{ id: "a", pergunta: "1?" }] }),
  topico({ id: "f1", nome: "F-1", programa: "F-1", familia: "faq", angulos: [{ id: "a", pergunta: "2?" }] }),
  topico({ id: "l1", nome: "L-1", programa: "L-1", familia: "comparison", angulos: [{ id: "a", pergunta: "3?" }] }),
  topico({ id: "e2", nome: "E-2", programa: "E-2", familia: "comparison", angulos: [{ id: "a", pergunta: "4?" }] }),
  topico({ id: "rfe", nome: "RFE", familia: "evidence_education", programa: undefined, angulos: [{ id: "a", pergunta: "5?" }] }),
  topico({ id: "cartas", nome: "Cartas", familia: "evidence_education", programa: undefined, angulos: [{ id: "a", pergunta: "6?" }] }),
];

describe("cooldown do par tópico+ângulo", () => {
  it("o mesmo tópico e ângulo não volta antes de 30 dias", () => {
    const historico: UsoAnterior[] = [
      { storyId: "evg:eb2-niw:o-que-e", topicId: "evg:eb2-niw", quandoIso: diasAtras(10) },
    ];
    const r = selecionarEvergreen(CATALOGO, historico, 10, { agoraMs: HOJE });

    expect(r.escolhidos.map(identidadeDoItem)).not.toContain("evg:eb2-niw:o-que-e");
    const corte = r.cortados.find((c) => identidadeDoItem(c.item) === "evg:eb2-niw:o-que-e")!;
    expect(corte.motivo).toBe("COOLDOWN_DO_PAR");
  });

  it("depois de 30 dias o cooldown deixa de barrar", () => {
    /*
     * A asserção é sobre o cooldown, e não sobre o item aparecer.
     *
     * Passados os 30 dias ele volta a ser ELEGÍVEL, e ainda assim pode não sair
     * hoje: quem nunca saiu tem precedência, o teto de família pode encher
     * antes, e um ângulo irmão pode levar a vaga do tópico no dia. Exigir que
     * ele apareça mediria a ordenação e a diversidade juntas, e falharia por um
     * motivo que não é o desta regra.
     */
    const historico: UsoAnterior[] = [
      { storyId: "evg:eb2-niw:o-que-e", topicId: "evg:eb2-niw", quandoIso: diasAtras(31) },
    ];
    const r = selecionarEvergreen(CATALOGO, historico, 10, { agoraMs: HOJE });

    const corte = r.cortados.find((c) => identidadeDoItem(c.item) === "evg:eb2-niw:o-que-e");
    expect(corte?.motivo).not.toBe("COOLDOWN_DO_PAR");

    // E onde ele é o ÚNICO ângulo do tópico, sem irmão para disputar o dia, ele sai.
    const soEle = selecionarEvergreen(
      [topico({ angulos: [{ id: "o-que-e", pergunta: "O que é o EB-2 NIW?" }] })],
      historico,
      10,
      { agoraMs: HOJE },
    );
    expect(soEle.escolhidos.map(identidadeDoItem)).toContain("evg:eb2-niw:o-que-e");
  });
});

describe("janela do tópico", () => {
  it("outro ângulo do mesmo tópico não sai na mesma semana", () => {
    /*
     * É este o caso do "EB-2 NIW três vezes". O par é diferente, então o
     * cooldown de 30 dias não pega; quem pega é a janela do tópico.
     */
    const historico: UsoAnterior[] = [
      { storyId: "evg:eb2-niw:o-que-e", topicId: "evg:eb2-niw", quandoIso: diasAtras(3) },
    ];
    const r = selecionarEvergreen(CATALOGO, historico, 10, { agoraMs: HOJE });

    expect(r.escolhidos.map(identidadeDoItem)).not.toContain("evg:eb2-niw:evidencia");
    const corte = r.cortados.find((c) => identidadeDoItem(c.item) === "evg:eb2-niw:evidencia")!;
    expect(corte.motivo).toBe("TOPICO_NA_JANELA");
  });

  it("passada a janela, o outro ângulo entra", () => {
    const historico: UsoAnterior[] = [
      { storyId: "evg:eb2-niw:o-que-e", topicId: "evg:eb2-niw", quandoIso: diasAtras(8) },
    ];
    const r = selecionarEvergreen(CATALOGO, historico, 10, { agoraMs: HOJE });
    expect(r.escolhidos.map(identidadeDoItem)).toContain("evg:eb2-niw:evidencia");
  });
});

describe("diversidade do dia", () => {
  it("dois ângulos do mesmo tópico não saem no mesmo dia", () => {
    /*
     * A janela de sete dias olha o histórico, e por isso não via dois ângulos
     * escolhidos na MESMA rodada: nenhum dos dois estava no histórico ainda.
     *
     * O preview de três dias mostrou o resultado: dois posts seguidos sobre
     * comprovação de investimento, um sobre a origem do dinheiro e outro sobre
     * o caminho dele, no mesmo dia. Para quem abre o feed é o mesmo assunto
     * duas vezes.
     */
    const r = selecionarEvergreen([CATALOGO[0]], semHistorico, 10, { agoraMs: HOJE });

    expect(r.escolhidos).toHaveLength(1);
    expect(r.cortados.some((c) => c.motivo === "TOPICO_JA_NO_DIA")).toBe(true);
  });

  it("nenhum tópico aparece duas vezes no mesmo dia, no catálogo inteiro", () => {
    const r = selecionarEvergreen(CATALOGO_GRANDE, semHistorico, 10, { agoraMs: HOJE });
    const topicos = r.escolhidos.map((e) => e.topico.id);
    expect(new Set(topicos).size).toBe(topicos.length);
  });

  it("um visto não domina o feed", () => {
    /*
     * Quatro TÓPICOS do mesmo programa, e não quatro ângulos de um tópico: com
     * um tópico só, quem corta é a régua de um-tópico-por-dia, e o teto de
     * programa nunca seria exercido. Famílias distintas para o teto de família
     * também ficar de fora da conta.
     */
    const soEb2: TopicoEvergreen[] = [
      topico({ id: "eb2-a", familia: "visa_explainer", angulos: [{ id: "a", pergunta: "1?" }] }),
      topico({ id: "eb2-b", familia: "glossary", angulos: [{ id: "a", pergunta: "2?" }] }),
      topico({ id: "eb2-c", familia: "faq", angulos: [{ id: "a", pergunta: "3?" }] }),
      topico({ id: "eb2-d", familia: "comparison", angulos: [{ id: "a", pergunta: "4?" }] }),
    ];
    const r = selecionarEvergreen(soEb2, semHistorico, 10, { agoraMs: HOJE });

    // Teto de 2 por programa, mesmo com quatro tópicos disponíveis e dez vagas.
    expect(r.escolhidos).toHaveLength(2);
    expect(r.cortados.filter((c) => c.motivo === "PROGRAMA_JA_NO_DIA")).toHaveLength(2);
  });

  it("uma família não domina o feed", () => {
    /*
     * A régua que mais muda a cara do perfil. O glossário tem mais termos que
     * qualquer outra família e ganharia sempre no desempate.
     */
    const r = selecionarEvergreen(CATALOGO, semHistorico, 10, { agoraMs: HOJE });
    const familias = r.escolhidos.map((e) => e.topico.familia);
    for (const f of new Set(familias)) {
      expect(familias.filter((x) => x === f).length).toBeLessThanOrEqual(CONFIG_PADRAO.maximoPorFamiliaNoDia);
    }
  });

  it("o assunto que a NOTÍCIA trouxe hoje é cedido pelo evergreen", () => {
    /*
     * Este teste afirmava algo mais fraco: que o programa da notícia CONTAVA no
     * teto. Com teto 2, a notícia sobre EB-2 e um explicador de EB-2 caberiam no
     * mesmo dia, e para quem rola o feed isso é "USCIS atualiza regra do EB-2"
     * seguido de "Entenda o EB-2".
     *
     * A régua agora exclui: a notícia tem prazo, o explicador estará igual na
     * semana que vem, e o evergreen cede a vaga para OUTRO tópico, o que é
     * diferente de perder a vaga.
     */
    const r = selecionarEvergreen(CATALOGO, semHistorico, 10, {
      agoraMs: HOJE,
      ocupacaoDoDia: { programas: ["EB-2"] },
    });

    expect(r.escolhidos.map((e) => e.topico.programa)).not.toContain("EB-2");
    expect(r.cortados.some((c) => c.motivo === "ASSUNTO_DA_NOTICIA_HOJE")).toBe(true);

    /* E cedeu a vaga: outros tópicos entraram no lugar. */
    expect(r.escolhidos.length).toBeGreaterThan(0);
  });

  it("uma notícia só já basta para o evergreen ceder aquele assunto", () => {
    /*
     * Antes eram necessárias duas notícias do mesmo programa para encher o
     * teto. Uma basta, porque a régua não é de quantidade: é de repetição.
     */
    const r = selecionarEvergreen(CATALOGO, semHistorico, 10, {
      agoraMs: HOJE,
      ocupacaoDoDia: { programas: ["EB-2"] },
    });
    expect(r.cortados.some((c) => c.motivo === "ASSUNTO_DA_NOTICIA_HOJE")).toBe(true);
  });
});

describe("giro do catálogo", () => {
  it("quem nunca saiu vem antes de quem já saiu", () => {
    const historico: UsoAnterior[] = [
      { storyId: "evg:o1a:o-que-e", topicId: "evg:o1a", quandoIso: diasAtras(40) },
    ];
    const r = selecionarEvergreen(CATALOGO, historico, 1, { agoraMs: HOJE });

    // O O-1A está elegível (40 dias), mas quem nunca saiu tem precedência.
    expect(r.escolhidos.map(identidadeDoItem)).not.toContain("evg:o1a:o-que-e");
  });

  it("entre nunca usados a ordem é estável, para a simulação ser reproduzível", () => {
    const a = selecionarEvergreen(CATALOGO, semHistorico, 3, { agoraMs: HOJE });
    const b = selecionarEvergreen(CATALOGO, semHistorico, 3, { agoraMs: HOJE });
    expect(a.escolhidos.map(identidadeDoItem)).toEqual(b.escolhidos.map(identidadeDoItem));
  });
});

describe("o teto do dia é limite, não meta", () => {
  it("dez vagas livres não autorizam dez posts permanentes", () => {
    /*
     * A primeira simulação de sete dias fechou todos os dias em dez e queimou
     * 64 das 180 combinações numa semana. No vigésimo dia não haveria nada
     * elegível e o feed cairia de dez para zero.
     *
     * A conta que fixa o teto: com cooldown de 30 dias por par, o regime
     * permanente é combinações/30.
     */
    const r = selecionarEvergreen(CATALOGO_GRANDE, semHistorico, 10, { agoraMs: HOJE });

    expect(r.escolhidos.length).toBeLessThanOrEqual(CONFIG_PADRAO.maximoNoDia);
    expect(r.cortados.some((c) => c.motivo === "TETO_DO_DIA")).toBe(true);
  });

  it("o corte por teto se distingue do corte por falta de vaga", () => {
    // Um diz "o catálogo não sustenta mais que isto"; o outro, "a notícia
    // ocupou o dia". São decisões diferentes e o relatório precisa separá-las.
    const comTeto = selecionarEvergreen(CATALOGO_GRANDE, semHistorico, 10, { agoraMs: HOJE });
    expect(comTeto.cortados.some((c) => c.motivo === "TETO_DO_DIA")).toBe(true);

    const semVaga = selecionarEvergreen(CATALOGO_GRANDE, semHistorico, 2, { agoraMs: HOJE });
    expect(semVaga.escolhidos).toHaveLength(2);
    expect(semVaga.cortados.some((c) => c.motivo === "SEM_VAGA")).toBe(true);
  });

  it("duas vagas com teto de quatro devolve duas: quem limita é o menor", () => {
    const r = selecionarEvergreen(CATALOGO_GRANDE, semHistorico, 2, { agoraMs: HOJE });
    expect(r.escolhidos).toHaveLength(2);
  });
});

describe("vagas", () => {
  it("zero vaga devolve zero escolhido, sem gastar nada", () => {
    const r = selecionarEvergreen(CATALOGO, semHistorico, 0, { agoraMs: HOJE });
    expect(r.escolhidos).toHaveLength(0);
    expect(r.cortados).toHaveLength(0);
  });

  it("o excedente é cortado por SEM_VAGA, e não some do relatório", () => {
    const r = selecionarEvergreen(CATALOGO, semHistorico, 1, { agoraMs: HOJE });
    expect(r.escolhidos).toHaveLength(1);
    expect(r.cortados.some((c) => c.motivo === "SEM_VAGA")).toBe(true);
  });
});

describe("o compositor do dia", () => {
  it("dez notícias não deixam vaga", () => {
    const v = calcularVagas(10, 10);
    expect(v.restantes).toBe(0);
  });

  it("três notícias deixam sete vagas", () => {
    expect(calcularVagas(3, 10).restantes).toBe(7);
  });

  it("zero notícia deixa o dia inteiro para o evergreen", () => {
    expect(calcularVagas(0, 10).restantes).toBe(10);
  });

  it("notícia acima do teto não gera vaga negativa", () => {
    expect(calcularVagas(12, 10).restantes).toBe(0);
  });

  it("a notícia vem primeiro e o evergreen ocupa o resto", () => {
    const itens = selecionarEvergreen(CATALOGO, semHistorico, 10, { agoraMs: HOJE }).escolhidos;
    const feed = comporFeedDoDia(["n1", "n2", "n3"], itens, 10);

    expect(feed.noticias).toEqual(["n1", "n2", "n3"]);
    expect(feed.total).toBeLessThanOrEqual(10);
    expect(feed.evergreen.length).toBeLessThanOrEqual(7);
  });

  it("o teto nunca é meta: sem evergreen elegível o dia sai pequeno", () => {
    const feed = comporFeedDoDia(["n1", "n2"], [], 10);
    expect(feed.total).toBe(2);
  });

  it("dez notícias e o evergreen não entra", () => {
    const itens = selecionarEvergreen(CATALOGO, semHistorico, 10, { agoraMs: HOJE }).escolhidos;
    const feed = comporFeedDoDia(Array.from({ length: 10 }, (_, i) => `n${i}`), itens, 10);
    expect(feed.evergreen).toHaveLength(0);
    expect(feed.total).toBe(10);
  });
});

describe("desempate de formato: só entre itens de mérito igual", () => {
  const cheio = (over: Partial<TopicoEvergreen> = {}) => topico(over);

  /** Catálogo com estáticos e carrosséis previstos, todos nunca usados. */
  const MISTO: TopicoEvergreen[] = [
    cheio({ id: "a-visa", familia: "visa_explainer", programa: "EB-1", angulos: [{ id: "x", pergunta: "1?" }] }),
    cheio({ id: "b-visa", familia: "comparison", programa: "EB-3", angulos: [{ id: "x", pergunta: "2?" }] }),
    cheio({ id: "c-glos", familia: "glossary", programa: undefined, angulos: [{ id: "x", pergunta: "3?" }] }),
    cheio({ id: "d-proc", familia: "process_explainer", programa: "L-1", angulos: [{ id: "x", pergunta: "4?" }] }),
    cheio({ id: "e-faq", familia: "faq", programa: "O-1", angulos: [{ id: "x", pergunta: "5?" }] }),
  ];

  const previsto = (t: TopicoEvergreen) =>
    t.familia === "glossary" || t.familia === "faq" ? "S" : "C";

  it("a sequência de formatos previstos alterna em vez de empilhar", () => {
    /*
     * O benchmark deu dias inteiros com quatro carrosséis seguidos, e nenhuma
     * reordenação posterior resolve: se os quatro escolhidos são carrossel, não
     * há estático para intercalar. Quem quebra a sequência é a seleção.
     */
    const r = selecionarEvergreen(MISTO, semHistorico, 10, { agoraMs: HOJE });
    const desenho = r.escolhidos.map((e) => previsto(e.topico)).join("");

    expect(desenho).not.toContain("CCC");
    expect(desenho).toContain("S");
  });

  it("desligada, a ordem volta a ser a alfabética de antes", () => {
    const desligada = selecionarEvergreen(MISTO, semHistorico, 10, {
      agoraMs: HOJE,
      config: { ...CONFIG_PADRAO, alternarFormato: false },
    });

    expect(desligada.escolhidos.map((e) => e.topico.id)).toEqual(
      [...desligada.escolhidos].map((e) => e.topico.id).sort(),
    );
  });

  it("o desempate pode mudar QUEM entra, e é isso que o pedido pede", () => {
    /*
     * A primeira versão deste teste exigia o mesmo conjunto, e estava errada: o
     * teto de família interage com a ORDEM, então adiantar um glossário faz uma
     * família diferente ocupar vaga e um item diferente ser cortado depois.
     *
     * O pedido diz "preferir a COMBINAÇÃO que melhora a diversidade de
     * formato", ou seja o conjunto pode mudar. A fronteira que não pode ser
     * cruzada é outra, e é a do teste seguinte: nenhum item de mérito menor
     * passa na frente de um de mérito maior. Aqui todos empatam, porque nenhum
     * saiu ainda.
     */
    const ligada = selecionarEvergreen(MISTO, semHistorico, 10, { agoraMs: HOJE });
    const desligada = selecionarEvergreen(MISTO, semHistorico, 10, {
      agoraMs: HOJE,
      config: { ...CONFIG_PADRAO, alternarFormato: false },
    });

    expect(ligada.escolhidos).toHaveLength(desligada.escolhidos.length);

    /* Todos os escolhidos, nos dois casos, são itens que nunca saíram. */
    const usados = new Set(semHistorico.map((h) => h.storyId));
    for (const e of [...ligada.escolhidos, ...desligada.escolhidos]) {
      expect(usados.has(identidadeDoItem(e))).toBe(false);
    }
  });

  it("não promove item de mérito menor sobre item de mérito maior", () => {
    /*
     * É a fronteira entre desempate e quota. O item usado há 40 dias é
     * elegível e é PIOR que os que nunca saíram: nenhuma preferência de formato
     * pode fazê-lo passar na frente.
     */
    const usadoHa40 = cheio({
      id: "z-glos",
      familia: "glossary",
      programa: undefined,
      angulos: [{ id: "x", pergunta: "9?" }],
    });
    const historico: UsoAnterior[] = [
      { storyId: "evg:z-glos:x", topicId: "evg:z-glos", quandoIso: diasAtras(40) },
    ];

    const r = selecionarEvergreen([...MISTO, usadoHa40], historico, 1, { agoraMs: HOJE });

    expect(r.escolhidos).toHaveLength(1);
    expect(r.escolhidos[0].topico.id).not.toBe("z-glos");
  });

  it("é determinística: duas chamadas idênticas devolvem a mesma ordem", () => {
    const a = selecionarEvergreen(MISTO, semHistorico, 10, { agoraMs: HOJE });
    const b = selecionarEvergreen(MISTO, semHistorico, 10, { agoraMs: HOJE });
    expect(a.escolhidos.map(identidadeDoItem)).toEqual(b.escolhidos.map(identidadeDoItem));
  });

  it("catálogo de um formato só não é afetado", () => {
    const soCarrossel = MISTO.filter((t) => previsto(t) === "C");
    const r = selecionarEvergreen(soCarrossel, semHistorico, 10, { agoraMs: HOJE });
    expect(r.escolhidos.length).toBeGreaterThan(0);
    expect(r.escolhidos.every((e) => previsto(e.topico) === "C")).toBe(true);
  });
});
