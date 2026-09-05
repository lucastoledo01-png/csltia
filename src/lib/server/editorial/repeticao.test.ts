import { describe, expect, it } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import { imagemJaUsada, verificarRepeticao } from "./repeticao";
import type { RegistroHistorico } from "./history";

const config = carregarConfigEditorial({});

function registro(over: Partial<RegistroHistorico> = {}): RegistroHistorico {
  return {
    projectId: "p",
    storyId: "s1",
    canal: "newsletter",
    titulo: "USCIS amplia prazo de renovação automática do EAD para 540 dias",
    urlCanonica: "uscis.gov/noticias/ead-540",
    publicadoEm: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ...over,
  };
}

describe("verificarRepeticao", () => {
  it("aprova quando o histórico do canal está vazio", () => {
    const v = verificarRepeticao({ titulo: "qualquer" }, [], "newsletter", config);
    expect(v.repetida).toBe(false);
    expect(v.camada).toBe("nenhuma");
  });

  it("pega a mesma matéria com rastreio diferente na URL", () => {
    const v = verificarRepeticao(
      { titulo: "Outro título completamente diferente", url: "https://www.uscis.gov/noticias/ead-540/?utm_source=rss" },
      [registro()],
      "newsletter",
      config
    );
    expect(v.motivo).toBe(MOTIVOS.REJEITADO_URL_DUPLICADA);
    expect(v.camada).toBe("url");
  });

  it("pega manchete reescrita com as mesmas palavras", () => {
    const v = verificarRepeticao(
      { titulo: "USCIS amplia para 540 dias o prazo de renovação automática do EAD" },
      [registro()],
      "newsletter",
      config
    );
    expect(v.motivo).toBe(MOTIVOS.REJEITADO_TITULO_DUPLICADO);
    expect(v.score).toBeGreaterThanOrEqual(config.limiarDeTitulo);
  });

  it("pega o mesmo fato contado com outras palavras, pelo vetor", () => {
    const v = verificarRepeticao(
      { titulo: "Permissão de trabalho ganha validade estendida", vetor: [1, 0, 0] },
      [registro({ vetor: [0.99, 0.14, 0] })],
      "newsletter",
      config
    );
    expect(v.motivo).toBe(MOTIVOS.REJEITADO_SEMANTICO);
    expect(v.camada).toBe("semantica");
  });

  it("pega ator mais acontecimento quando título e URL divergem", () => {
    const v = verificarRepeticao(
      {
        titulo: "Documento de trabalho tem validade esticada",
        entidades: { atores: ["USCIS"], lugares: ["EUA"], acontecimento: ["prorrogação"] },
      },
      [
        registro({
          titulo: "Permissão ganha mais tempo",
          urlCanonica: "outra.com/a",
          entidades: { atores: ["uscis"], lugares: ["eua"], acontecimento: ["prorrogacao"] },
        }),
      ],
      "newsletter",
      config
    );
    expect(v.motivo).toBe(MOTIVOS.REJEITADO_ENTIDADE_DUPLICADA);
  });

  it("deixa a pauta da newsletter ir para o Instagram, que é o reaproveitamento desejado", () => {
    const v = verificarRepeticao(
      { titulo: "USCIS amplia prazo de renovação automática do EAD para 540 dias", url: "https://uscis.gov/noticias/ead-540" },
      [registro({ canal: "newsletter" })],
      "instagram",
      config
    );
    expect(v.repetida).toBe(false);
  });

  it("barra a mesma pauta voltando ao Instagram em outro dia", () => {
    const v = verificarRepeticao(
      { titulo: "USCIS amplia prazo de renovação automática do EAD para 540 dias", url: "https://uscis.gov/noticias/ead-540" },
      [registro({ canal: "instagram" })],
      "instagram",
      config
    );
    expect(v.repetida).toBe(true);
  });

  it("aprova reportando o score do par mais próximo, para dar como calibrar", () => {
    const v = verificarRepeticao(
      { titulo: "Reforma tributária muda o câmbio", vetor: [0, 1, 0] },
      [registro({ vetor: [1, 0, 0] })],
      "newsletter",
      config
    );
    expect(v.repetida).toBe(false);
    expect(v.score).toBeCloseTo(0);
    expect(v.explicacao).toContain("limiar");
  });

  it("ignora registro sem entidades em vez de fingir que a camada rodou", () => {
    const v = verificarRepeticao(
      {
        titulo: "Assunto totalmente novo sobre vistos de trabalho",
        entidades: { atores: ["USCIS"], lugares: [], acontecimento: ["prorrogação"] },
      },
      [registro({ titulo: "Outra coisa", urlCanonica: "x.com/y", entidades: {} })],
      "newsletter",
      config
    );
    expect(v.repetida).toBe(false);
  });
});

describe("imagemJaUsada", () => {
  const historico = [
    registro({ imagemUrl: "https://img.com/foto.jpg?w=1200", publicadoEm: new Date().toISOString() }),
  ];

  it("reconhece a mesma foto com parâmetro diferente", () => {
    expect(imagemJaUsada("https://img.com/foto.jpg?w=600&utm_source=x", historico, 30)).not.toBeNull();
  });

  it("libera a foto quando saiu fora da janela", () => {
    const antigo = [
      registro({
        imagemUrl: "https://img.com/foto.jpg",
        publicadoEm: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(imagemJaUsada("https://img.com/foto.jpg", antigo, 30)).toBeNull();
  });
});
