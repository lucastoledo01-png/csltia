import { describe, expect, it } from "vitest";
import { montarSystemDoClassificador } from "./classificador";
import { LEITOR, REGRA_EIXO, REGRA_LEITURA, REGRA_PAIS, REGRA_RELEVANCIA } from "./linha-editorial";
import { montarSystemDoVerificador } from "./verificador";

/*
 * As duas leituras de uma pauta julgam com a mesma régua, ou a divergência
 * entre elas não significa nada.
 *
 * Em 16/09/2026 a régua mudou no classificador e não mudou no verificador. Por
 * quatro dias o Instagram saiu sem post de notícia, porque a segunda leitura
 * recusava tecnologia e economia por "não ter conexão com a decisão de
 * imigrar". O cabeçalho de `linha-editorial.ts` conta o caso inteiro.
 */

const PROMPTS = {
  classificador: montarSystemDoClassificador(),
  verificador: montarSystemDoVerificador(),
};

/** Frases do produto anterior. Se uma delas voltar a um prompt, a régua é a velha. */
const REGUA_ANTERIOR = [
  "quer se mudar legalmente",
  "quem planeja a mudança",
  "quem planeja se mudar",
  "publicação brasileira sobre imigração",
  "projeto de mudança",
  "quem quer se mudar",
];

function frasesDaReguaAnterior(prompt: string): string[] {
  const texto = prompt.toLowerCase();
  return REGUA_ANTERIOR.filter((f) => texto.includes(f.toLowerCase()));
}

describe("linha editorial compartilhada", () => {
  it.each(Object.entries(PROMPTS))("o %s usa cada trecho da linha, sem cópia própria", (_, prompt) => {
    for (const trecho of [LEITOR, REGRA_PAIS, REGRA_LEITURA, REGRA_EIXO, REGRA_RELEVANCIA]) {
      expect(prompt).toContain(trecho);
    }
  });

  it.each(Object.entries(PROMPTS))("o %s não carrega nenhuma frase da régua de imigração", (_, prompt) => {
    expect(frasesDaReguaAnterior(prompt)).toEqual([]);
  });

  it("a conferência acusa o cabeçalho que o verificador tinha até 29/09", () => {
    // Sem este caso, a lista acima poderia estar errada e o teste passaria
    // sempre, que é indistinguível de não conferir nada.
    const anterior =
      "Você confere a classificação de uma notícia para uma publicação brasileira sobre imigração para os Estados Unidos. O leitor é brasileiro e quer se mudar legalmente.";
    expect(frasesDaReguaAnterior(anterior)).toEqual([
      "quer se mudar legalmente",
      "publicação brasileira sobre imigração",
    ]);
  });

  it("segurança é editoria nos dois prompts, e não só no schema", () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt).toContain('"seguranca"');
    }
  });

  it("o verificador diz com todas as letras que assunto fora de imigração não recusa", () => {
    expect(PROMPTS.verificador).toContain("Assunto fora de imigração NUNCA torna uma notícia inadequada");
  });

  it("eua_desfavoravel é a mesma régua da leitura desfavorável, como a comparação assume", () => {
    // `comparar` trata a primária como desfavorável quando pais é EUA e
    // leitura é desfavoravel. Se a instrução definir outra coisa, toda pauta
    // desse tipo vira conflito.
    expect(PROMPTS.verificador).toContain('true exatamente quando pais é "EUA" e leitura é "desfavoravel"');
  });
});

describe("verificação gravada sob outra régua", () => {
  it("a impressão da pauta muda quando a régua muda, então o veredito velho deixa de valer", async () => {
    const { hashDaVerificacao } = await import("./candidatos-store");
    const entrada = { titulo: "Fed corta juros", fonte: "Reuters", contexto: "O Fed cortou os juros." };
    expect(hashDaVerificacao({ ...entrada, regua: "regua-a" })).not.toBe(
      hashDaVerificacao({ ...entrada, regua: "regua-b" }),
    );
  });
});
