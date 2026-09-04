import { describe, expect, it } from "vitest";
import { montarPrompt, notaDeSubstituicao, rotuloDoAsset, type DirecaoVisual } from "./visual";

const DIRECAO: DirecaoVisual = {
  composicao: "centered subject",
  iluminacao: "warm rim light",
  cenario: "brazilian street at dusk",
  atmosfera: "nostalgic",
};

describe("montagem do prompt", () => {
  it("é determinística — a mesma entrada dá sempre a mesma string", () => {
    // É o que permite conferir depois que o prompt gravado é o que gerou a
    // imagem. Prompt que varia entre a geração e a leitura torna a entrega
    // impossível de auditar.
    const a = montarPrompt("Vire personagem de GTA", "retrato", DIRECAO);
    const b = montarPrompt("Vire personagem de GTA", "retrato", DIRECAO);
    expect(a).toBe(b);
  });

  it("não depende da ordem em que a direção foi escrita", () => {
    const invertida: DirecaoVisual = {
      atmosfera: "nostalgic",
      cenario: "brazilian street at dusk",
      iluminacao: "warm rim light",
      composicao: "centered subject",
    };
    expect(montarPrompt("X", "y", invertida)).toBe(montarPrompt("X", "y", DIRECAO));
  });

  it("aplicações diferentes dão prompts diferentes", () => {
    // N imagens têm que ser N aplicações distintas do conceito, não variações
    // quase idênticas para encher slide.
    expect(montarPrompt("C", "retrato", DIRECAO)).not.toBe(montarPrompt("C", "casal", DIRECAO));
  });

  it("proíbe texto na imagem", () => {
    // O template põe a tipografia por cima; palavra gerada pelo modelo sai
    // torta, em inglês, e briga com a arte.
    expect(montarPrompt("C", "a", DIRECAO)).toContain("NO TEXT");
    expect(montarPrompt("C", "a", DIRECAO)).toContain("NO LOGOS");
  });

  it("funciona sem direção visual", () => {
    const p = montarPrompt("Conceito", "aplicação");
    expect(p).toContain("Conceito");
    expect(p).not.toContain("Visual direction:");
  });

  it("ignora campos vazios da direção", () => {
    const comVazios = montarPrompt("C", "a", { composicao: "  ", iluminacao: "warm" });
    expect(comVazios).toContain("Visual direction: warm.");
  });
});

describe("rótulo do asset", () => {
  it("vira PROMPT + aplicação em maiúscula sem acento", () => {
    expect(rotuloDoAsset("retrato")).toBe("PROMPT RETRATO");
    expect(rotuloDoAsset("São Paulo à noite")).toBe("PROMPT SAO PAULO A NOITE");
  });

  it("cai em PROMPT BASE quando não sobra nada", () => {
    expect(rotuloDoAsset("!!!")).toBe("PROMPT BASE");
    expect(rotuloDoAsset("")).toBe("PROMPT BASE");
  });

  it("não estoura o tamanho do rótulo", () => {
    expect(rotuloDoAsset("a".repeat(200)).length).toBeLessThanOrEqual(48);
  });

  it("aplicações distintas dão rótulos distintos", () => {
    // O rótulo é chave única por campanha: colisão viraria entrega ambígua.
    expect(rotuloDoAsset("retrato")).not.toBe(rotuloDoAsset("casal"));
  });
});

describe("nota de substituição", () => {
  it("diz o que trocar, nomeando a aplicação", () => {
    // Prompt entregue sem dizer o que substituir só serve para reproduzir o
    // exemplo.
    expect(notaDeSubstituicao("retrato de casal")).toContain("retrato de casal");
    expect(notaDeSubstituicao("x")).toMatch(/troque/i);
  });
});
