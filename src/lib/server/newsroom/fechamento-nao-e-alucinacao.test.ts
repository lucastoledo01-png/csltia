import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O convite para compartilhar não é afirmação sobre a notícia.
 *
 * Em 12/09/2026 a edição foi barrada com nota 95, zero número sem lastro e zero
 * conclusão não sustentada. O único apontamento foi este:
 *
 *   "A frase final menciona pessoas que planejam 'trabalhar ou estudar nos
 *    Estados Unidos', mas o pacote factual só trata de trabalho, vistos
 *    profissionais e imigração baseada em emprego."
 *
 * A frase é o `closing`, e o próprio prompt pede que ele convide o leitor a
 * compartilhar com quem se interessa pelo assunto da publicação. Descrever esse
 * público é descrever a AUDIÊNCIA, que vem do briefing editorial, não do pacote
 * factual do dia.
 *
 * É um erro de categoria, e um que se repetiria para sempre: a vertical é quem
 * quer morar nos Estados Unidos, e qualquer dia cobre só uma fatia disso. O
 * convite sempre citaria as outras. O reparo também não resolvia, porque
 * reescrever produz outra frase de público, apontada de novo.
 *
 * Este teste existe porque a correção mora num prompt, e prompt não quebra
 * compilação: apagar a regra sem querer não acusaria em lugar nenhum.
 */

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "src/lib/server/newsroom/pipeline.ts"),
  "utf-8",
);

describe("a lista do que NÃO é alucinação", () => {
  it("cobre o fechamento e o convite ao leitor", () => {
    expect(FONTE).toContain("FECHAMENTO E CONVITE AO LEITOR");
    expect(FONTE).toContain("a audiência é definida pelo briefing editorial, não pelo pacote factual");
  });

  it("não abre exceção para fato dentro do convite", () => {
    /*
     * A regra exclui a descrição de público, e só ela. Um prazo, um preço ou um
     * número inventado no fechamento continua sendo alucinação: sem esta
     * ressalva, a exceção viraria uma porta aberta no único lugar do texto que
     * ninguém confere.
     */
    expect(FONTE).toContain("Só é alucinação se o convite afirmar um FATO que o pacote não tem");
  });

  it("continua valendo a pergunta que separa as duas coisas", () => {
    // A regra nova não substitui o critério geral, se apoia nele.
    expect(FONTE).toContain("A pergunta que separa as duas coisas: a informação existe no pacote?");
    expect(FONTE).toContain("Não existe: alucinação, hallucination_risk = true.");
  });

  it("as outras exceções da lista seguem no lugar", () => {
    for (const ancora of ["Paráfrase fiel", "Ressalva.", "Assunto e opções de assunto", "IMPRECISÃO DE REDAÇÃO"]) {
      expect(FONTE).toContain(ancora);
    }
  });
});
