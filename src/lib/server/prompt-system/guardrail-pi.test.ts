import { describe, expect, it } from "vitest";
import { checarPropriedadeIntelectual, INSTRUCAO_PI } from "./guardrail-pi";

/**
 * Os dois primeiros conceitos reais que o sistema gerou foram barrados — ambos
 * por **mencionar** o que estavam proibindo. Um dizia "não inserir logos,
 * marcas ou personagens reconhecíveis"; o outro, "sem marcas ou logotipos
 * visíveis". São exatamente as instruções que se quer.
 *
 * Um guardrail que reprova a boa prática é pior que nenhum: trava o trabalho e
 * ensina a não escrever a restrição, que é o oposto do objetivo. Os textos
 * abaixo são os reais, copiados do painel.
 */

const POSTER_NEON = {
  conceito:
    "Transforme uma única foto em uma recriação autoral de pôster de ação urbano neon: sua rotina, " +
    "seu pet, seu bairro e seu trabalho entram em uma vida noturna exagerada com energia de videogame.",
  hook: "E se a sua vida virasse um pôster de ação neon?",
  aplicacoes: [
    "Pessoa comum: use uma foto sua para criar um pôster de protagonista original, com roupa urbana, " +
      "expressão confiante, carro esportivo genérico ao fundo e uma avenida iluminada por letreiros " +
      "coloridos. Não inserir logos, marcas ou personagens reconhecíveis.",
    "Casal: transforme uma foto do casal em uma cena de fuga divertida durante um encontro noturno.",
    "Pet: use uma foto do seu cachorro ou gato para criar um pôster de mascote da cidade.",
  ],
};

const MINIATURA = {
  conceito:
    "Transforme uma única foto sua, do seu pet ou de um objeto em uma miniatura hiper-realista " +
    "inserida em cartões-postais brasileiros.",
  hook: "E se você coubesse no seu ponto turístico favorito?",
  aplicacoes: [
    "Pessoa comum: use uma foto sua para criar uma miniatura caminhando sobre o calçadão de Copacabana.",
    "Profissão: crie uma miniatura de confeiteiro sobre uma bancada cenográfica inspirada no Mercado " +
      "Municipal de São Paulo, sem marcas ou logotipos visíveis.",
  ],
};

describe("os conceitos reais que eram barrados por engano", () => {
  it("aprova o pôster neon — ele PROÍBE logos, não pede", () => {
    const v = checarPropriedadeIntelectual(POSTER_NEON);
    expect(v.motivos, JSON.stringify(v.motivos)).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  it("aprova a miniatura — ela diz 'sem marcas ou logotipos visíveis'", () => {
    const v = checarPropriedadeIntelectual(MINIATURA);
    expect(v.motivos, JSON.stringify(v.motivos)).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  it("registra a restrição declarada como ponto a favor", () => {
    // Escrever a restrição passa a ajudar, em vez de atrapalhar.
    expect(checarPropriedadeIntelectual(MINIATURA).restricoesDeclaradas.length).toBeGreaterThan(0);
  });
});

describe("negação conta a favor", () => {
  const negativos = [
    "não inserir logotipos",
    "sem logotipo visível",
    "nenhum logotipo da marca",
    "evite key art",
    "livre de marca registrada",
    "personagem original, não reconhecível — proibido logotipo",
  ];

  it.each(negativos)("aprova: %s", (texto) => {
    expect(checarPropriedadeIntelectual({ conceito: texto }).aprovado).toBe(true);
  });

  it("a negação só vale perto do termo", () => {
    // "sem pressa" não autoriza o logotipo trinta palavras depois.
    const longe =
      "sem pressa, com calma e atenção aos detalhes da composição e da luz, " +
      "monte a cena e então aplique o logotipo da franquia no canto";
    expect(checarPropriedadeIntelectual({ conceito: longe }).aprovado).toBe(false);
  });
});

describe("o que continua barrado", () => {
  it("pedido afirmativo de peça protegida", () => {
    for (const t of [
      "aplique o logotipo da franquia no canto",
      "recrie a key art do filme",
      "use a capa oficial como base",
      "reproduza a marca registrada",
    ]) {
      expect(checarPropriedadeIntelectual({ conceito: t }).aprovado, t).toBe(false);
    }
  });

  it("falsa oficialidade, que é o risco mais grave", () => {
    for (const t of [
      "material oficial do lançamento",
      "vazamento da nova temporada",
      "em parceria com a marca",
      "arte licenciada pelo estúdio",
      "conteúdo patrocinado pelo estúdio",
    ]) {
      expect(checarPropriedadeIntelectual({ conceito: t }).aprovado, t).toBe(false);
    }
  });

  it("olha as aplicações e a direção visual, não só o conceito", () => {
    expect(
      checarPropriedadeIntelectual({
        conceito: "Retrato estilizado",
        aplicacoes: ["com o logotipo da franquia ao fundo"],
      }).aprovado,
    ).toBe(false);

    expect(
      checarPropriedadeIntelectual({
        conceito: "Retrato estilizado",
        direcaoVisual: { elementos_recorrentes: "key art do jogo" },
      }).aprovado,
    ).toBe(false);
  });
});

describe("'logo' sozinho não é mais gatilho", () => {
  it("aprova o advérbio, que é uso comum em português", () => {
    // "logo" como advérbio aparece naturalmente e não tem nada a ver com marca.
    for (const t of [
      "logo depois do amanhecer, com luz dourada",
      "a cena começa logo após a chuva",
      "logo mais o céu fica roxo",
    ]) {
      expect(checarPropriedadeIntelectual({ conceito: t }).aprovado, t).toBe(true);
    }
  });

  it("mas 'logo da marca' continua barrado", () => {
    expect(checarPropriedadeIntelectual({ conceito: "ponha o logo da marca" }).aprovado).toBe(false);
  });
});

describe("instrução do prompt", () => {
  it("pede a restrição explícita, que agora conta a favor", () => {
    expect(INSTRUCAO_PI).toMatch(/conta a favor/i);
    expect(INSTRUCAO_PI).toMatch(/sem marcas ou\s+logotipos vis/i);
  });

  it("não barra 'nunca de material oficial' — é a declaração da boa prática", () => {
    // Texto real de um conceito que ficou bloqueado em produção. A frase que
    // deveria aprovar o conceito era a que o barrava: ela diz que o resultado
    // NÃO se apresenta como material oficial.
    const v = checarPropriedadeIntelectual({
      conceito: "Miniaturas hiper-realistas em cartões-postais brasileiros.",
      hook: "E se você coubesse no seu ponto turístico favorito?",
      aplicacoes: ["Pessoa comum: uma miniatura no calçadão de Copacabana."],
      direcaoVisual: {
        atmosfera:
          "Materiais que lembram resina e madeira, com aparência de recriação " +
          "autoral, nunca de material oficial.",
      },
    });

    expect(v.aprovado).toBe(true);
    expect(v.motivos).toEqual([]);
  });

  it("continua barrando quando a oficialidade é afirmada, não negada", () => {
    // A guarda da guarda: se "nunca" bastasse aparecer em qualquer lugar do
    // texto, bastaria escrever a palavra uma vez para desarmar o portão.
    const v = checarPropriedadeIntelectual({
      conceito: "Nunca foi tão fácil. Este é o material oficial do lançamento.",
      hook: "O anúncio oficial",
      aplicacoes: ["Recrie o pôster oficial do filme."],
      direcaoVisual: {},
    });

    expect(v.aprovado).toBe(false);
  });

});
