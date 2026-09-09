import { describe, expect, it, vi } from "vitest";
import { gerarPostDaPauta, gerarPostsDoDia } from "./gerador";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";

/**
 * Uma candidata problemática não derruba o dia.
 *
 * A newsletter é uma peça só: se ela não fecha, não sai nada. O feed tem de
 * dois a dez posts independentes, e uma pauta que não vira texto aceitável é
 * uma pauta a menos, não um dia perdido.
 */

const PACOTE: PacoteFactual = {
  verified_facts: [
    "O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias.",
    "A mudança vale para pedidos protocolados a partir de outubro.",
  ],
  people: [], organizations: ["USCIS"], places: ["Estados Unidos"],
  dates: ["outubro"], numbers: ["540 dias", "180 dias"], gaps: [],
  source_urls: ["https://www.uscis.gov/a"],
  texto_de_origem:
    "O USCIS informou que o prazo de renovação automática da permissão de trabalho passa de 180 " +
    "para 540 dias. A mudança vale para pedidos protocolados a partir de outubro.",
};

function pauta(id: string, titulo: string, over: Record<string, unknown> = {}): PautaAvaliada {
  return {
    grupo: {
      primary: {
        id, url: `https://www.uscis.gov/${id}`, title: titulo, source_name: "USCIS", priority: 1,
        published_at: "2026-09-06T12:00:00Z", description: PACOTE.texto_de_origem, content: "",
        category: "imigracao", score: 0, dedupe_key: id, window_hours: 72,
      },
      secondary_sources: [], secondary_urls: [],
    },
    storyId: `s-${id}`,
    classificacao: {
      id, pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "processo",
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

const CONFIRMADA = {
  status: "approved",
  verificacao: {
    status: "confirm", motivo: "ok", divergencias: [],
    verificadoEm: new Date().toISOString(), canal: "instagram", inputHash: "h",
  },
} as unknown as CandidataPersistida;

const MARCA = { nome: "imigra.us", nicho: "imigração para os EUA", extra: "", keyword: "VISA" };
const ENV = { OPENAI_API_KEY: "chave" };

const COPY_BOA = {
  headline: "USCIS amplia prazo do EAD para 540 dias",
  destaque: "540 dias",
  gancho: "Quem espera a renovação da permissão de trabalho ganhou fôlego.",
  fato_principal: "O USCIS ampliou o prazo de renovação automática de 180 para 540 dias.",
  contexto: "A mudança vale para pedidos protocolados a partir de outubro.",
  informacao_util: "",
  ressalva: "",
  cta: "",
  hashtags: ["#USCIS", "#ImigracaoEUA"],
};

const COPY_RUIM_HEADLINE = { ...COPY_BOA, headline: "USCIS amplia prazo do EAD para 720 dias" };
const COPY_RUIM_CAPTION = {
  ...COPY_BOA,
  informacao_util: "A regra entra em vigor em 3 de janeiro de 2031.",
};

/** Modelo de mentira que devolve uma copy por chamada, na ordem. */
function modeloQueDevolve(sequencia: Array<Record<string, unknown>>) {
  let n = 0;
  const chamadas: string[] = [];

  const fetcher = vi.fn(async (_u: string | URL, init?: RequestInit) => {
    const corpo = String(init?.body ?? "");
    chamadas.push(corpo.includes("foi recusado") ? "reparo" : "geracao");
    const copy = sequencia[Math.min(n, sequencia.length - 1)];
    n += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(copy) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

function opcoes(fetcher: typeof fetch, over: Record<string, unknown> = {}) {
  return {
    marca: MARCA,
    pacotes: new Map([["s-1", PACOTE], ["s-2", PACOTE], ["s-3", PACOTE]]),
    candidatas: new Map([["s-1", CONFIRMADA], ["s-2", CONFIRMADA], ["s-3", CONFIRMADA]]),
    env: ENV,
    fetcher,
    ...over,
  };
}

describe("caso A: headline inválida, reparo corrige", () => {
  it("reescreve uma vez e aprova", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_RUIM_HEADLINE, COPY_BOA]);
    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(r.post).not.toBeNull();
    expect(r.post!.tentativas).toBe(1);
    expect(r.post!.copy.headline).toContain("540");
    expect(chamadas).toEqual(["geracao", "reparo"]);
  });
});

describe("caso B: legenda inventa claim, reparo remove", () => {
  it("reescreve e aprova", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_RUIM_CAPTION, COPY_BOA]);
    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(r.post).not.toBeNull();
    expect(r.post!.copy.informacao_util).not.toContain("2031");
    expect(chamadas.filter((c) => c === "reparo")).toHaveLength(1);
  });
});

describe("caso C: duas tentativas falham, candidata descartada", () => {
  it("descarta depois do teto e o dia segue com a próxima", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_RUIM_HEADLINE]);
    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(r.post).toBeNull();
    expect(r.descarte!.motivo).toMatch(/depois de 2 reescrita/);
    // Uma geração mais duas reescritas, e para.
    expect(chamadas).toEqual(["geracao", "reparo", "reparo"]);
  });

  it("a próxima candidata da fila é considerada", async () => {
    let chamada = 0;
    const fetcher = vi.fn(async () => {
      chamada += 1;
      // As três primeiras (geração + 2 reparos) da pauta 1 saem ruins;
      // a pauta 2 sai boa de primeira.
      const copy = chamada <= 3 ? COPY_RUIM_HEADLINE : COPY_BOA;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(copy) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const r = await gerarPostsDoDia(
      [pauta("1", "Primeira pauta"), pauta("2", "Segunda pauta")],
      2,
      opcoes(fetcher),
    );

    expect(r.posts).toHaveLength(1);
    expect(r.descartadas).toHaveLength(1);
    expect(r.posts[0].pauta.storyId).toBe("s-2");
  });
});

describe("caso D: problema não reparável não chama reparo", () => {
  it("pauta desfavorável aos EUA é descartada sem reescrita", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_BOA]);
    const desfavoravel = pauta("1", "Pauta ruim");
    (desfavoravel.classificacao as { leitura: string }).leitura = "desfavoravel";

    const r = await gerarPostDaPauta(desfavoravel, 0, opcoes(fetcher));

    expect(r.post).toBeNull();
    expect(r.descarte!.motivo).toMatch(/sem reparo/);
    expect(chamadas).toEqual(["geracao"]);
  });

  it("candidata não verificada é descartada sem reescrita", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_BOA]);
    const r = await gerarPostDaPauta(
      pauta("1", "Pauta boa"),
      0,
      opcoes(fetcher, { candidatas: new Map() }),
    );

    expect(r.post).toBeNull();
    expect(chamadas).toEqual(["geracao"]);
  });
});

describe("caso E: o reparo não é segunda chance de inventar", () => {
  it("copy reparada que inventa outro número continua sendo recusada", async () => {
    // O modelo troca 720 por 900: continua fora do pacote factual.
    const aindaInventada = { ...COPY_BOA, headline: "USCIS amplia prazo do EAD para 900 dias" };
    const { fetcher } = modeloQueDevolve([COPY_RUIM_HEADLINE, aindaInventada, aindaInventada]);

    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(r.post).toBeNull();
    expect(r.descarte!.problemas.some((p) => p.motivo === "SOCIAL_REJECT_HEADLINE")).toBe(true);
  });

  it("o prompt de reparo carrega o pacote factual junto", async () => {
    const corpos: string[] = [];
    const fetcher = vi.fn(async (_u: string | URL, init?: RequestInit) => {
      corpos.push(String(init?.body ?? ""));
      const copy = corpos.length === 1 ? COPY_RUIM_HEADLINE : COPY_BOA;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(copy) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(corpos[1]).toContain("PACOTE FACTUAL");
    expect(corpos[1]).toContain("540");
    expect(corpos[1]).toMatch(/REMOVA a frase inteira/);
  });
});

describe("texto longo demais é aparado, não descartado", () => {
  it("campo acima do teto vira post, e não falha técnica", async () => {
    // O caso real do primeiro dry-run de ponta a ponta: uma pauta boa do
    // Diversity Visa virou "falha técnica ao gerar" porque um campo passou do
    // limite e o schema derrubava tudo.
    const longa = {
      ...COPY_BOA,
      contexto: "A fila do órgão segue longa e o efeito prático aparece nos prazos. ".repeat(12),
      informacao_util: "Vale para pedidos protocolados a partir de outubro. ".repeat(12),
    };
    const { fetcher } = modeloQueDevolve([longa]);

    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(r.descarte, r.descarte?.motivo ?? "").toBeNull();
    expect(r.post).not.toBeNull();
    expect(r.post!.copy.contexto.length).toBeLessThanOrEqual(400);
  });

  it("manchete longa NÃO é aparada em silêncio: vira reescrita", async () => {
    // Cortar manchete muda o que ela afirma. Quem decide é a guarda.
    const manchetona = {
      ...COPY_BOA,
      headline: "O USCIS anunciou nesta quinta-feira que amplia o prazo de renovação automática da permissão de trabalho para 540 dias",
    };
    const { fetcher, chamadas } = modeloQueDevolve([manchetona, COPY_BOA]);

    const r = await gerarPostDaPauta(pauta("1", "USCIS amplia prazo"), 0, opcoes(fetcher));

    expect(chamadas).toContain("reparo");
    expect(r.post!.copy.headline).toBe(COPY_BOA.headline);
  });
});

describe("o dia não cai por uma candidata", () => {
  it("exceção numa pauta não impede as outras", async () => {
    let chamada = 0;
    const fetcher = vi.fn(async () => {
      chamada += 1;
      if (chamada === 1) throw new Error("rede caiu");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(COPY_BOA) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const r = await gerarPostsDoDia(
      [pauta("1", "Primeira"), pauta("2", "Segunda")],
      2,
      opcoes(fetcher),
    );

    expect(r.posts).toHaveLength(1);
    expect(r.descartadas[0].motivo).toMatch(/falha técnica/);
  });

  it("para de gerar quando enche as vagas", async () => {
    const { fetcher } = modeloQueDevolve([COPY_BOA]);
    const r = await gerarPostsDoDia(
      [pauta("1", "A"), pauta("2", "B"), pauta("3", "C")],
      2,
      opcoes(fetcher),
    );

    expect(r.posts).toHaveLength(2);
    expect(r.diagnostico.tentadas).toBe(2);
  });

  it("teto de reparo zero desliga a reescrita", async () => {
    const { fetcher, chamadas } = modeloQueDevolve([COPY_RUIM_HEADLINE]);
    const r = await gerarPostDaPauta(
      pauta("1", "USCIS"),
      0,
      opcoes(fetcher, { maximoDeReparos: 0 }),
    );

    expect(r.post).toBeNull();
    expect(chamadas).toEqual(["geracao"]);
  });
});
