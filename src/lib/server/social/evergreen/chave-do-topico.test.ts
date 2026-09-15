import { describe, expect, it } from "vitest";
import { pautaDoEvergreen } from "./adaptador";
import { topicoDoItem } from "./tipos";
import type { ItemEvergreen } from "./tipos";
import type { PacoteFactual } from "../../editorial/tipos-pacote";

/**
 * A chave gravada tem que ser a chave que a régua lê.
 *
 * Entre 12 e 14/09/2026 saíram nove posts perenes sobre três assuntos, ajuste
 * de status, processo consular e a comparação entre os dois, três dias seguidos.
 * Nenhum ângulo repetiu, porque o cooldown do par usa `story_id` e esse casava.
 * O assunto repetiu todo dia porque a janela do tópico procura `evg:<tópico>` e
 * o que ia para `topic_id` era `programa:eb5`, vindo da regra da notícia.
 *
 * Este teste liga as duas pontas que o código separava: o que o adaptador
 * produz e o que a seleção consulta. Sem ele, a regra volta a parecer protegida
 * e não proteger, que é o pior dos dois mundos.
 */

const ITEM = {
  topico: {
    id: "adjustment-of-status",
    nome: "Adjustment of status",
    familia: "process_explainer",
    resumo: "Pedir o Green Card de dentro dos Estados Unidos.",
    fontesCanonicas: ["https://www.uscis.gov/green-card/adjustment-of-status"],
  },
  angulo: {
    id: "etapas-e-documentos",
    pergunta: "Quais são as etapas e os documentos?",
  },
} as unknown as ItemEvergreen;

const PACOTE = {
  texto_de_origem: "Texto oficial do USCIS sobre as etapas do ajuste de status.",
} as unknown as PacoteFactual;

describe("a identidade do evergreen sobrevive até o banco", () => {
  it("o storyId da pauta carrega o tópico que a janela de repetição procura", () => {
    const pauta = pautaDoEvergreen(ITEM, PACOTE);

    // É daqui que `topicoDoPost`, em pipeline-v2, extrai a chave gravada.
    const partes = pauta.storyId.split(":");
    expect(partes[0]).toBe("evg");
    expect(`evg:${partes[1]}`).toBe(topicoDoItem(ITEM));
  });

  it("a chave do tópico não depende do ângulo", () => {
    const outroAngulo = {
      ...ITEM,
      angulo: { id: "vida-com-pedido-pendente", pergunta: "Como é a vida com o pedido pendente?" },
    } as unknown as ItemEvergreen;

    const a = pautaDoEvergreen(ITEM, PACOTE).storyId.split(":")[1];
    const b = pautaDoEvergreen(outroAngulo, PACOTE).storyId.split(":")[1];

    // Dois ângulos do mesmo assunto contam como o mesmo tópico, que é o que
    // faz a janela impedir três dias seguidos sobre ajuste de status.
    expect(a).toBe(b);
  });
});
