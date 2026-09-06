import { describe, expect, it } from "vitest";
import { avaliarPostSocial, conferirFormaDaHeadline, MOTIVOS_DO_SOCIAL_GUARD } from "./social-guard";
import { ctaDaPosicao, levaCta, montarLegenda } from "./copy";
import type { CopyDoPost } from "./copy";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";

/**
 * A última pergunta antes de um post existir.
 *
 * A guarda editorial decide se a PAUTA vira conteúdo. Esta decide se o TEXTO
 * escrito sobre ela pode ir ao ar, e são coisas diferentes: uma pauta
 * impecável rende uma manchete que inverte a decisão judicial, e nenhum filtro
 * anterior olha para a manchete.
 */

const PACOTE: PacoteFactual = {
  verified_facts: [
    "O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias.",
    "A mudança vale para pedidos protocolados a partir de outubro.",
    "A fila soma 1,2 milhão de pedidos.",
  ],
  people: [],
  organizations: ["USCIS"],
  places: ["Estados Unidos"],
  dates: ["outubro"],
  numbers: ["540 dias", "180 dias", "1,2 milhão de pedidos"],
  gaps: ["A matéria não informa se a mudança alcança pedidos já protocolados."],
  source_urls: ["https://www.uscis.gov/a"],
  texto_de_origem:
    "O USCIS informou que o prazo de renovação automática da permissão de trabalho passa de 180 para " +
    "540 dias. A mudança vale para pedidos protocolados a partir de outubro. A fila soma 1,2 milhão de pedidos.",
};

function pauta(over: Record<string, unknown> = {}): PautaAvaliada {
  return {
    grupo: {
      primary: {
        id: "c1",
        url: "https://www.uscis.gov/a",
        title: "USCIS amplia prazo do EAD",
        source_name: "USCIS",
        priority: 1,
        published_at: "2026-09-06T12:00:00Z",
        description: PACOTE.texto_de_origem,
        content: "",
        category: "imigracao",
        score: 0,
        dedupe_key: "k",
        window_hours: 72,
      },
      secondary_sources: [],
      secondary_urls: [],
    },
    storyId: "s1",
    classificacao: {
      id: "c1", pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "processo",
      natureza: "official_action", relevancia: 8, atores: ["USCIS"], lugares: ["Estados Unidos"],
      acontecimento: ["prorrogação"], justificativa: "",
    },
    enriquecimento: { texto: PACOTE.texto_de_origem, enrichmentSources: ["https://www.uscis.gov/a"] },
    motivoDaAprovacao: "APPROVED_IMMIGRATION",
    veredito: { repetida: false },
    pontuacao: { total: 70, partes: {}, explicacao: "" },
    vetor: null,
    ...over,
  } as unknown as PautaAvaliada;
}

function copy(over: Partial<CopyDoPost> = {}): CopyDoPost {
  return {
    headline: "USCIS amplia prazo do EAD para 540 dias",
    destaque: "540 dias",
    gancho: "Quem espera a renovação da permissão de trabalho ganhou fôlego.",
    fato_principal: "O USCIS ampliou o prazo de renovação automática de 180 para 540 dias.",
    contexto: "A fila soma 1,2 milhão de pedidos.",
    informacao_util: "A mudança vale para pedidos protocolados a partir de outubro.",
    ressalva: "",
    cta: "Comente VISA para receber no Direct uma avaliação de perfil.",
    hashtags: ["#USCIS", "#ImigracaoEUA"],
    ...over,
  };
}

const CONFIRMADA = {
  status: "approved" as const,
  verificacao: {
    status: "confirm" as const, motivo: "ok", divergencias: [],
    verificadoEm: new Date().toISOString(), canal: "instagram", inputHash: "h",
  },
};

function contexto(over: Record<string, unknown> = {}) {
  return {
    pauta: pauta(),
    pacote: PACOTE,
    candidata: CONFIRMADA,
    keyword: "VISA",
    fechamentoDaNewsletter: "Até amanhã. Equipe imigra.us.",
    ...over,
  } as never;
}

describe("post bem escrito passa", () => {
  it("aprova quando tudo está ancorado", () => {
    const r = avaliarPostSocial(copy(), contexto());
    expect(r.issues).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.finalDecision).toBe("publicar");
    expect(r.hashtagsFinais.length).toBeGreaterThanOrEqual(3);
  });

  it("a legenda final sai com hashtags no fim e sem despedida", () => {
    const r = avaliarPostSocial(copy(), contexto());
    expect(r.legendaFinal).not.toMatch(/Até amanhã/);
    const linhas = r.legendaFinal.split("\n").filter(Boolean);
    expect(linhas[linhas.length - 1]).toBe(r.hashtagsFinais.join(" "));
  });
});

describe("ancoragem", () => {
  it("manchete com número que a fonte não tem é bloqueada", () => {
    const r = avaliarPostSocial(copy({ headline: "USCIS amplia prazo do EAD para 720 dias" }), contexto());
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_SEM_ANCORAGEM);
    // Reescrever resolve: a pauta está boa, o texto que não está.
    expect(r.finalDecision).toBe("reparar");
  });

  it("manchete e legenda são conferidas separado", () => {
    // Legenda impecável, manchete inventada. É a manchete que vai no print.
    const r = avaliarPostSocial(copy({ headline: "USCIS aprova 900 mil pedidos de imigrantes" }), contexto());
    const motivos = r.issues.map((p) => p.motivo);
    expect(motivos).toContain(MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_SEM_ANCORAGEM);
    expect(motivos).not.toContain(MOTIVOS_DO_SOCIAL_GUARD.CAPTION_SEM_ANCORAGEM);
  });

  it("legenda com data inventada é bloqueada", () => {
    const r = avaliarPostSocial(
      copy({ informacao_util: "A regra entra em vigor em 3 de janeiro de 2031." }),
      contexto(),
    );
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.CAPTION_SEM_ANCORAGEM);
  });
});

describe("forma da manchete", () => {
  it("curta demais não afirma fato", () => {
    expect(conferirFormaDaHeadline("USCIS muda")?.motivo).toBe(MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA);
  });

  it("longa demais some na arte", () => {
    const longa = "O USCIS anunciou nesta quinta que amplia o prazo de renovação automática da permissão de trabalho";
    expect(conferirFormaDaHeadline(longa)?.detalhe).toMatch(/ilegível/);
  });

  it("pergunta é teaser, não manchete", () => {
    expect(conferirFormaDaHeadline("O que muda no prazo do EAD?")?.detalhe).toMatch(/teaser/);
  });

  it("manchete na forma passa", () => {
    expect(conferirFormaDaHeadline("USCIS amplia prazo do EAD para 540 dias")).toBeNull();
  });
});

describe("o que nenhuma reescrita conserta", () => {
  it("pauta desfavorável aos EUA não vira post", () => {
    const r = avaliarPostSocial(
      copy(),
      contexto({ pauta: pauta({ classificacao: { ...pauta().classificacao, leitura: "desfavoravel" } }) }),
    );
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.EUA_NEGATIVO);
    expect(r.finalDecision).toBe("descartar");
  });

  it("candidata não verificada não vira post", () => {
    const r = avaliarPostSocial(copy(), contexto({ candidata: { status: "approved", verificacao: null } }));
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.NAO_VERIFICADA);
    expect(r.finalDecision).toBe("descartar");
  });

  it("candidata em conflito não vira post", () => {
    const emConflito = {
      status: "approved" as const,
      verificacao: { ...CONFIRMADA.verificacao, status: "conflict" as const, motivo: "EDITORIAL_CLASSIFICATION_CONFLICT: pais" },
    };
    const r = avaliarPostSocial(copy(), contexto({ candidata: emConflito }));
    expect(r.issues[0].detalhe).toContain("EDITORIAL_CLASSIFICATION_CONFLICT");
    expect(r.finalDecision).toBe("descartar");
  });

  it("só link de agregador não vira post", () => {
    const agregada = pauta();
    agregada.grupo.primary.url = "https://news.google.com/rss/articles/abc";
    (agregada.enriquecimento as { enrichmentSources: string[] }).enrichmentSources = [];

    const r = avaliarPostSocial(copy(), contexto({ pauta: agregada }));
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.FONTE_NAO_RESOLVIDA);
    expect(r.finalDecision).toBe("descartar");
  });
});

describe("promessa e urgência", () => {
  it("prometer aprovação é bloqueado", () => {
    const r = avaliarPostSocial(
      copy({ cta: "Comente VISA e descubra se você pode morar legalmente nos EUA." }),
      contexto(),
    );
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO);
  });

  it("urgência inventada é bloqueada", () => {
    const r = avaliarPostSocial(copy({ gancho: "Últimas vagas antes da mudança." }), contexto());
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO);
  });

  it("dizer que existem caminhos é permitido", () => {
    const r = avaliarPostSocial(
      copy({ cta: "Comente VISA e descubra quais caminhos combinam com o seu perfil." }),
      contexto(),
    );
    expect(r.issues.map((p) => p.motivo)).not.toContain(MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO);
  });
});

describe("SEM_CTA é decisão, não esquecimento", () => {
  it("post sem CTA não ganha um na legenda final", () => {
    // Apareceu no primeiro preview de ponta a ponta: o post nascia SEM_CTA e
    // a legenda saía com "Comente VISA" no fim, desfazendo a regra de um em
    // cada quatro sem chamada.
    const r = avaliarPostSocial(copy({ cta: "" }), contexto());

    expect(r.legendaFinal).not.toContain("Comente VISA");
    expect(r.legendaFinal).not.toMatch(/Comente/);
  });

  it("post com CTA continua tendo o CTA", () => {
    const r = avaliarPostSocial(copy(), contexto());
    expect(r.legendaFinal).toContain("Comente VISA");
  });

  it("e as hashtags continuam no fim nos dois casos", () => {
    const semCta = avaliarPostSocial(copy({ cta: "" }), contexto());
    const linhas = semCta.legendaFinal.split("\n").filter(Boolean);
    expect(linhas[linhas.length - 1]).toBe(semCta.hashtagsFinais.join(" "));
  });
});

describe("assinatura de newsletter", () => {
  it("despedida na legenda é pega e removida", () => {
    const r = avaliarPostSocial(copy({ ressalva: "Até amanhã. Equipe imigra.us." }), contexto());
    expect(r.issues.map((p) => p.motivo)).toContain(MOTIVOS_DO_SOCIAL_GUARD.ASSINATURA_DE_NEWSLETTER);
    // Pego E consertado: a legenda final já sai limpa.
    expect(r.legendaFinal).not.toMatch(/Até amanhã/);
  });
});

describe("CTA que varia sem mudar a ação", () => {
  it("a forma muda com a posição", () => {
    const formas = [0, 1, 2, 3].map((i) => ctaDaPosicao(i, "VISA"));
    expect(new Set(formas).size).toBe(4);
    for (const f of formas) expect(f).toContain("VISA");
  });

  it("um em cada quatro posts sai sem CTA", () => {
    const comCta = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => levaCta(i));
    expect(comCta.length).toBe(6);
    expect(levaCta(0)).toBe(false);
    expect(levaCta(4)).toBe(false);
  });

  it("a legenda montada não traz CTA nem hashtag", () => {
    // As duas são responsabilidade da camada determinística, e montá-las aqui
    // produziria CTA duplicado.
    const l = montarLegenda(copy());
    expect(l).not.toContain("Comente");
    expect(l).not.toContain("#");
  });
});
