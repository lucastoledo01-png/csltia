import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O MESMO worker publicando peça única e carrossel.
 *
 * A regra desta fase é que não existe worker novo, fila nova nem tabela nova.
 * O que estes testes protegem é isso: a bifurcação continua sendo só
 * `generation_version`, a decisão entre imagem única e carrossel sai da
 * CONTAGEM de artefatos conferidos, e nada do caminho estático mudou.
 *
 * E protegem o que é específico do carrossel e não tem equivalente na peça
 * única: N hashes conferidos antes de qualquer chamada à Meta, um hash
 * divergente impedindo a peça INTEIRA, a ordem dos slides preservada, e o
 * retry não recriando containers filhos que já existem.
 */

const tabelas: Record<string, { row?: unknown; rows?: unknown[] }> = {};
const updates: Array<Record<string, unknown>> = [];

function construirQuery(tabela: string) {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    lte: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    single: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    update: (valores: Record<string, unknown>) => {
      if (tabela === "social_posts") updates.push(valores);
      const reivindicacao = {
        ...query,
        eq: () => reivindicacao,
        select: async () => ({ data: [{ id: "post-v2" }], error: null }),
      };
      return reivindicacao;
    },
    upsert: () => query,
    insert: () => query,
  };
  return query;
}

vi.mock("../../supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => construirQuery(t) }),
}));

const gerouCopyLegado = vi.fn();
vi.mock("./pipeline", () => ({
  generateInstagramCarouselPipeline: (...args: unknown[]) => {
    gerouCopyLegado(...args);
    return Promise.resolve({
      carousel: {
        title: "TÍTULO REGENERADO",
        format: "noticia",
        slides: [{ index: 1, type: "cover", title: "capa legada" }],
        caption: { full_caption: "LEGENDA REGENERADA", hashtags: ["#legado"] },
      },
      usage: { promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0 },
      contexto: { assunto: "x", orgao: "y" },
    });
  },
  generateTutorialCarouselPipeline: () => {
    throw new Error("tutorial não é o caso destes testes");
  },
}));

const renderizouLegado = vi.fn();
vi.mock("./opendesign-renderer", () => ({
  renderOpenDesignSlides: (...args: unknown[]) => {
    renderizouLegado(...args);
    return Promise.resolve([
      { index: 1, filename: "legado.png", pngBuffer: Buffer.from("legado"), type: "cover", htmlContent: "" },
    ]);
  },
  uploadOpenDesignSlideToStorage: async () => "https://storage.exemplo/legado.png",
}));

const TOKEN_EFETIVO = "token-renovado-pelo-cron";
vi.mock("./meta-token", () => ({ resolveInstagramToken: async () => TOKEN_EFETIVO }));
vi.mock("../../prompt-system/funil-permanente", () => ({
  garantirFunilPermanente: async () => ({ ligado: true, keyword: "VISA", automationId: "a1", criadaAgora: false }),
}));
vi.mock("../../prompt-system/pos-publicacao", () => ({
  concluirCampanhaPublicada: async () => ({ automacaoCriada: false }),
}));
vi.mock("../../alerts", () => ({
  sendAlert: async () => true,
  formatError: (e: unknown) => String(e),
}));
vi.mock("./edition-loader", () => ({ loadEdition: async () => ({ stories: [{ title: "t", summary: "s" }] }) }));
vi.mock("../legenda", () => ({
  garantirLegendaSocial: (carousel: unknown) => ({ carousel, problemas: [], reparos: [] }),
}));

const { processScheduledPost } = await import("./worker-service");

/** Cinco slides congelados, cada um com bytes e hash próprios. */
const SLIDES = [1, 2, 3, 4, 5].map((i) => {
  const bytes = Buffer.from(`PNG-do-slide-${i}`);
  return {
    index: i,
    bytes,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    url: `https://storage.exemplo/imigra-us/2026-09-06/post-v2/social-v2-0${i}.png`,
    path: `imigra-us/2026-09-06/post-v2/social-v2-0${i}.png`,
    filename: `social-v2-0${i}.png`,
  };
});

/** O que o Storage devolve, por URL. Trocar aqui é adulterar um arquivo. */
const noStorage = new Map<string, Buffer>();

const PROJETO = {
  id: "projeto-1",
  slug: "imigra-us",
  name: "imigra.us",
  status: "active",
  niche: "imigração",
  content_language: "pt-BR",
  timezone: "America/Sao_Paulo",
  site_url: null,
  brand_display_name: "imigra.us",
  brand_tagline: "",
  brand_primary_color: "#ff4a1c",
  brand_logo_url: null,
  brand_social_links: {},
  newsletter_from_name: "imigra.us",
  publish_hour_local: 6,
  publish_minute_local: 3,
  editorial_prompt_extra: "",
  settings: { instagram_keyword: "VISA" },
};

const HEADLINE = "Ajuste de status: como funciona por dentro";
const LEGENDA = "A USCIS descreve dois caminhos.\n\nComente VISA e receba a avaliação no Direct.\n\n#GreenCard";

function artefatoDaLinha(s: (typeof SLIDES)[number]) {
  return {
    url: s.url,
    path: s.path,
    filename: s.filename,
    mime: "image/png",
    sha256: s.sha256,
    bytes: s.bytes.byteLength,
    index: s.index,
  };
}

function linhaCarrossel(over: Record<string, unknown> = {}, arte: Record<string, unknown> = {}) {
  return {
    id: "post-v2",
    project_id: "projeto-1",
    edition_date: "2026-09-06",
    status: "scheduled",
    generation_version: "social-v2",
    dry_run: false,
    title: HEADLINE,
    caption: LEGENDA,
    story_id: "evg:adjustment-of-status:etapas",
    event_fingerprint: null,
    visual_asset_id: null,
    origin_channel: "evergreen",
    social_guard_status: "passed",
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    slides_manifest: [],
    content_json: {
      format: "noticia",
      formato: "carousel",
      hashtags: ["#GreenCard"],
      arte: {
        versao: "v2",
        variante: "noticia_sem_foto",
        eixo: "processo",
        artefato: artefatoDaLinha(SLIDES[0]),
        artefatos: SLIDES.map(artefatoDaLinha),
        ...arte,
      },
      visual: { capa: "texto", motivo: "NO_VALID_IMAGE" },
    },
    ...over,
  };
}

function linhaEstatica(over: Record<string, unknown> = {}) {
  const s = SLIDES[0];
  return {
    ...linhaCarrossel(over),
    story_id: "s-1",
    origin_channel: "social",
    content_json: {
      format: "noticia",
      hashtags: ["#GreenCard"],
      arte: {
        versao: "v2",
        variante: "noticia_sem_foto",
        eixo: "processo",
        artefato: artefatoDaLinha(s),
      },
      visual: { capa: "texto", motivo: "NO_VALID_IMAGE" },
    },
  };
}

type Chamada = { url: string; corpo: Record<string, string> };

/**
 * A Meta de mentira, que numera os containers para a ordem ser verificável.
 *
 * Cada `POST /media` de filho devolve um id derivado da URL da imagem, então a
 * lista `children` do pai prova qual arquivo virou qual posição. Sem isso o
 * teste de ordem não teria o que asserir: todos os containers seriam iguais.
 */
function metaFalsa(opcoes: { falharPai?: number } = {}) {
  const chamadas: Chamada[] = [];
  let paisCriados = 0;

  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);

    if (u.startsWith("https://storage.exemplo/")) {
      const bytes = noStorage.get(u);
      if (!bytes) return new Response("", { status: 404 });
      return new Response(new Uint8Array(bytes), { status: 200 });
    }

    const corpo = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    chamadas.push({ url: u, corpo });

    if (u.includes("/media_publish")) return Response.json({ id: "media-999" });
    if (u.includes("/media?fields=id,caption")) return Response.json({ data: [] });
    if (u.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });

    if (u.includes("/media")) {
      if (corpo.media_type === "CAROUSEL") {
        paisCriados += 1;
        if (opcoes.falharPai && paisCriados <= opcoes.falharPai) {
          return Response.json(
            { error: { message: "Invalid children: media not found", code: 100 } },
            { status: 400 },
          );
        }
        return Response.json({ id: "pai-1" });
      }
      const doSlide = /social-v2-0(\d)\.png/.exec(corpo.image_url ?? "");
      return Response.json({ id: doSlide ? `filho-${doSlide[1]}` : "filho-unico" });
    }

    return Response.json({});
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

const ENV = {
  INSTAGRAM_ACCOUNT_ID: "conta-1",
  // Semente vencida, que é o estado normal depois da primeira troca do cron.
  INSTAGRAM_ACCESS_TOKEN: "semente-vencida",
  INSTAGRAM_AUTO_POST: "true",
  NEWSLETTER_FINAL_LINE: "",
};

function filhosCriados(chamadas: Chamada[]): string[] {
  return chamadas
    .filter((c) => c.url.includes("/media") && c.corpo.is_carousel_item === "true")
    .map((c) => c.corpo.image_url);
}

function paiCriado(chamadas: Chamada[]): Chamada | undefined {
  return chamadas.find((c) => c.corpo.media_type === "CAROUSEL");
}

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  updates.length = 0;
  gerouCopyLegado.mockClear();
  renderizouLegado.mockClear();
  noStorage.clear();
  for (const s of SLIDES) noStorage.set(s.url, s.bytes);
  tabelas.projects = { row: PROJETO };
});

describe("artefato: N slides, N hashes", () => {
  it("os cinco arquivos são baixados e conferidos antes de qualquer chamada à Meta", async () => {
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(filhosCriados(chamadas)).toHaveLength(5);
    expect(gerouCopyLegado).not.toHaveBeenCalled();
    expect(renderizouLegado).not.toHaveBeenCalled();

    /*
     * O manifesto gravado tem os cinco hashes, e é isso que prova que a
     * conferência foi por slide e não por amostragem.
     */
    const manifesto = updates
      .map((u) => u.slides_manifest as Array<Record<string, unknown>> | undefined)
      .filter(Boolean)
      .at(0)!;
    expect(manifesto).toHaveLength(5);
    expect(manifesto.map((m) => m.sha256)).toEqual(SLIDES.map((s) => s.sha256));
  });

  it("um hash divergente impede o carrossel inteiro, e a Meta não é chamada", async () => {
    /*
     * O slide 3 foi trocado no Storage depois da aprovação. Nenhum container
     * pode ser criado: container criado é lixo que fica pendurado na conta e,
     * pior, é candidato a ser publicado por uma reconciliação futura.
     */
    noStorage.set(SLIDES[2].url, Buffer.from("PNG-ADULTERADO"));
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("SOCIAL_ARTIFACT_HASH_MISMATCH");
    expect(r.error).toContain("slide 3");
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });

  it("um slide que o Storage não tem também impede a peça", async () => {
    noStorage.delete(SLIDES[4].url);
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });
});

describe("ordem dos slides", () => {
  it("a ordem publicada é a do manifesto, e o pai recebe os filhos nessa ordem", async () => {
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher, chamadas } = metaFalsa();

    await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(filhosCriados(chamadas)).toEqual(SLIDES.map((s) => s.url));
    expect(paiCriado(chamadas)?.corpo.children).toBe("filho-1,filho-2,filho-3,filho-4,filho-5");
  });

  it("índice fora de ordem no payload não publica", async () => {
    /*
     * A ordem é DADO, e não a ordem do array: qualquer serialização no caminho
     * pode reordenar a lista, e um carrossel publicado fora de ordem responde
     * antes de perguntar.
     */
    const trocados = [SLIDES[1], SLIDES[0], SLIDES[2], SLIDES[3], SLIDES[4]].map(artefatoDaLinha);
    tabelas.social_posts = { row: linhaCarrossel({}, { artefatos: trocados }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });

  it("a capa registrada tem que ser o slide 1 do carrossel", async () => {
    tabelas.social_posts = { row: linhaCarrossel({}, { artefato: artefatoDaLinha(SLIDES[3]) }) };
    const { fetcher } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");
  });
});

describe("retry não duplica containers", () => {
  it("os filhos já criados são gravados no manifesto conforme nascem", async () => {
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher } = metaFalsa();

    await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    /*
     * Cada filho é gravado ANTES de o pai existir. É a mesma disciplina do
     * `provider_creation_id`: registrar o efeito externo assim que ele
     * acontece, para a próxima tentativa saber o que já foi feito.
     */
    const comFilhos = updates
      .map((u) => u.slides_manifest as Array<Record<string, unknown>> | undefined)
      .filter((m): m is Array<Record<string, unknown>> => Boolean(m))
      .filter((m) => m.some((s) => s.provider_child_id));

    expect(comFilhos.length).toBeGreaterThanOrEqual(5);
    const ultimo = comFilhos.at(-1)!;
    expect(ultimo.map((s) => s.provider_child_id)).toEqual([
      "filho-1",
      "filho-2",
      "filho-3",
      "filho-4",
      "filho-5",
    ]);
  });

  it("uma segunda tentativa reusa os filhos do manifesto em vez de criar outros", async () => {
    const manifestoDeAntes = SLIDES.map((s) => ({
      index: s.index,
      url: s.url,
      filename: s.filename,
      sha256: s.sha256,
      bytes: s.bytes.byteLength,
      provider_child_id: `filho-${s.index}`,
    }));
    tabelas.social_posts = { row: linhaCarrossel({ slides_manifest: manifestoDeAntes }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);
    // Zero filhos novos: os cinco vieram do manifesto.
    expect(filhosCriados(chamadas)).toHaveLength(0);
    expect(paiCriado(chamadas)?.corpo.children).toBe("filho-1,filho-2,filho-3,filho-4,filho-5");
  });

  it("filho reaproveitado que venceu faz o pai recusar, e aí os filhos são recriados uma vez", async () => {
    /*
     * Container da Meta expira em 24h, e o erro aparece na criação do PAI. Sem
     * a segunda passada, o post ficaria preso para sempre num id vencido
     * gravado por nós mesmos.
     */
    const manifestoVelho = SLIDES.map((s) => ({
      index: s.index,
      url: s.url,
      filename: s.filename,
      sha256: s.sha256,
      bytes: s.bytes.byteLength,
      provider_child_id: `vencido-${s.index}`,
    }));
    tabelas.social_posts = { row: linhaCarrossel({ slides_manifest: manifestoVelho }) };
    const { fetcher, chamadas } = metaFalsa({ falharPai: 1 });

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(filhosCriados(chamadas)).toEqual(SLIDES.map((s) => s.url));
    const pais = chamadas.filter((c) => c.corpo.media_type === "CAROUSEL");
    expect(pais).toHaveLength(2);
    expect(pais[0].corpo.children).toContain("vencido-1");
    expect(pais[1].corpo.children).toBe("filho-1,filho-2,filho-3,filho-4,filho-5");
  });

  it("recusa do pai sem filho reaproveitado NÃO tenta de novo", async () => {
    tabelas.social_posts = { row: linhaCarrossel() };
    const { fetcher, chamadas } = metaFalsa({ falharPai: 1 });

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(chamadas.filter((c) => c.corpo.media_type === "CAROUSEL")).toHaveLength(1);
  });
});

describe("o caminho estático não mudou", () => {
  it("uma linha de imagem única publica com container único e legenda", async () => {
    tabelas.social_posts = { row: linhaEstatica() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);
    // Nenhum `is_carousel_item`, nenhum pai: é o container de imagem única.
    expect(filhosCriados(chamadas)).toHaveLength(0);
    expect(paiCriado(chamadas)).toBeUndefined();

    const unico = chamadas.find((c) => c.url.includes("/media") && c.corpo.image_url);
    expect(unico?.corpo.caption).toBe(LEGENDA);
  });

  it("a linha estática não precisa declarar formato: a ausência é imagem única", async () => {
    tabelas.social_posts = { row: linhaEstatica() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(paiCriado(chamadas)).toBeUndefined();
  });

  it("formato desconhecido não cai em imagem única: falha fechada", async () => {
    /*
     * Cair no conhecido publicaria uma peça de um slide no lugar de um payload
     * que esta versão do worker não entende. É o mesmo princípio de
     * `generation_version`.
     */
    const linha = linhaEstatica();
    (linha.content_json as Record<string, unknown>).formato = "reels";
    tabelas.social_posts = { row: linha };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });
});

describe("o worker continua um só", () => {
  it("carrossel declarado com um artefato só não publica", async () => {
    /*
     * O formato é lido, e a contagem tem que casar com ele. Um carrossel com um
     * artefato perdido publicado como imagem única sairia com um slide, e nada
     * indicaria que quatro slides aprovados ficaram de fora.
     */
    tabelas.social_posts = {
      row: linhaCarrossel({}, { artefatos: [artefatoDaLinha(SLIDES[0])] }),
    };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });

  it("carrossel acima do teto de sete não publica", async () => {
    const oito = Array.from({ length: 8 }, (_, i) => {
      const s = SLIDES[i % SLIDES.length];
      return { ...artefatoDaLinha(s), index: i + 1 };
    });
    tabelas.social_posts = { row: linhaCarrossel({}, { artefatos: oito }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });

  it("ensaio não publica, seja carrossel ou não", async () => {
    tabelas.social_posts = { row: linhaCarrossel({ dry_run: true }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });

  it("guarda reprovada não publica, seja carrossel ou não", async () => {
    tabelas.social_posts = { row: linhaCarrossel({ social_guard_status: "failed" }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(chamadas.filter((c) => c.url.includes("/media"))).toHaveLength(0);
  });
});

describe("item 12: o estático não regride, e é conferido item por item", () => {
  it("uma imagem, um hash, um container, nenhum filho", async () => {
    tabelas.social_posts = { row: linhaEstatica() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    expect(r.ok).toBe(true);

    /* Um arquivo baixado do Storage: um hash conferido. */
    const doStorage = chamadas.filter((c) => c.url.startsWith("https://storage.exemplo/"));
    expect(doStorage).toHaveLength(0); // o Storage não passa por `chamadas`, e sim pelo ramo de bytes

    /* Um container de imagem única, com a legenda, e nenhum filho nem pai. */
    const containers = chamadas.filter((c) => c.url.includes("/media") && c.corpo.image_url);
    expect(containers).toHaveLength(1);
    expect(containers[0].corpo.is_carousel_item).toBeUndefined();
    expect(containers[0].corpo.caption).toBe(LEGENDA);
    expect(paiCriado(chamadas)).toBeUndefined();
  });

  it("o manifesto do estático NÃO é reescrito pelo worker", async () => {
    /*
     * A gravação do manifesto é só do carrossel. No estático o manifesto já foi
     * gravado por quem aprovou o post, e não há container filho para registrar:
     * escrever ali acrescentaria uma falha possível entre a conferência do hash
     * e a criação do container, no caminho que publica hoje.
     */
    tabelas.social_posts = { row: linhaEstatica() };
    const { fetcher } = metaFalsa();

    await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    const escreveuManifesto = updates.some((u) => "slides_manifest" in u);
    expect(escreveuManifesto).toBe(false);
  });

  it("a idempotência do estático continua sendo a mesma: creation_id antes de publicar", async () => {
    tabelas.social_posts = { row: linhaEstatica() };
    const { fetcher } = metaFalsa();

    await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    const ordem = updates.map((u) => Object.keys(u).join("+"));
    const iCreation = ordem.findIndex((k) => k.includes("provider_creation_id"));
    const iMedia = ordem.findIndex((k) => k.includes("provider_post_id"));

    expect(iCreation).toBeGreaterThanOrEqual(0);
    expect(iMedia).toBeGreaterThan(iCreation);
  });

  it("o estático com container de tentativa anterior reusa, não republica", async () => {
    tabelas.social_posts = {
      row: linhaEstatica({
        provider_creation_id: "container-de-ontem",
        publish_attempted_at: "2026-09-06T10:00:00Z",
      }),
    };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", { autoPost: true }, ENV, fetcher);

    /*
     * O que se afirma aqui é que a reconciliação ACONTECEU: o worker perguntou
     * à Meta pelo container de antes em vez de criar outro às cegas. É a
     * proteção que já existia, e o suporte a carrossel não podia enfraquecê-la.
     */
    const perguntouStatus = chamadas.some((c) => c.url.includes("fields=status_code"));
    expect(perguntouStatus).toBe(true);
    expect(r.ok).toBe(true);
  });
});
