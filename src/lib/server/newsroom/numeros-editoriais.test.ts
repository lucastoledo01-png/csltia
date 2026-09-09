import { describe, expect, it } from "vitest";
import { formatarNumerosDaEdicao, formatarNumerosDoTexto } from "./numeros-editoriais";
import type { EditionContent } from "./schemas";

/**
 * O caso que motivou: "Dólar fecha a R$ 5,0857".
 *
 * Quatro casas é a precisão do Banco Central, não a de quem lê no ônibus. As
 * duas últimas não mudam decisão nenhuma e fazem o texto parecer terminal de
 * mercado.
 */

describe("moeda", () => {
  it("real com quatro casas cai para duas", () => {
    expect(formatarNumerosDoTexto("Dólar fecha a R$ 5,0857")).toBe("Dólar fecha a R$ 5,09");
  });

  it("arredonda, não trunca", () => {
    expect(formatarNumerosDoTexto("R$ 5,0857")).toBe("R$ 5,09");
    expect(formatarNumerosDoTexto("R$ 5,0812")).toBe("R$ 5,08");
  });

  it("dólar e euro também", () => {
    expect(formatarNumerosDoTexto("US$ 1,2345")).toBe("US$ 1,23");
    expect(formatarNumerosDoTexto("€ 0,9876")).toBe("€ 0,99");
    expect(formatarNumerosDoTexto("$ 3,14159")).toBe("$ 3,14");
  });

  it("centavo zerado sai, porque não acrescenta nada", () => {
    // "R$ 5,00" e "R$ 5" dizem o mesmo com menos ruído.
    expect(formatarNumerosDoTexto("taxa de R$ 5,00")).toBe("taxa de R$ 5");
    expect(formatarNumerosDoTexto("taxa de R$ 5,0001")).toBe("taxa de R$ 5");
  });

  it("centavo que existe fica", () => {
    expect(formatarNumerosDoTexto("R$ 5,10")).toBe("R$ 5,10");
    expect(formatarNumerosDoTexto("R$ 1.234,56")).toBe("R$ 1.234,56");
  });

  it("o separador de milhar é reescrito, senão a correção piora a leitura", () => {
    expect(formatarNumerosDoTexto("R$ 1.234,5678")).toBe("R$ 1.234,57");
    expect(formatarNumerosDoTexto("R$ 12.345.678,912")).toBe("R$ 12.345.678,91");
  });

  it("valor já limpo não muda", () => {
    expect(formatarNumerosDoTexto("R$ 410")).toBe("R$ 410");
  });

  it("preserva o espaçamento e o prefixo como estavam", () => {
    expect(formatarNumerosDoTexto("R$5,0857")).toBe("R$ 5,09");
    expect(formatarNumerosDoTexto("USD 1,239")).toBe("USD 1,24");
  });
});

describe("percentual", () => {
  it("duas casas bastam", () => {
    expect(formatarNumerosDoTexto("alta de 0,4231%")).toBe("alta de 0,42%");
    expect(formatarNumerosDoTexto("+0,42%")).toBe("+0,42%");
  });

  it("por cento escrito também conta", () => {
    expect(formatarNumerosDoTexto("subiu 3,4567 por cento")).toBe("subiu 3,46 por cento");
  });

  it("percentual inteiro não ganha casa decimal", () => {
    expect(formatarNumerosDoTexto("teto de 15%")).toBe("teto de 15%");
    expect(formatarNumerosDoTexto("teto de 15,00%")).toBe("teto de 15%");
  });
});

describe("valores muito pequenos e muito grandes", () => {
  it("valor que arredondaria para zero mantém a primeira casa significativa", () => {
    /*
     * `0,0004` com duas casas viraria `0,00`, que não é imprecisão: é dizer que
     * o número é zero quando ele não é.
     */
    expect(formatarNumerosDoTexto("variação de R$ 0,0004")).toBe("variação de R$ 0,0004");
    expect(formatarNumerosDoTexto("0,00007%")).toBe("0,00007%");
  });

  it("valor grande fica legível, com milhar", () => {
    expect(formatarNumerosDoTexto("R$ 1.500.000,00")).toBe("R$ 1.500.000");
    expect(formatarNumerosDoTexto("US$ 987.654,3219")).toBe("US$ 987.654,32");
  });
});

describe("o que NÃO pode ser tocado", () => {
  it("número de formulário não é grandeza", () => {
    for (const t of ["Formulário I-765", "o I-864 exige", "EB-2 NIW", "H-1B", "DS-160", "N-400"]) {
      expect(formatarNumerosDoTexto(t), t).toBe(t);
    }
  });

  it("ano, prazo e contagem ficam intactos", () => {
    for (const t of ["a partir de 2027", "prazo de 45 dias", "1.200 vagas", "3 de outubro"]) {
      expect(formatarNumerosDoTexto(t), t).toBe(t);
    }
  });

  it("texto vazio não explode", () => {
    expect(formatarNumerosDoTexto("")).toBe("");
  });

  it("frase com moeda e formulário na mesma linha corrige só a moeda", () => {
    expect(formatarNumerosDoTexto("A taxa do I-765 passa a R$ 410,0000 em 2027")).toBe(
      "A taxa do I-765 passa a R$ 410 em 2027",
    );
  });
});

describe("a edição inteira", () => {
  const edicao = {
    subject_options: ["dólar a R$ 5,0857", "b", "c"],
    subject: "dólar fecha a R$ 5,0857",
    preheader: "O dólar fechou a R$ 5,0857 e o que isso muda para quem vai mudar de país.",
    headline: "Dólar a R$ 5,0857",
    intro: "Bom dia. O dólar fechou a R$ 5,0857 ontem.",
    stories: [
      {
        rank: 1,
        category: "Custo de vida",
        title: "Dólar fecha a R$ 5,0857 e encarece a mudança",
        summary: "O dólar fechou a R$ 5,0857, alta de 0,4231%.",
        context: "No mês, a moeda subiu 1,2345%.",
        why_it_matters: "Cada R$ 0,1000 pesa na conta de quem vai mudar.",
        practical_impact: "Quem paga taxa em dólar sente agora.",
        humor_line: "O dólar não avisa.",
        source_name: "Banco Central",
        source_url: "https://bcb.gov.br/taxa?valor=5,0857",
        secondary_urls: [],
      },
    ],
    quick_bits: [{ title: "Taxa", text: "A taxa foi a R$ 410,0000.", url: "https://x.com/1,2345" }],
    closing: "Compartilhe.",
    final_line: "Até amanhã.",
  } as unknown as EditionContent;

  const r = formatarNumerosDaEdicao(edicao);

  it("formata todos os campos que o leitor lê", () => {
    expect(r.subject).toBe("dólar fecha a R$ 5,09");
    expect(r.subject_options[0]).toBe("dólar a R$ 5,09");
    expect(r.headline).toBe("Dólar a R$ 5,09");
    expect(r.preheader).toContain("R$ 5,09");
    expect(r.intro).toContain("R$ 5,09");
    expect(r.stories[0].title).toContain("R$ 5,09");
    expect(r.stories[0].summary).toBe("O dólar fechou a R$ 5,09, alta de 0,42%.");
    expect(r.stories[0].context).toBe("No mês, a moeda subiu 1,23%.");
    expect(r.stories[0].why_it_matters).toBe("Cada R$ 0,10 pesa na conta de quem vai mudar.");
    expect(r.quick_bits[0].text).toBe("A taxa foi a R$ 410.");
  });

  it("NÃO toca na URL da fonte, que não é grandeza", () => {
    // Mexer aqui quebraria o link, e link quebrado é pior que quatro casas.
    expect(r.stories[0].source_url).toBe("https://bcb.gov.br/taxa?valor=5,0857");
    expect(r.quick_bits[0].url).toBe("https://x.com/1,2345");
  });

  it("não muda o dado de origem: o objeto recebido continua intacto", () => {
    // A camada é de apresentação. O que está gravado no banco é o da fonte.
    expect(edicao.stories[0].summary).toBe("O dólar fechou a R$ 5,0857, alta de 0,4231%.");
  });
});
