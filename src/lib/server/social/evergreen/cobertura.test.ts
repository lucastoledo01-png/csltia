import { describe, expect, it } from "vitest";
import { conferirCobertura, termosDoTopico, MOTIVO_SEM_COBERTURA } from "./cobertura";
import { CATALOGO_EVERGREEN } from "./catalogo";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { ItemEvergreen, TopicoEvergreen } from "./tipos";

/**
 * O caso que motivou a régua, com o pacote que a fonte real devolveu.
 *
 * Tópico "B-1 e B-2 (negócios e turismo)". As três fontes canônicas
 * responderam (1.637, 3.933 e 19.012 caracteres) e o extrator devolveu 26
 * fatos, nenhum sobre B-1, B-2, negócios ou turismo: eram fatos sobre inspeção
 * da CBP, ESTA, I-94 e o domínio .gov. O post que saiu foi "A fonte não define
 * B-1 e B-2", que é diagnóstico interno vestido de conteúdo.
 */

function pacote(fatos: string[], gaps: string[] = []): PacoteFactual {
  return {
    verified_facts: fatos,
    people: [],
    organizations: ["CBP"],
    places: ["Estados Unidos"],
    dates: [],
    numbers: [],
    gaps,
    source_urls: ["https://www.cbp.gov/travel/international-visitors"],
    texto_de_origem: fatos.join(" "),
  } as PacoteFactual;
}

/** Os fatos que a CBP devolveu de verdade, verbatim da medição. */
const FATOS_DA_CBP = [
  "Sites oficiais usam o domínio .gov.",
  "Sites seguros .gov usam HTTPS.",
  "Todas as pessoas que chegam a um ponto de entrada nos Estados Unidos estão sujeitas à inspeção por agentes do CBP.",
  "Agentes do CBP conduzem as etapas de imigração, alfândega e agricultura do processo de inspeção.",
  "O ESTA é um sistema automatizado que determina a elegibilidade de visitantes para viajar aos Estados Unidos.",
  "A autorização pelo ESTA não determina se um viajante será admitido nos Estados Unidos.",
  "Viajantes internacionais que visitam os Estados Unidos podem solicitar um I-94 provisório.",
  "O registro I-94/I-95 é uma prova do status legal de visitante.",
  "Na fronteira terrestre, os viajantes recebem I-94 eletronicamente.",
];

const LACUNAS_DA_CBP = [
  "A matéria não explica por que B-1 e B-2 aparecem juntas no mesmo visto.",
  "A matéria não informa quais atividades diferenciam o uso do B-1 do uso do B-2.",
];

function item(topicoId: string): ItemEvergreen {
  const topico = CATALOGO_EVERGREEN.find((t) => t.id === topicoId);
  if (!topico) throw new Error(`tópico ${topicoId} não está no catálogo`);
  return { topico, angulo: topico.angulos[0] };
}

function itemSintetico(over: Partial<TopicoEvergreen>): ItemEvergreen {
  const topico: TopicoEvergreen = {
    id: "t",
    nome: "Tema",
    familia: "visa_explainer",
    resumo: "r",
    fontesCanonicas: ["https://www.uscis.gov/x"],
    angulos: [{ id: "a", pergunta: "O que e isso?" }],
    ...over,
  };
  return { topico, angulo: topico.angulos[0] };
}

describe("o caso B-1/B-2, com o pacote que a fonte devolveu de verdade", () => {
  it("é DESCARTADO: 26 fatos e nenhum sobre o assunto", () => {
    const r = conferirCobertura(item("b1-b2"), pacote(FATOS_DA_CBP, LACUNAS_DA_CBP));

    expect(r.ok).toBe(false);
    expect(r.fatosNoAssunto).toBe(0);
    expect(r.motivo).toContain(MOTIVO_SEM_COBERTURA);
  });

  it("a lacuna que descreve a ausência NÃO conta como cobertura", () => {
    /*
     * As lacunas mencionam B-1 e B-2 justamente para dizer que a fonte não
     * fala delas. Contá-las seria transformar a confissão da ausência em prova
     * da presença, que é exatamente o post que se quer impedir.
     */
    const r = conferirCobertura(item("b1-b2"), pacote([], LACUNAS_DA_CBP));
    expect(r.ok).toBe(false);
    expect(r.fatosNoAssunto).toBe(0);
  });

  it("com a fonte certa, o mesmo tópico passa", () => {
    const r = conferirCobertura(
      item("b1-b2"),
      pacote([
        "O visto B-1 é para viagens de negócios, como reuniões e conferências.",
        "O visto B-2 é para turismo, visita a parentes e tratamento médico.",
        "B-1 e B-2 costumam ser emitidos juntos no mesmo visto de visitante.",
      ]),
    );

    expect(r.ok).toBe(true);
    expect(r.fatosNoAssunto).toBe(3);
  });
});

describe("os termos que identificam o assunto", () => {
  it("saem do programa e do nome, incluindo o que está entre parênteses", () => {
    expect(termosDoTopico(item("b1-b2"))).toEqual(
      expect.arrayContaining(["b-1", "b-2", "negocios", "turismo"]),
    );
  });

  it("NÃO saem da pergunta do ângulo", () => {
    /*
     * A pergunta é escrita em linguagem de gente e usa palavras genéricas
     * ("o que cada uma dessas letras deixa você fazer") que casariam com quase
     * qualquer fato. Usá-la como identificador tornaria a régua inútil.
     */
    const termos = termosDoTopico(item("b1-b2"));
    expect(termos).not.toContain("letras");
    expect(termos).not.toContain("juntas");
  });

  it("palavra comum do nome não vira identificador", () => {
    const termos = termosDoTopico(itemSintetico({ nome: "Como funciona o pedido", programa: undefined }));
    expect(termos).not.toContain("como");
    expect(termos).not.toContain("funciona");
  });
});

describe("o piso é dois fatos, e o motivo é a menção de passagem", () => {
  it("um fato só não basta", () => {
    const r = conferirCobertura(
      itemSintetico({ nome: "EB-2 NIW", programa: "EB-2" }),
      pacote([
        "O EB-2 NIW dispensa oferta de trabalho quando o interesse nacional e demonstrado.",
        "A USCIS analisa cada pedido individualmente.",
        "O processo tem etapas definidas em regulamento.",
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.fatosNoAssunto).toBe(1);
  });

  it("dois fatos bastam", () => {
    const r = conferirCobertura(
      itemSintetico({ nome: "EB-2 NIW", programa: "EB-2" }),
      pacote([
        "O EB-2 NIW dispensa oferta de trabalho quando o interesse nacional e demonstrado.",
        "O pedido de EB-2 exige comprovacao de grau avancado ou habilidade excepcional.",
        "A USCIS analisa cada pedido individualmente.",
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.fatosNoAssunto).toBe(2);
  });

  it("acento não impede o casamento", () => {
    const r = conferirCobertura(
      itemSintetico({ nome: "Traducao de documentos", programa: undefined }),
      pacote([
        "A tradução completa para o inglês é exigida em todo documento em outra língua.",
        "A tradução precisa vir com certificação do tradutor.",
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.fatosNoAssunto).toBe(2);
  });
});

describe("a régua não descarta por defeito próprio", () => {
  it("tópico sem termo identificável passa, e diz que não pôde medir", () => {
    const r = conferirCobertura(
      itemSintetico({ nome: "Como e quando", programa: undefined }),
      pacote(["Um fato qualquer sobre o processo."]),
    );
    expect(r.ok).toBe(true);
    expect(r.motivo).toContain("não pôde ser medida");
  });

  it("todo tópico do catálogo real tem pelo menos um termo identificável", () => {
    /*
     * Se um tópico do catálogo não tem termo, ele passa sem conferência, e é
     * melhor saber disso por teste do que descobrir num post publicado.
     */
    const semTermo = CATALOGO_EVERGREEN.filter((t) => termosDoTopico({ topico: t, angulo: t.angulos[0] }).length === 0);
    expect(semTermo.map((t) => t.id)).toEqual([]);
  });
});
