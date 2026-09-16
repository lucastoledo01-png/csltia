import { describe, expect, it, vi } from "vitest";
import { rodarCicloSocial } from "./pipeline-v2";
import type { SocialPostsStore } from "./social-posts-store";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { CandidataPersistida } from "../editorial/candidatos-store";

/**
 * O modo decide o que acontece com o resultado, e só isso.
 *
 * O teste que mais importa aqui é o do dry-run: `social_posts` é a fila do
 * worker antigo, e ele seleciona por platform, status e scheduled_at, sem
 * olhar a coluna `dry_run`. Uma linha de diagnóstico com status `scheduled`
 * seria publicada por ele no horário.
 */

const PACOTE: PacoteFactual = {
  verified_facts: ["O USCIS ampliou o prazo de renovação de 180 para 540 dias."],
  people: [], organizations: ["USCIS"], places: ["Estados Unidos"],
  dates: ["outubro"], numbers: ["540 dias", "180 dias"], gaps: [],
  source_urls: ["https://www.uscis.gov/a"],
  texto_de_origem:
    "O USCIS informou que o prazo de renovação automática da permissão de trabalho passa de 180 " +
    "para 540 dias, valendo para pedidos protocolados a partir de outubro.",
};

function pauta(id: string, titulo: string, ator = "USCIS"): PautaAvaliada {
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
      id, pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "imigracao",
      natureza: "official_action", relevancia: 8, atores: [ator], lugares: ["Estados Unidos"],
      acontecimento: ["prorrogação"], justificativa: "",
    },
    enriquecimento: { texto: PACOTE.texto_de_origem, enrichmentSources: ["https://www.uscis.gov/a"] },
    motivoDaAprovacao: "APPROVED_IMMIGRATION",
    veredito: { repetida: false },
    pontuacao: { total: 70, partes: {}, explicacao: "" },
    vetor: null,
  } as unknown as PautaAvaliada;
}

const CONFIRMADA = {
  id: "cand-1",
  status: "approved",
  verificacao: {
    status: "confirm", motivo: "ok", divergencias: [],
    verificadoEm: new Date().toISOString(), canal: "instagram", inputHash: "h",
  },
} as unknown as CandidataPersistida;

const COPY_BOA = {
  headline: "USCIS amplia prazo do EAD para 540 dias",
  destaque: "540 dias",
  gancho: "Quem espera a renovação da permissão de trabalho ganhou fôlego.",
  fato_principal: "O USCIS ampliou o prazo de renovação automática de 180 para 540 dias.",
  contexto: "", informacao_util: "", ressalva: "", cta: "", hashtags: ["#USCIS"],
};

function modelo() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(COPY_BOA) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
}

/** Store que registra tudo que alguém tentar gravar. */
function storeEspiao() {
  const tentativas: unknown[][] = [];
  const store: SocialPostsStore = {
    async doDia() { return []; },
    async gravar(posts) {
      tentativas.push(posts as unknown[]);
      return { gravados: posts.length, bloqueadosPorIdempotencia: [], erros: [], ids: posts.map((_, i) => `id-${i}`) };
    },
  };
  return { store, tentativas };
}

function opcoes(env: Record<string, string | undefined>, over: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    editionDate: "2026-09-06",
    marca: { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "VISA" },
    historico: [] as RegistroHistorico[],
    pacotes: new Map([["s-1", PACOTE], ["s-2", PACOTE]]),
    candidatas: new Map([["s-1", CONFIRMADA], ["s-2", CONFIRMADA]]),
    env: { OPENAI_API_KEY: "chave", ...env },
    fetcher: modelo(),
    /*
     * A keyword vem injetada, e isso não é conveniência: sem injetar, o ciclo
     * chamaria `resolverKeywordCanonica`, que lê `prompt_campaigns` no banco de
     * produção. Teste unitário não fala com banco.
     */
    resolverKeyword: async () => ({ ok: true as const, keyword: "VISA", automacao: "auto-1" }),
    /*
     * O congelamento também vem injetado, e pela mesma razão: sem isso o ciclo
     * subiria um navegador e escreveria no Storage a cada teste de enforce.
     */
    congelarArte: async () => ({
      ok: true as const,
      artefato: {
        url: "https://storage.exemplo/peca.png",
        path: "proj/2026-09-06/peca.png",
        filename: "social-v2.png",
        mime: "image/png",
        sha256: "c".repeat(64),
        bytes: 120_000,
        largura: 2160,
        altura: 2880,
        otimizado: false,
      },
    }),
    ...over,
  };
}

describe("modo off", () => {
  it("não calcula nada e não grava nada", async () => {
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial([pauta("1", "USCIS amplia prazo")], opcoes({}, { store }));

    expect(r.modo).toBe("off");
    expect(r.previews).toHaveLength(0);
    expect(tentativas).toHaveLength(0);
  });
});

describe("modo dry_run", () => {
  it("calcula o ciclo inteiro e NÃO grava nada", async () => {
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, { store }),
    );

    expect(r.modo).toBe("dry_run");
    expect(r.previews).toHaveLength(1);
    expect(r.previews[0].post.copy.headline).toContain("540");

    // O ponto do teste: nenhuma escrita, nem com dry_run true.
    expect(tentativas).toHaveLength(0);
    expect(r.gravacao).toBeNull();
  });

  it("nenhum registro fica elegível para o worker antigo", async () => {
    /*
     * `findDuePosts` seleciona por `platform`, `status` e `scheduled_at`, e
     * ignora `dry_run`. Se o dry-run gravasse com `status = scheduled`, o
     * worker publicaria. A garantia, então, não pode ser uma coluna: tem que
     * ser não chamar a gravação.
     *
     * A volta anterior deste teste filtrava as linhas com um predicado que era
     * sempre verdadeiro, e as duas asserções diziam a mesma coisa: "nada foi
     * gravado". Quem casa a linha do V2 contra o critério real do worker é
     * `social-posts-store.test.ts`, onde a linha existe.
     */
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo"), pauta("2", "Outra pauta do USCIS", "DHS")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, { store }),
    );

    // O ciclo rodou de verdade: houve o que gravar, e não se gravou.
    expect(r.previews.length).toBeGreaterThan(0);
    expect(tentativas).toHaveLength(0);
  });

  it("expõe a chave de idempotência que a gravação usaria", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }),
    );
    expect(r.previews[0].chaveDeIdempotencia).toBe("social-v2-2026-09-06-s-1");
  });
});

describe("modo enforce", () => {
  it("recusa enquanto o visual não estiver aprovado", async () => {
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "enforce", VISUAL_RESOLVER_V2: "off" }, { store }),
    );

    expect(r.diagnostico.enforcePermitido).toBe(false);
    expect(tentativas).toHaveLength(0);
    expect(r.linhasDeLog.join(" ")).toMatch(/enforce pedido e recusado/);
  });

  it("com tudo liberado, grava", async () => {
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes(
        { SOCIAL_PIPELINE_V2: "enforce", VISUAL_RESOLVER_V2: "enforce", SOCIAL_V2_ENFORCE_LIBERADO: "true" },
        { store },
      ),
    );

    expect(r.gravacao?.gravados).toBe(1);
    expect(tentativas).toHaveLength(1);
  });
});

describe("origem no ciclo", () => {
  it("pauta que saiu na newsletter vira newsletter-origin", async () => {
    const historico = [
      { projectId: "proj-1", storyId: "s-1", canal: "newsletter", titulo: "t", urlCanonica: "u", publicadoEm: "2026-09-06" },
    ] as RegistroHistorico[];

    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, { historico }),
    );

    expect(r.previews[0].origem.originChannel).toBe("newsletter");
    expect(r.previews[0].origem.originStoryId).toBe("s-1");
  });

  it("pauta que só o social levou é social-only", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }),
    );

    expect(r.previews[0].origem.originChannel).toBe("social");
    expect(r.previews[0].origem.originStoryId).toBeNull();
  });
});

describe("sem imagem o post continua existindo", () => {
  it("registra semImagem e não descarta", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, {
        resolverVisual: async () => ({ status: "NO_VALID_IMAGE", motivo: "AMBIGUOUS_ENTITY", asset: null }),
      }),
    );

    expect(r.previews).toHaveLength(1);
    expect(r.diagnostico.semImagem).toBe(1);
    expect(r.previews[0].visual?.motivo).toBe("AMBIGUOUS_ENTITY");
  });

  it("falha ao resolver imagem não derruba o post", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, {
        resolverVisual: async () => { throw new Error("Commons fora do ar"); },
      }),
    );

    expect(r.previews).toHaveLength(1);
    expect(r.linhasDeLog.join(" ")).toMatch(/imagem falhou/);
  });
});

describe("fail-closed sem persistência", () => {
  it("em dry-run o diagnóstico continua", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }, { persistenciaDegradada: true }),
    );

    expect(r.previews).toHaveLength(1);
    expect(r.diagnostico.bloqueio).toBeNull();
  });

  it("em enforce o ciclo é bloqueado antes de gerar copy", async () => {
    const { store, tentativas } = storeEspiao();
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes(
        { SOCIAL_PIPELINE_V2: "enforce", VISUAL_RESOLVER_V2: "enforce", SOCIAL_V2_ENFORCE_LIBERADO: "true" },
        { store, persistenciaDegradada: true },
      ),
    );

    expect(r.diagnostico.bloqueio).toBe("SOCIAL_PERSISTENCE_UNAVAILABLE");
    expect(r.previews).toHaveLength(0);
    expect(tentativas).toHaveLength(0);
  });
});

describe("a keyword do CTA no ciclo", () => {
  it("sem palavra escutando, o ciclo roda e a copy sai sem CTA", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes(
        { SOCIAL_PIPELINE_V2: "dry_run" },
        { resolverKeyword: async () => ({ ok: false as const, motivo: "campanha sem automação" }) },
      ),
    );

    expect(r.previews).toHaveLength(1);
    expect(r.linhasDeLog.join(" ")).toContain("sem CTA");
  });

  it("a palavra vem da campanha, não da configuração passada pelo chamador", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes(
        { SOCIAL_PIPELINE_V2: "dry_run" },
        {
          marca: { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "NEWS" },
          resolverKeyword: async () => ({ ok: true as const, keyword: "VISA", automacao: "auto-1" }),
        },
      ),
    );

    // O log diz de onde veio, para a divergência não passar despercebida.
    const log = r.linhasDeLog.join(" ");
    expect(log).toContain("funil permanente");
    expect(log).toContain("VISA");
    expect(log).toContain("NEWS");
  });

  it("keyword igual à configuração não vira ruído no log", async () => {
    const r = await rodarCicloSocial(
      [pauta("1", "USCIS amplia prazo")],
      opcoes({ SOCIAL_PIPELINE_V2: "dry_run" }),
    );
    expect(r.linhasDeLog.join(" ")).not.toContain("e não da configuração");
  });
});
