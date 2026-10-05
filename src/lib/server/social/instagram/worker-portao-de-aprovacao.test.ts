import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O worker diante da fila de aprovação (05/10/2026, RF-20).
 *
 * Este é o teste negativo obrigatório do PRD: as TRÊS origens de `scheduled`
 * (o store do Social V2, o agendador legado e o carrossel de campanha do
 * Sistema PROMPT, que está congelado e grava sem perguntar) chegam ao worker
 * sem aprovação, e as três são barradas. Barrada aqui quer dizer três coisas
 * ao mesmo tempo: a Meta não recebe nenhuma chamada, a linha NÃO é marcada
 * `failed`, e ela volta para `draft` com o motivo do portão.
 *
 * E o outro lado, para o "não" não ser só um worker quebrado: o post aprovado
 * na mesma versão publica, e o aprovado cujo arquivo mudou depois não publica.
 *
 * O dublê de banco é o mesmo desenho de `worker-v2-ramo.test.ts`, acrescido da
 * tabela `aprovacoes` e dos filtros que o portão usa.
 */

const tabelas: Record<string, { row?: unknown }> = {};
const updates: Array<{ tabela: string; valores: Record<string, unknown> }> = [];

function construirQuery(tabela: string) {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    in: () => query,
    is: () => query,
    neq: () => query,
    lte: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    single: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    update: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      const cadeia: Record<string, unknown> = {
        eq: () => cadeia,
        in: () => cadeia,
        is: () => cadeia,
        neq: () => cadeia,
        select: async () => ({ data: [{ id: "x" }], error: null }),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return cadeia;
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
        title: "t",
        format: "noticia",
        slides: [{ index: 1, type: "cover", title: "capa" }],
        caption: { full_caption: "legenda", hashtags: ["#x"] },
      },
      usage: { promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0 },
    });
  },
  generateTutorialCarouselPipeline: () => {
    throw new Error("fora do caso");
  },
}));
vi.mock("./opendesign-renderer", () => ({
  renderOpenDesignSlides: async () => [{ index: 1, filename: "l.png", pngBuffer: Buffer.from("l"), type: "cover", htmlContent: "" }],
  uploadOpenDesignSlideToStorage: async () => "https://storage.exemplo/l.png",
}));

const montouCampanha = vi.fn();
vi.mock("../../prompt-system/carrossel-de-campanha", () => ({
  montarCarrosselDeCampanha: async (...args: unknown[]) => {
    montouCampanha(...args);
    throw new Error("o carrossel de campanha não deveria ser montado sem aprovação");
  },
}));

const BYTES = Buffer.from("PNG-da-peca-aprovada");
const SHA = crypto.createHash("sha256").update(BYTES).digest("hex");
const arquivoNoStorage = { bytes: BYTES };

const TOKEN = "token-efetivo";
vi.mock("./meta-token", () => ({ resolveInstagramToken: async () => TOKEN }));
vi.mock("../../prompt-system/funil-permanente", () => ({
  garantirFunilPermanente: async () => ({ ligado: false, motivo: "teste" }),
}));
vi.mock("../../prompt-system/pos-publicacao", () => ({ concluirCampanhaPublicada: async () => ({ automacaoCriada: false }) }));
const alertas: string[] = [];
vi.mock("../../alerts", () => ({
  sendAlert: async (_n: string, titulo: string) => {
    alertas.push(titulo);
    return true;
  },
  formatError: (e: unknown) => String(e),
}));
vi.mock("./edition-loader", () => ({ loadEdition: async () => ({ stories: [{ title: "t", summary: "s" }] }) }));
vi.mock("../legenda", () => ({
  garantirLegendaSocial: (carousel: unknown) => ({ carousel, problemas: [], reparos: [] }),
}));

const { processScheduledPost } = await import("./worker-service");
const { hashDoPostDaLinha } = await import("../../aprovacao/hash");

function projeto(aprovacao: string | null) {
  return {
    id: "projeto-1",
    slug: "desbuguei",
    name: "eua.journal",
    status: "active",
    niche: "eua",
    content_language: "pt-BR",
    timezone: "America/Sao_Paulo",
    site_url: null,
    brand_display_name: "eua.journal",
    brand_tagline: "",
    brand_primary_color: "#000",
    brand_logo_url: null,
    brand_social_links: {},
    newsletter_from_name: "eua.journal",
    publish_hour_local: 6,
    publish_minute_local: 3,
    editorial_prompt_extra: "",
    settings: aprovacao ? { instagram_keyword: "NEWS", capacidades: { aprovacao } } : { instagram_keyword: "NEWS" },
  };
}

const LEGENDA = "O fato do dia.\n\nComente NEWS e receba a newsletter no Direct.\n\n#EUA #Economia";
const URL_ARTE = "https://storage.exemplo/desbuguei/2026-10-09/social-v2.png";

/** O post como o store do Social V2 o grava: arte congelada, manifesto com hash. */
function linhaDoStoreV2(over: Record<string, unknown> = {}) {
  const artefato = {
    url: URL_ARTE,
    path: "desbuguei/2026-10-09/post-v2/social-v2.png",
    filename: "social-v2.png",
    mime: "image/png",
    sha256: SHA,
    bytes: BYTES.byteLength,
  };
  return {
    id: "post-v2",
    project_id: "projeto-1",
    edition_date: "2026-10-09",
    status: "scheduled",
    generation_version: "social-v2",
    dry_run: false,
    title: "Renda familiar nos EUA bate recorde, e o avanço se concentrou no topo",
    caption: LEGENDA,
    story_id: "s-1",
    event_fingerprint: "renda+recorde",
    visual_asset_id: null,
    origin_channel: "social",
    social_guard_status: "passed",
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    slides_manifest: [{ index: 1, url: URL_ARTE, filename: "social-v2.png", sha256: SHA, bytes: BYTES.byteLength }],
    content_json: {
      format: "noticia",
      hashtags: ["#EUA", "#Economia"],
      arte: { versao: "v2", variante: "noticia_sem_foto", eixo: "economia", artefato },
      visual: { capa: "texto", motivo: "NO_VALID_IMAGE" },
    },
    ...over,
  };
}

/** A vaga do agendador legado: sem arte, o worker gera tudo na hora. */
function linhaDoAgendadorLegado() {
  return {
    id: "post-legado",
    project_id: "projeto-1",
    edition_date: "2026-10-09",
    status: "scheduled",
    generation_version: null,
    dry_run: false,
    title: "pauta",
    caption: null,
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    content_json: { story_index: 0, story_title: "pauta" },
  };
}

/** O que `agendarPostDaCampanha` grava, byte a byte do seu upsert: congelado, e sem perguntar a ninguém. */
function linhaDoCarrosselDeCampanha() {
  return {
    id: "post-campanha",
    project_id: "projeto-1",
    edition_date: "2026-10-09",
    status: "scheduled",
    generation_version: null,
    dry_run: false,
    title: "UltraPrompt",
    caption: null,
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    campaign_id: "camp-1",
    content_json: { format: "prompt", campaign_id: "camp-1", keyword: "PROMPT" },
  };
}

function aprovacao(hash: string, over: Record<string, unknown> = {}) {
  return {
    id: "apr-1",
    project_id: "projeto-1",
    ramo: "post",
    peca_id: "post-v2",
    hash_artefato: hash,
    publicar_em: null,
    estado: "aprovada",
    automatica: false,
    decidido_por: "dono",
    decidido_em: "2026-10-09T08:00:00.000Z",
    refazimentos: 0,
    avisos: [],
    resumo: {},
    ...over,
  };
}

function metaFalsa() {
  const chamadas: string[] = [];
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    if (u.startsWith("https://storage.exemplo/")) return new Response(arquivoNoStorage.bytes, { status: 200 });
    chamadas.push(u);
    if (u.includes("/media_publish")) return Response.json({ id: "media-1" });
    if (u.includes("/media?fields=id,caption")) return Response.json({ data: [] });
    if (u.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
    if (u.includes("/media")) return Response.json({ id: "container-1" });
    return Response.json({});
  }) as unknown as typeof fetch;
  return { fetcher, chamadas };
}

const ENV = { INSTAGRAM_ACCOUNT_ID: "conta-1", INSTAGRAM_ACCESS_TOKEN: "semente", INSTAGRAM_AUTO_POST: "true" };

function statusGravados(): unknown[] {
  return updates.filter((u) => u.tabela === "social_posts" && "status" in u.valores).map((u) => u.valores.status);
}

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  updates.length = 0;
  alertas.length = 0;
  gerouCopyLegado.mockClear();
  montouCampanha.mockClear();
  arquivoNoStorage.bytes = BYTES;
  tabelas.projects = { row: projeto("enforce") };
});

describe("fila em enforce: as três origens de scheduled sem aprovação são barradas", () => {
  it.each([
    ["store do Social V2", "post-v2", linhaDoStoreV2],
    ["agendador legado", "post-legado", linhaDoAgendadorLegado],
    ["carrossel de campanha (Sistema PROMPT, congelado)", "post-campanha", linhaDoCarrosselDeCampanha],
  ] as const)("%s: não publica, não marca failed, volta para draft", async (_origem, id, linha) => {
    tabelas.social_posts = { row: linha() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost(id, {}, ENV, fetcher);

    expect(r.status).toBe("aguardando_aprovacao");
    expect(r.error).toMatch(/^PORTAO_DE_PUBLICACAO/);
    expect(chamadas.filter((u) => u.includes("/media"))).toHaveLength(0);
    expect(statusGravados()).not.toContain("failed");
    expect(statusGravados()).toContain("draft");
    expect(gerouCopyLegado).not.toHaveBeenCalled();
    expect(montouCampanha).not.toHaveBeenCalled();
    expect(alertas).toHaveLength(0);
  });

  it("aprovação ainda aguardando também segura", async () => {
    tabelas.social_posts = { row: linhaDoStoreV2() };
    tabelas.aprovacoes = { row: aprovacao(hashDoPostDaLinha(linhaDoStoreV2()), { estado: "aguardando", decidido_por: null }) };
    const { fetcher, chamadas } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).toBe("aguardando_aprovacao");
    expect(r.error).toMatch(/APROVACAO_AGUARDANDO_DECISAO/);
    expect(chamadas).toHaveLength(0);
  });
});

describe("o outro lado do portão", () => {
  it("aprovado na mesma versão, publica", async () => {
    tabelas.social_posts = { row: linhaDoStoreV2() };
    tabelas.aprovacoes = { row: aprovacao(hashDoPostDaLinha(linhaDoStoreV2())) };
    const { fetcher, chamadas } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).toBe("published");
    expect(chamadas.some((u) => u.includes("/media_publish"))).toBe(true);
  });

  it("cenário 3: aprovado, e a arte foi recongelada depois: recusa pelo hash, sem falar com a Meta", async () => {
    const aprovadaAntes = hashDoPostDaLinha(linhaDoStoreV2());
    const outroSha = "f".repeat(64);
    const depois = linhaDoStoreV2({
      slides_manifest: [{ index: 1, url: URL_ARTE, filename: "social-v2.png", sha256: outroSha, bytes: 10 }],
    });
    tabelas.social_posts = { row: depois };
    tabelas.aprovacoes = { row: aprovacao(aprovadaAntes) };
    const { fetcher, chamadas } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).toBe("aguardando_aprovacao");
    expect(r.error).toMatch(/APROVACAO_HASH_DIVERGENTE/);
    expect(chamadas).toHaveLength(0);
    expect(statusGravados()).not.toContain("failed");
  });

  it("cenário 3: aprovado, e o arquivo no Storage foi trocado: recusa pelo hash do arquivo", async () => {
    tabelas.social_posts = { row: linhaDoStoreV2() };
    tabelas.aprovacoes = { row: aprovacao(hashDoPostDaLinha(linhaDoStoreV2())) };
    arquivoNoStorage.bytes = Buffer.from("outro arquivo");
    const { fetcher, chamadas } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).not.toBe("published");
    expect(r.error).toMatch(/HASH/);
    expect(chamadas.filter((u) => u.includes("/media"))).toHaveLength(0);
  });

  it("aprovado, e a legenda foi trocada por fora depois: recusa pelo hash", async () => {
    tabelas.social_posts = { row: linhaDoStoreV2({ caption: `${LEGENDA} editada por fora` }) };
    tabelas.aprovacoes = { row: aprovacao(hashDoPostDaLinha(linhaDoStoreV2())) };
    const { fetcher, chamadas } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.error).toMatch(/APROVACAO_HASH_DIVERGENTE/);
    expect(chamadas).toHaveLength(0);
  });

  it("fila desligada no projeto: publica sem aprovação, como antes de 05/10/2026", async () => {
    tabelas.projects = { row: projeto(null) };
    tabelas.social_posts = { row: linhaDoStoreV2() };
    const { fetcher } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).toBe("published");
  });

  it("fila em ensaio: publica, e só registra que seguraria", async () => {
    tabelas.projects = { row: projeto("dry_run") };
    tabelas.social_posts = { row: linhaDoStoreV2() };
    const { fetcher } = metaFalsa();
    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);
    expect(r.status).toBe("published");
  });
});
