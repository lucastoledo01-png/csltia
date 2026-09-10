import { describe, expect, it } from "vitest";
import {
  ehIdentificador,
  extrairNumeros,
  numeroCompativel,
  numerosDoMaterial,
  type TipoDeNumero,
} from "./numeros-com-sentido";

/**
 * O defeito que este módulo existe para fechar, com os casos do próprio pedido.
 *
 * A conferência antiga comparava dígito com dígito. Com "INA 245(a)" no
 * material, a frase inventada "o processo leva 245 dias" passava, porque o 245
 * estava lá. Está mesmo, e é o número de uma norma.
 */

/** Um número gerado tem lastro neste material? */
function sustentado(material: string, gerado: string): { ok: boolean; motivo: string } {
  const doMaterial = numerosDoMaterial([material]);
  const noTexto = extrairNumeros(gerado);

  for (const n of noTexto) {
    const r = numeroCompativel(n, doMaterial);
    if (!r.ok) return { ok: false, motivo: r.motivo };
  }

  return { ok: true, motivo: "" };
}

function tipoDe(texto: string, valor: string): TipoDeNumero | undefined {
  return extrairNumeros(texto).find((n) => n.valor === valor)?.tipo;
}

describe("classificação pelo que o número é", () => {
  it("identificador de formulário, pelo prefixo com hífen", () => {
    expect(tipoDe("Envie o Form I-864 assinado.", "864")).toBe("form_identifier");
    expect(tipoDe("A peticao I-140 precisa ser aprovada.", "140")).toBe("form_identifier");
    expect(tipoDe("O N-400 é o pedido de cidadania.", "400")).toBe("form_identifier");
  });

  it("identificador de norma, pela sigla antes", () => {
    expect(tipoDe("See INA 245 for details.", "245")).toBe("legal_identifier");
    expect(tipoDe("Conforme a Lei 11.961, o prazo mudou.", "11961")).toBe("legal_identifier");
  });

  it("identificador de seção, pela palavra antes ou pela subseção depois", () => {
    expect(tipoDe("Veja a secao 203 do manual.", "203")).toBe("section_identifier");
    expect(tipoDe("O texto de 245(a) trata do ajuste.", "245")).toBe("section_identifier");
  });

  it("norma e seção são rótulos diferentes do mesmo papel, e é o papel que decide", () => {
    /*
     * "8 CFR 103.2" sai como norma, porque a sigla vem antes; "103.2(b)" sozinho
     * sairia como seção, pela subseção depois. A distinção não muda nada na
     * régua, e é isso que este teste registra: o que importa é que os dois são
     * IDENTIFICADOR, e identificador não sustenta quantidade.
     */
    expect(ehIdentificador(tipoDe("See 8 CFR 103.2(b)(8).", "1032")!)).toBe(true);
    expect(ehIdentificador(tipoDe("Veja a secao 203 do manual.", "203")!)).toBe(true);
    expect(ehIdentificador(tipoDe("A peticao I-140 foi aprovada.", "140")!)).toBe(true);
    expect(ehIdentificador(tipoDe("O prazo e de 140 dias.", "140")!)).toBe(false);
  });

  it("duração, moeda, percentual, contagem e ano", () => {
    expect(tipoDe("O prazo e de 540 dias.", "540")).toBe("duration");
    expect(tipoDe("A taxa e de US$ 1.440.", "1440")).toBe("currency");
    expect(tipoDe("Sao 3.271 dolares.", "3271")).toBe("currency");
    expect(tipoDe("A aprovacao ficou em 87%.", "87")).toBe("percentage");
    expect(tipoDe("Foram 1540 pedidos protocolados.", "1540")).toBe("count");
    expect(tipoDe("A regra vale desde 2024.", "2024")).toBe("date_year");
  });

  it("número sem marcador nenhum é genérico", () => {
    expect(tipoDe("A tabela mostra 87 na coluna do meio.", "87")).toBe("generic_number");
  });

  it("duração vence ano quando há unidade de tempo", () => {
    /*
     * "2026 dias" é duração, não ano. A ordem das regras importa, e é por isso
     * que ela está travada aqui.
     */
    expect(tipoDe("A espera chegou a 2026 dias.", "2026")).toBe("duration");
  });
});

describe("CASOS ADVERSARIAIS: identificadores nunca sustentam quantidade", () => {
  it("INA 245(a) não sustenta 245 dias", () => {
    const r = sustentado("See 8 CFR 245.1(c)(8) and INA 245(a).", "O processo leva 245 dias.");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("identificador");
  });

  it("Form I-864 não sustenta US$ 864", () => {
    const r = sustentado("Submit Form I-864, Affidavit of Support.", "A taxa e de US$ 864.");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("identificador");
  });

  it("I-140 não sustenta 140 dias", () => {
    const r = sustentado("A peticao I-140 e enviada pelo empregador.", "A analise leva 140 dias.");
    expect(r.ok).toBe(false);
  });

  it("seção 203 não sustenta 203 pedidos", () => {
    const r = sustentado("A secao 203 organiza as preferencias.", "Foram 203 pedidos aprovados.");
    expect(r.ok).toBe(false);
  });

  it("e o contrário também: quantidade no material não sustenta identificador no texto", () => {
    /*
     * A regra é simétrica de propósito. Um texto que cita "o Form I-540"
     * apoiado num material que diz "540 dias" está inventando um formulário.
     */
    const r = sustentado("O prazo e de 540 dias.", "Envie o Form I-540.");
    expect(r.ok).toBe(false);
  });
});

describe("CASOS ADVERSARIAIS: unidades diferentes não se sustentam", () => {
  it("60 dias não sustenta 60%", () => {
    const r = sustentado("O prazo de resposta e de 60 dias.", "A aprovacao fica em 60%.");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("duration");
  });

  it("US$ 1.440 não sustenta 1.440 pedidos", () => {
    const r = sustentado("The filing fee is US$ 1.440.", "Foram 1.440 pedidos no ano.");
    expect(r.ok).toBe(false);
  });

  it("87% não sustenta 87 dias", () => {
    const r = sustentado("A taxa de aprovacao foi de 87%.", "A espera e de 87 dias.");
    expect(r.ok).toBe(false);
  });
});

describe("CASOS ADVERSARIAIS: fronteira de dígito, o conserto que já existia", () => {
  it("1540 pedidos não sustenta 540 pedidos", () => {
    const r = sustentado("Foram 1540 pedidos protocolados.", "Foram 540 pedidos protocolados.");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("não aparece no material");
  });

  it("US$ 1.440 não sustenta US$ 440", () => {
    const r = sustentado("The filing fee is US$ 1.440.", "A taxa e de US$ 440.");
    expect(r.ok).toBe(false);
  });
});

describe("o que CONTINUA passando, porque é verdade", () => {
  it("o mesmo número com a mesma unidade", () => {
    expect(sustentado("O prazo e de 540 dias.", "A espera chega a 540 dias.").ok).toBe(true);
  });

  it("a mesma moeda em outra grafia", () => {
    expect(sustentado("The filing fee is US$ 1,440.", "A taxa e de US$ 1.440.").ok).toBe(true);
    expect(sustentado("The filing fee is US$ 1440.", "A taxa e de US$ 1.440.").ok).toBe(true);
  });

  it("o mesmo formulário citado no texto", () => {
    expect(sustentado("Submit Form I-864, Affidavit of Support.", "Envie o Form I-864.").ok).toBe(true);
  });

  it("número solto no material sustenta quantidade no texto", () => {
    /*
     * O material tem tabela sem unidade, e recusar isso derrubaria caso
     * legítimo. A direção perigosa é identificador virando quantidade, e essa
     * continua bloqueada.
     */
    expect(sustentado("A coluna do meio mostra 90.", "A analise leva 90 dias.").ok).toBe(true);
  });

  it("quantidade no texto sem unidade é sustentada por quantidade no material", () => {
    expect(sustentado("O prazo e de 90 dias.", "O numero e 90.").ok).toBe(true);
  });

  it("ano continua ano", () => {
    expect(sustentado("A regra vale desde 2024.", "Desde 2024 a regra e outra.").ok).toBe(true);
  });

  it("texto sem número nenhum passa", () => {
    expect(sustentado("Qualquer material.", "Uma frase sem numero.").ok).toBe(true);
  });
});

describe("o material é lido peça por peça", () => {
  it("a vizinhança não vaza de uma peça para a outra", () => {
    /*
     * Se o material fosse concatenado num texto só, o fim de uma peça viraria
     * a vizinhança do começo da seguinte, e "Form I-" de uma linha
     * classificaria o número da linha de baixo.
     */
    const doMaterial = numerosDoMaterial(["Submit Form I-864.", "245 dias de espera."]);
    const tipos = doMaterial.map((n) => `${n.valor}:${n.tipo}`);
    expect(tipos).toContain("864:form_identifier");
    expect(tipos).toContain("245:duration");
  });
});
