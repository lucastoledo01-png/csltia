import { describe, expect, it } from "vitest";
import { aplicarFormaDoAssunto, escolherAssunto, normalizarAssunto, problemasDoAssunto } from "./assunto";
import { INSTRUCAO_PADRAO_ASSUNTO } from "./pipeline";
import { EditionContentSchema } from "./schemas";

describe("normalizarAssunto", () => {
  it("põe em caixa baixa inteira, nome próprio e sigla inclusive", () => {
    // O caso real de produção que motivou a conferência.
    expect(normalizarAssunto("O Alasca entrou na conta")).toBe("o alasca entrou na conta");
    expect(normalizarAssunto("O dia que o STF rachou")).toBe("o dia que o stf rachou");
  });

  it("mantém R$ e US$ como símbolo, porque r$ não é caixa baixa de nada", () => {
    expect(normalizarAssunto("O advogado que apostou R$ 5 bi no Tigrinho")).toBe(
      "o advogado que apostou R$ 5 bi no tigrinho",
    );
    expect(normalizarAssunto("A lista dos US$ 30 bilhões")).toBe("a lista dos US$ 30 bilhões");
  });

  it("tira o ponto final e as reticências, e mantém a interrogação", () => {
    expect(normalizarAssunto("a nike saiu do top-100.")).toBe("a nike saiu do top-100");
    expect(normalizarAssunto("a reviravolta eleitoral...")).toBe("a reviravolta eleitoral");
    expect(normalizarAssunto("Quem vai sofrer impeachment?")).toBe("quem vai sofrer impeachment?");
  });

  it("troca travessão por vírgula", () => {
    expect(normalizarAssunto("lula \u2014 trump na onu")).toBe("lula, trump na onu");
  });
});

describe("problemasDoAssunto", () => {
  it("aceita os cinco formatos do The News", () => {
    for (const s of [
      "quem vai sofrer impeachment?",
      "nikolas & vorcaro",
      "lula, trump e delcy na onu",
      "o advogado que apostou R$ 5 bi no tigrinho",
      "a balada com 20 homens e 120 mulheres",
      "o dia que o stf rachou",
    ]) {
      expect(problemasDoAssunto(s), s).toEqual([]);
    }
  });

  it("aponta tamanho, caixa, ponto, travessão e dois-pontos", () => {
    expect(problemasDoAssunto("O Alasca entrou na conta")).toContain("MAIUSCULA");
    expect(problemasDoAssunto("a conta.")).toContain("PONTO_FINAL");
    expect(problemasDoAssunto("lula \u2014 trump")).toContain("TRAVESSAO");
    expect(problemasDoAssunto("juros: o fed cortou")).toContain("DOIS_PONTOS");
    expect(problemasDoAssunto("juros")).toContain("POUCAS_PALAVRAS");
    expect(problemasDoAssunto("o banco central americano corta os juros pela terceira vez seguida hoje")).toEqual(
      expect.arrayContaining(["PALAVRAS_DEMAIS", "CARACTERES_DEMAIS"]),
    );
  });
});

describe("escolherAssunto", () => {
  it("conserta a forma sem trocar de opção quando o tamanho cabe", () => {
    const r = escolherAssunto("O Alasca entrou na conta.", ["o alasca entrou na conta", "a conta do alasca"]);
    expect(r.subject).toBe("o alasca entrou na conta");
    expect(r.trocado).toBe(false);
    expect(r.subject_options).toEqual(["o alasca entrou na conta", "a conta do alasca"]);
  });

  it("troca para a primeira opção que cabe quando a escolhida estoura", () => {
    const r = escolherAssunto("o depósito para garantir a fiança de imigração passa a render juros", [
      "o depósito que rende 3% ao ano",
      "quanto rende a fiança?",
    ]);
    expect(r.subject).toBe("o depósito que rende 3% ao ano");
    expect(r.trocado).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("sem nenhuma que caiba, fica a mais curta e o problema é registrado, sem cortar", () => {
    const r = escolherAssunto("o banco central americano corta os juros pela terceira vez seguida", [
      "o banco central americano corta os juros de novo hoje",
    ]);
    expect(r.subject).toBe("o banco central americano corta os juros de novo hoje");
    expect(r.problemas.length).toBeGreaterThan(0);
    expect(r.problemas).not.toContain("MAIUSCULA");
  });
});

describe("aplicarFormaDoAssunto", () => {
  it("devolve a edição com o assunto na forma e diz o que mudou", () => {
    const r = aplicarFormaDoAssunto({ subject: "A Nike saiu do top-100.", subject_options: ["a nike saiu do top-100"] });
    expect(r.edicao.subject).toBe("a nike saiu do top-100");
    expect(r.mudou).toBe(true);
    expect(r.antes).toBe("A Nike saiu do top-100.");
  });
});

describe("o contrato do assunto", () => {
  it("o schema aceita o assunto curto do método, que antes derrubava a edição", () => {
    const campo = EditionContentSchema.shape.subject;
    expect(campo.safeParse("nikolas & vorcaro").success).toBe(true);
    expect(campo.safeParse("lula & trump").success).toBe(true);
  });

  it("a instrução ensina as cinco formas e a regra de verdade, sem travessão", () => {
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("UMA história");
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("pergunta direta");
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("Pergunta só quando a edição RESPONDE");
    expect(INSTRUCAO_PADRAO_ASSUNTO).not.toMatch(/\u2014/);
  });
});
