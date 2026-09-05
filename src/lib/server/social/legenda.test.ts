import { describe, expect, it } from "vitest";
import {
  garantirLegendaSocial,
  hashtagsDaPauta,
  MOTIVOS_DA_LEGENDA,
  normalizarHashtag,
  removerFechamentoDeNewsletter,
  repararLegendaSocial,
  separarHashtags,
  validarLegendaSocial,
} from "./legenda";

/**
 * O que separa a legenda do Instagram da copy da newsletter.
 *
 * "Até amanhã. Equipe imigra.us." saiu num post porque o prompt do Instagram
 * recebia a assinatura da newsletter e mandava encerrar com ela. O prompt foi
 * corrigido; estes testes travam a garantia, que é o que sobra quando o modelo
 * escreve o que não foi pedido.
 */

const FECHAMENTO = "Até amanhã. Equipe imigra.us.";

function legenda(full: string, extras: Record<string, unknown> = {}) {
  return {
    headline: "Manchete do post para o teste",
    intro_summary: "Resumo de introdução com tamanho suficiente para o schema.",
    key_takeaways: ["primeiro ponto", "segundo ponto"],
    cta_call: "Comente VISA e receba a avaliação de perfil no Direct",
    hashtags: ["#imigracao", "#estadosunidos", "#vistoamericano"],
    full_caption: full,
    ...extras,
  };
}

const CONTEXTO_VISTO = {
  titulo: "USCIS atualiza a orientação do EB-2 NIW sobre interesse nacional",
  resumo:
    "A agência publicou nota que muda a análise do pedido de green card de profissionais com mestrado e doutorado, como o cirurgião do caso divulgado.",
  categoria: "Imigração",
  keyword: "VISA",
  fechamentoDaNewsletter: FECHAMENTO,
};

const CONTEXTO_BRASIL = {
  titulo: "Moraes pediu à PF relatórios que citavam ministros do STF",
  resumo: "O pedido consta de despacho enviado à Polícia Federal e cita ministros da própria Corte.",
  categoria: "Brasil",
  keyword: "VISA",
  fechamentoDaNewsletter: FECHAMENTO,
};

const CONTEXTO_ESTUDO = {
  titulo: "Universidades americanas ampliam a oferta de bolsa para estudante internacional",
  resumo: "O visto F-1 segue como a via de entrada para quem faz curso de graduação no campus americano.",
  categoria: "Educação",
  keyword: "VISA",
  fechamentoDaNewsletter: FECHAMENTO,
};

const CONTEXTO_ECONOMIA = {
  titulo: "EUA criam 162 mil empregos, contra 53 mil esperados",
  resumo: "O relatório mensal do mercado de trabalho americano veio acima da projeção dos analistas.",
  categoria: "Economia",
  keyword: "VISA",
  fechamentoDaNewsletter: FECHAMENTO,
};

describe("fechamento de newsletter fora do Instagram", () => {
  it("caso 1: recusa e remove 'Até amanhã. Equipe imigra.us.'", () => {
    const caption = legenda(
      [
        "O USCIS publicou nova orientação para o EB-2 NIW.",
        "",
        "Comente VISA para receber no Direct uma avaliação de perfil.",
        "",
        FECHAMENTO,
        "",
        "#EB2NIW #GreenCard",
      ].join("\n"),
    );

    const problemas = validarLegendaSocial(caption, CONTEXTO_VISTO);
    expect(problemas.map((p) => p.motivo)).toContain(MOTIVOS_DA_LEGENDA.FECHAMENTO_DE_NEWSLETTER);

    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    expect(corrigida.full_caption).not.toMatch(/[Aa]té amanhã/);
    expect(corrigida.full_caption).not.toMatch(/Equipe imigra/);
    // O que não é despedida continua lá.
    expect(corrigida.full_caption).toContain("O USCIS publicou nova orientação");
  });

  it("pega a despedida mesmo colada no fim de uma linha com conteúdo", () => {
    const { texto, removidos } = removerFechamentoDeNewsletter(
      "A regra passa a valer em março. Até amanhã. Equipe imigra.us.",
      FECHAMENTO,
    );
    expect(texto).toBe("A regra passa a valer em março.");
    expect(removidos.length).toBe(2);
  });

  it("barra o fechamento de outro projeto, que não está na lista fixa", () => {
    const { texto } = removerFechamentoDeNewsletter(
      "Fato relevante do dia. Agora você está por dentro. Equipe outra marca.",
      "Agora você está por dentro. Equipe outra marca.",
    );
    expect(texto).toBe("Fato relevante do dia.");
  });

  it("não confunde 'amanhã' como informação com 'até amanhã' como despedida", () => {
    const { texto, removidos } = removerFechamentoDeNewsletter(
      "O prazo do formulário termina amanhã.",
      FECHAMENTO,
    );
    expect(removidos).toEqual([]);
    expect(texto).toBe("O prazo do formulário termina amanhã.");
  });

  it("caso 5: a newsletter continua com o fechamento dela", () => {
    // O guardião é do canal social. Nada aqui reescreve a edição: a mesma
    // string que sai do Instagram continua válida como assinatura do e-mail.
    const { texto } = removerFechamentoDeNewsletter("Boletim do dia.", undefined);
    expect(texto).toBe("Boletim do dia.");
    expect(FECHAMENTO).toBe("Até amanhã. Equipe imigra.us.");
  });
});

describe("hashtags", () => {
  it("caso 2: legenda sem hashtag nenhuma recebe um conjunto relevante", () => {
    const caption = legenda(
      "O USCIS publicou nova orientação para o EB-2 NIW.\n\nComente VISA e receba a avaliação no Direct.",
    );

    const problemas = validarLegendaSocial(caption, CONTEXTO_VISTO);
    expect(problemas.map((p) => p.motivo)).toContain(MOTIVOS_DA_LEGENDA.SEM_HASHTAG);

    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    expect(corrigida.hashtags.length).toBeGreaterThanOrEqual(4);
    expect(corrigida.hashtags.length).toBeLessThanOrEqual(7);
    expect(corrigida.full_caption).toContain(corrigida.hashtags.join(" "));
  });

  it("caso 3: pauta de EB-2 NIW gera a hashtag específica", () => {
    const tags = hashtagsDaPauta(CONTEXTO_VISTO);
    expect(tags).toContain("#EB2NIW");
    expect(tags).toContain("#USCIS");
    // #EB2 sozinha não acrescenta nada ao lado de #EB2NIW.
    expect(tags).not.toContain("#EB2");
  });

  it("caso 4: pauta econômica não recebe hashtag de visto", () => {
    const tags = hashtagsDaPauta(CONTEXTO_ECONOMIA);
    expect(tags).not.toContain("#EB2NIW");
    expect(tags).not.toContain("#GreenCard");
    expect(tags).not.toContain("#VistoAmericano");
    expect(tags).toContain("#MercadoDeTrabalho");
    expect(tags).toContain("#EconomiaEUA");
  });

  it("caso 4b: nem quando o modelo sugere a hashtag de visto na pauta econômica", () => {
    const tags = hashtagsDaPauta(CONTEXTO_ECONOMIA, ["#GreenCard", "#EB2NIW", "#Empregos"]);
    expect(tags).not.toContain("#GreenCard");
    expect(tags).not.toContain("#EB2NIW");
    // A sugestão que a pauta sustenta continua valendo.
    expect(tags).toContain("#Empregos");
  });

  it("pauta de política brasileira fica na própria pauta, sem hashtag de EUA", () => {
    const tags = hashtagsDaPauta(CONTEXTO_BRASIL);

    expect(tags).toContain("#STF");
    expect(tags).toContain("#PoliciaFederal");
    expect(tags).toContain("#Brasil");
    expect(tags).toContain("#PoliticaBrasileira");

    // O perfil é imigra.us, e isso não é justificativa: a pauta não fala com
    // quem já está lá fora, nem cita processo migratório.
    expect(tags).not.toContain("#BrasileirosNosEUA");
    expect(tags).not.toContain("#EstadosUnidos");
    expect(tags).not.toContain("#GreenCard");
    expect(tags).not.toContain("#EB2NIW");
  });

  it("EB-2 NIW de profissional não vira pauta de estudo", () => {
    const tags = hashtagsDaPauta(CONTEXTO_VISTO);

    // "mestrado e doutorado" é qualificação profissional, não vida de
    // estudante. Foi essa inferência larga que produziu #EstudarNosEUA.
    expect(tags).not.toContain("#EstudarNosEUA");
    expect(tags).not.toContain("#EstudanteInternacional");
    expect(tags).toContain("#ProfissionaisNosEUA");
  });

  it("com contexto real de estudo, #EstudarNosEUA é válida", () => {
    const tags = hashtagsDaPauta(CONTEXTO_ESTUDO);

    expect(tags).toContain("#EstudarNosEUA");
    expect(tags).toContain("#EstudanteInternacional");
    expect(tags).toContain("#VistoF1");
    // "bolsa de estudo" não é bolsa de valores.
    expect(tags).not.toContain("#EconomiaEUA");
  });

  it("mercado de trabalho dos EUA não convoca brasileiros sem a pauta citá-los", () => {
    const tags = hashtagsDaPauta(CONTEXTO_ECONOMIA);

    expect(tags).toContain("#MercadoDeTrabalho");
    expect(tags).toContain("#EconomiaEUA");
    expect(tags).toContain("#EstadosUnidos");
    expect(tags).not.toContain("#BrasileirosNosEUA");
  });

  it("quando a pauta fala de brasileiros nos EUA, aí a hashtag entra", () => {
    const tags = hashtagsDaPauta({
      titulo: "Brasileiros nos EUA já são maioria em vagas de enfermagem em duas cidades",
      resumo: "O levantamento aponta crescimento da contratação de enfermeiros brasileiros com visto de trabalho.",
      categoria: "Carreira",
      keyword: "VISA",
    });

    expect(tags).toContain("#BrasileirosNosEUA");
  });

  it("aceita a entidade da classificação como justificativa", () => {
    const tags = hashtagsDaPauta({
      titulo: "Agência publica nova orientação para o pedido de interesse nacional",
      resumo: "O texto detalha o que a análise passa a considerar.",
      categoria: "Imigração",
      entidades: ["USCIS"],
      keyword: "VISA",
    });

    expect(tags).toContain("#USCIS");
  });

  it("dois assuntos diferentes não terminam com o mesmo conjunto", () => {
    const visto = hashtagsDaPauta(CONTEXTO_VISTO).join(" ");
    const economia = hashtagsDaPauta(CONTEXTO_ECONOMIA).join(" ");
    expect(visto).not.toBe(economia);
  });

  it("aproveita a sugestão do modelo que o texto sustenta, e descarta a que não", () => {
    const tags = hashtagsDaPauta(CONTEXTO_VISTO, ["#Doutorado", "#SonhoAmericano"]);

    expect(tags).toContain("#Doutorado");
    // Boa para a marca, sem nenhuma base na pauta.
    expect(tags).not.toContain("#SonhoAmericano");
  });

  it("casa a sugestão no plural com a palavra no singular da pauta", () => {
    const tags = hashtagsDaPauta(CONTEXTO_VISTO, ["#Cirurgioes"]);
    expect(tags).toContain("#Cirurgioes");
  });

  it("normaliza acento, pontuação e duplicata", () => {
    expect(normalizarHashtag("#Imigração")).toBe("#Imigracao");
    expect(normalizarHashtag("EB-2 NIW")).toBe("#EB2NIW");
    expect(normalizarHashtag("#")).toBeNull();

    const tags = hashtagsDaPauta(CONTEXTO_VISTO, ["#uscis", "#USCIS"]);
    expect(tags.filter((t) => t.toLowerCase() === "#uscis").length).toBe(1);
  });

  it("tira a hashtag do meio do texto e devolve no bloco final", () => {
    const caption = legenda(
      "O #USCIS mudou a regra do #EB2NIW nesta semana.\n\nComente VISA e receba a avaliação no Direct.",
    );

    const problemas = validarLegendaSocial(caption, CONTEXTO_VISTO);
    expect(problemas.map((p) => p.motivo)).toContain(MOTIVOS_DA_LEGENDA.HASHTAG_NO_MEIO);

    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    const linhas = corrigida.full_caption.split("\n").filter(Boolean);
    const corpo = linhas.slice(0, -1).join("\n");

    expect(corpo).toContain("mudou a regra do");
    expect(corpo).not.toContain("#");
    expect(linhas[linhas.length - 1]).toBe(corrigida.hashtags.join(" "));
  });
});

describe("CTA", () => {
  it("recusa e desduplica o CTA repetido", () => {
    const caption = legenda(
      [
        "Comente VISA e receba a avaliação de perfil no Direct.",
        "",
        "O USCIS mudou a regra.",
        "",
        "Comente VISA para descobrir quais caminhos combinam com o seu perfil.",
        "",
        "#EB2NIW #USCIS #ImigracaoEUA #GreenCard",
      ].join("\n"),
    );

    const problemas = validarLegendaSocial(caption, CONTEXTO_VISTO);
    expect(problemas.map((p) => p.motivo)).toContain(MOTIVOS_DA_LEGENDA.CTA_DUPLICADO);

    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    const vezes = corrigida.full_caption.match(/Comente VISA/g) ?? [];
    expect(vezes.length).toBe(1);
  });

  it("põe o CTA depois do conteúdo e antes das hashtags", () => {
    const caption = legenda(
      [
        "Comente VISA e receba a avaliação de perfil no Direct.",
        "",
        "O USCIS mudou a regra do EB-2 NIW nesta semana.",
      ].join("\n"),
    );

    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    const posCta = corrigida.full_caption.indexOf("Comente VISA");
    const posConteudo = corrigida.full_caption.indexOf("O USCIS mudou");
    const posHashtag = corrigida.full_caption.indexOf(corrigida.hashtags[0]);

    expect(posConteudo).toBeLessThan(posCta);
    expect(posCta).toBeLessThan(posHashtag);
  });

  it("usa o cta_call quando o modelo não escreveu CTA nenhum na legenda", () => {
    const caption = legenda("O USCIS mudou a regra do EB-2 NIW nesta semana.");
    const { caption: corrigida } = repararLegendaSocial(caption, CONTEXTO_VISTO);
    expect(corrigida.full_caption).toContain("Comente VISA");
  });
});

describe("garantia no caminho de publicação", () => {
  const carrossel = {
    title: "Post de teste do guardião",
    edition_date: "2026-09-05",
    primary_topic: "Imigração",
    target_audience_focus: "Brasileiros que querem morar nos EUA",
    format: "noticia" as const,
    slides: [
      {
        index: 1,
        type: "cover" as const,
        eyebrow: "",
        title: "USCIS muda a regra do EB-2 NIW",
        body: "",
        bullet_points: [],
        highlight_text: "",
        variant: "",
        cover_variant: "dark_speaker" as const,
        headline_style: "clean" as const,
        cover_image_prompt: "",
        bg_image_url: "",
        cta_text: "",
      },
    ],
    caption: legenda(
      `O USCIS publicou nova orientação.\n\nComente VISA e receba a avaliação no Direct.\n\n${FECHAMENTO}`,
    ),
  };

  it("a legenda que chega ao Instagram já sai limpa e com hashtags", () => {
    const { carousel, problemas, reparos } = garantirLegendaSocial(carrossel, CONTEXTO_VISTO);

    expect(carousel.caption.full_caption).not.toMatch(/Até amanhã/);
    expect(carousel.caption.hashtags.length).toBeGreaterThanOrEqual(4);
    expect(problemas.map((p) => p.motivo)).toContain(MOTIVOS_DA_LEGENDA.FECHAMENTO_DE_NEWSLETTER);
    expect(reparos.length).toBeGreaterThan(0);
    // Os slides não são assunto deste guardião.
    expect(carousel.slides).toEqual(carrossel.slides);
  });

  it("não estoura o teto do campo mesmo com hashtags acrescentadas", () => {
    const gigante = { ...carrossel, caption: legenda("a".repeat(1990)) };
    const { carousel } = garantirLegendaSocial(gigante, CONTEXTO_VISTO);

    expect(carousel.caption.full_caption.length).toBeLessThanOrEqual(2000);
    expect(carousel.caption.full_caption).toContain(carousel.caption.hashtags.join(" "));
  });
});

describe("separarHashtags", () => {
  it("não marca como do meio o bloco final legítimo", () => {
    const r = separarHashtags("Texto da legenda.\n\n#Uma #Duas #Tres");
    expect(r.noMeio).toBe(false);
    expect(r.tags).toEqual(["#Uma", "#Duas", "#Tres"]);
    expect(r.corpo).toBe("Texto da legenda.");
  });
});
