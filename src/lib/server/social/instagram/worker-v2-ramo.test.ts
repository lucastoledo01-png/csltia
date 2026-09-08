import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O worker diante das duas gerações de post.
 *
 * O que estes testes exercitam é o CAMINHO, não pedaços dele: a leitura da
 * linha, a bifurcação, o preparo e a cauda irreversível inteira. A Meta é
 * substituída no `fetcher`, e a publicação segura roda de verdade — mocká-la
 * seria testar o mock justamente na parte que não se pode errar.
 *
 * O gerador antigo e o renderizador antigo são espionados. Para o post V2, a
 * asserção não é "produziu a coisa certa": é que eles não foram chamados
 * NENHUMA vez. Post pronto que passa pelo gerador deixa de ser o post que foi
 * aprovado.
 */

const tabelas: Record<string, { row?: unknown; rows?: unknown[] }> = {};
const updates: Array<Record<string, unknown>> = [];
/**
 * Faz falhar UMA gravação específica, escolhida pelo nome de um campo.
 *
 * Derrubar todo UPDATE não serviria: a marca de posse também é um UPDATE, e ela
 * lança, então o fluxo morreria antes de chegar à publicação — o que é o
 * comportamento correto para banco fora do ar, e não é o cenário aqui. O que se
 * quer isolar é a gravação do registro de revisão falhando depois de a Meta já
 * ter sido chamada.
 */
const falharUpdate: { campo: string | null; mensagem: string } = { campo: null, mensagem: "conexão perdida" };

/**
 * Quando ligado, a reivindicação atômica da vaga não afeta nenhuma linha, que é
 * o que o Postgres devolve para quem chegou em segundo lugar.
 */
const perderDisputa = { ligado: false };

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

      if (tabela === "social_posts" && falharUpdate.campo && falharUpdate.campo in valores) {
        return { ...query, eq: async () => ({ data: null, error: { message: falharUpdate.mensagem } }) };
      }

      /*
       * A reivindicação da vaga: `update(...).eq(id).eq(status).select("id")`.
       *
       * O que decide a disputa é quantas linhas o UPDATE afetou, então o dublê
       * precisa devolver a lista — vazia para quem perdeu, com uma linha para
       * quem ganhou. Devolver o `query` genérico faria toda reivindicação
       * parecer perdida.
       */
      const reivindicacao = {
        ...query,
        eq: () => reivindicacao,
        select: async () => ({
          data: perderDisputa.ligado ? [] : [{ id: "post-v2" }],
          error: null,
        }),
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

/** O gerador antigo de copy. Para o V2, a contagem tem que ficar em zero. */
const gerouCopyLegado = vi.fn();
vi.mock("./pipeline", () => ({
  generateInstagramCarouselPipeline: (...args: unknown[]) => {
    gerouCopyLegado(...args);
    return Promise.resolve({
      carousel: {
        title: "TÍTULO REGENERADO PELO LEGADO",
        format: "noticia",
        slides: [{ index: 1, type: "cover", title: "capa legada" }],
        caption: { full_caption: "LEGENDA REGENERADA PELO LEGADO", hashtags: ["#legado"] },
      },
      usage: { promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0 },
      contexto: { assunto: "x", orgao: "y" },
    });
  },
  generateTutorialCarouselPipeline: () => {
    throw new Error("tutorial não é o caso destes testes");
  },
}));

/** O renderizador antigo, que passa por banco de fotos. */
const renderizouLegado = vi.fn();
vi.mock("./opendesign-renderer", () => ({
  renderOpenDesignSlides: (...args: unknown[]) => {
    renderizouLegado(...args);
    return Promise.resolve([{ index: 1, filename: "legado.png", pngBuffer: Buffer.from("legado"), type: "cover", htmlContent: "" }]);
  },
  uploadOpenDesignSlideToStorage: async () => "https://storage.exemplo/legado.png",
}));

/**
 * O renderizador determinístico do V2, sem abrir navegador no teste.
 *
 * Os defeitos de render que os testes precisam simular (fonte que não chegou,
 * PNG acima do teto) entram por `arteDefeituosa`, que o `beforeEach` limpa.
 * Reatribuir o export do módulo no meio de um teste vazaria para os seguintes,
 * e foi o que aconteceu na primeira volta: três testes depois deste quebraram
 * por causa de um mock que ficou de pé.
 */
const renderizouV2 = vi.fn();
const arteDefeituosa: { fontesQueFaltaram: string[]; bytes: number | null; temaDegradado: string } = {
  fontesQueFaltaram: [],
  bytes: null,
  temaDegradado: "",
};
vi.mock("../arte", () => ({
  renderizarCapas: (entradas: Array<Record<string, unknown>>) => {
    renderizouV2(entradas);
    return Promise.resolve(
      entradas.map((e) => ({
        capa: { comFoto: Boolean(e.asset), motivoSemFoto: String(e.motivoSemFoto ?? "") },
        html: "<html></html>",
        png:
          arteDefeituosa.bytes === null
            ? Buffer.from(`arte-v2:${String(e.headline)}`)
            : Buffer.alloc(arteDefeituosa.bytes),
        jpeg: Buffer.from("jpeg"),
        fontesQueFaltaram: arteDefeituosa.fontesQueFaltaram,
        temaDegradado: arteDefeituosa.temaDegradado,
        usouLayoutDesenhado: false,
        diagnosticoDoLayout: "LAYOUT_NOT_APPLICABLE_NO_PHOTO",
      })),
    );
  },
}));

const subiuArte = vi.fn();
vi.mock("./armazenamento", () => ({
  subirPngParaStorage: (png: Buffer, caminho: string) => {
    subiuArte(caminho, png.byteLength);
    return Promise.resolve(`https://storage.exemplo/${caminho}`);
  },
}));

/**
 * O token que vale mora em `project_credentials` e é trocado pelo cron. A env é
 * semente, e em regime ela está vencida.
 */
const TOKEN_EFETIVO = "token-renovado-pelo-cron";
vi.mock("./meta-token", () => ({ resolveInstagramToken: async () => TOKEN_EFETIVO }));
vi.mock("../../prompt-system/funil-permanente", () => ({
  garantirFunilPermanente: async () => ({ ligado: true, keyword: "VISA", automationId: "a1", criadaAgora: false }),
}));
vi.mock("../../prompt-system/pos-publicacao", () => ({ concluirCampanhaPublicada: async () => ({ automacaoCriada: false }) }));
const alertas: Array<{ nivel: string; titulo: string; corpo: string }> = [];
vi.mock("../../alerts", () => ({
  sendAlert: async (nivel: string, titulo: string, corpo: string) => {
    alertas.push({ nivel, titulo, corpo });
    return true;
  },
  formatError: (e: unknown) => String(e),
}));
vi.mock("./edition-loader", () => ({ loadEdition: async () => ({ stories: [{ title: "t", summary: "s" }] }) }));
/*
 * A auditoria de legenda do caminho legado passa direto.
 *
 * Ela é do legado e tem teste próprio; aqui ela só atrapalharia, porque o
 * carrossel de mentira não tem os campos que ela inspeciona. O que estes
 * testes afirmam sobre o legado é que ele PASSOU pelo gerador antigo, não como
 * a legenda dele é auditada.
 */
vi.mock("../legenda", () => ({
  garantirLegendaSocial: (carousel: unknown) => ({ carousel, problemas: [], reparos: [] }),
}));

const { processScheduledPost } = await import("./worker-service");

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

const HEADLINE = "USCIS muda prazo de análise do I-765";
const LEGENDA = "A mudança vale a partir de outubro.\n\nComente VISA e receba a avaliação no Direct.\n\n#USCIS #Imigracao";

function linhaV2(over: Record<string, unknown> = {}, conteudo: Record<string, unknown> = {}) {
  return {
    id: "post-v2",
    project_id: "projeto-1",
    edition_date: "2026-09-06",
    status: "scheduled",
    generation_version: "social-v2",
    dry_run: false,
    title: HEADLINE,
    caption: LEGENDA,
    story_id: "s-1",
    event_fingerprint: "uscis+prazo",
    visual_asset_id: null,
    origin_channel: "social",
    social_guard_status: "passed",
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    content_json: {
      format: "noticia",
      hashtags: ["#USCIS", "#Imigracao"],
      arte: { versao: "v2", variante: "noticia_sem_foto", eixo: "processo" },
      visual: { capa: "texto", motivo: "NO_VALID_IMAGE" },
      ...conteudo,
    },
    ...over,
  };
}

function linhaLegada(over: Record<string, unknown> = {}) {
  return {
    id: "post-legado",
    project_id: "projeto-1",
    edition_date: "2026-09-06",
    status: "scheduled",
    generation_version: null,
    dry_run: false,
    title: "título antigo",
    caption: "legenda antiga",
    story_id: null,
    social_guard_status: null,
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    content_json: { story_index: 0, format: "noticia" },
    ...over,
  };
}

/** A Meta, de mentira. Registra o que recebeu para as asserções de imutabilidade. */
function metaFalsa() {
  const chamadas: Array<{ url: string; corpo: Record<string, string> }> = [];

  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    // O cliente da Meta manda form-urlencoded, não JSON. A legenda chega aqui
    // percorrendo a mesma codificação que ela percorre em produção, o que é
    // exatamente o que o teste de imutabilidade precisa exercitar.
    const corpo = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    chamadas.push({ url: u, corpo });

    /*
     * A Meta de mentira CONFERE o token, e é isso que a torna útil.
     *
     * Aceitar qualquer token faria o teste passar com a semente vencida, que é
     * exatamente o defeito que se quer pegar: a reconciliação consultava o
     * container com o token da env em vez do resolvido.
     */
    const tokenUsado =
      new URL(u).searchParams.get("access_token") ?? corpo.access_token ?? "";
    if (tokenUsado && tokenUsado !== TOKEN_EFETIVO) {
      return Response.json(
        { error: { message: "Error validating access token: Session has expired.", code: 190 } },
        { status: 400 },
      );
    }

    if (u.includes("/media_publish")) return Response.json({ id: "media-999" });
    if (u.includes("/media?fields=id,caption")) return Response.json({ data: [] });
    if (u.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
    if (u.includes("/media")) return Response.json({ id: "container-1" });
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

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  updates.length = 0;
  gerouCopyLegado.mockClear();
  renderizouLegado.mockClear();
  renderizouV2.mockClear();
  subiuArte.mockClear();
  alertas.length = 0;
  falharUpdate.campo = null;
  perderDisputa.ligado = false;
  arteDefeituosa.fontesQueFaltaram = [];
  arteDefeituosa.bytes = null;
  arteDefeituosa.temaDegradado = "";
  tabelas.projects = { row: PROJETO };
});

// ---------------------------------------------------------------- A
describe("A. o post legado continua igual", () => {
  it("passa pelo gerador antigo e pelo renderizador antigo", async () => {
    tabelas.social_posts = { row: linhaLegada() };
    const { fetcher } = metaFalsa();

    const r = await processScheduledPost("post-legado", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("published");
    expect(gerouCopyLegado).toHaveBeenCalledTimes(1);
    expect(renderizouLegado).toHaveBeenCalledTimes(1);
    expect(renderizouV2).not.toHaveBeenCalled();
  });

  it("continua sobrescrevendo title e caption, que é o comportamento dele", async () => {
    tabelas.social_posts = { row: linhaLegada() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-legado", {}, ENV, fetcher);

    const gravouRoteiro = updates.find((u) => u.status === "generated");
    expect(gravouRoteiro?.title).toBe("TÍTULO REGENERADO PELO LEGADO");
    expect(gravouRoteiro?.caption).toBe("LEGENDA REGENERADA PELO LEGADO");
  });
});

// ---------------------------------------------------------------- B, C
describe("B e C. o post social-v2 não regenera nada", () => {
  it("zero chamada ao gerador antigo de copy", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(gerouCopyLegado).not.toHaveBeenCalled();
  });

  it("zero chamada ao renderizador antigo, que é quem passa por banco de fotos", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(renderizouLegado).not.toHaveBeenCalled();
    expect(renderizouV2).toHaveBeenCalledTimes(1);
  });

  it("marca posse ANTES de renderizar, senão dois giros publicam o mesmo post", async () => {
    /*
     * `findDuePosts` filtra por `status = scheduled`. Enquanto a linha
     * continuasse nesse estado, ela seguia elegível — e o V2 renderiza no
     * Chromium, que leva segundos. Dois giros concorrentes desenhariam e
     * publicariam a mesma peça duas vezes.
     *
     * O valor é `generated` porque o CHECK da tabela só aceita
     * ('draft','generated','approved','scheduled','published','failed'), e no
     * legado ele já significa "o worker pegou e produziu o artefato". Um
     * `processing` novo exigiria migration.
     */
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    const iPosse = updates.findIndex((u) => u.status === "generated");
    expect(iPosse).toBeGreaterThanOrEqual(0);

    // E a posse é gravada antes do render, não depois.
    const iManifesto = updates.findIndex((u) => u.slides_manifest);
    expect(iManifesto).toBeGreaterThan(iPosse);
    expect(renderizouV2).toHaveBeenCalledTimes(1);
  });

  it("quem perde a reivindicação não renderiza, não publica e não marca falha", async () => {
    /*
     * A reivindicação é atômica: `UPDATE ... WHERE id = X AND status =
     * 'scheduled'`. Quem chega depois não afeta linha nenhuma.
     *
     * O que este teste protege é a consequência: o perdedor NÃO pode seguir
     * para o `markPostFailed`, senão ele marcaria `failed` a linha que o
     * vencedor está publicando neste instante, e o desfecho seria uma linha
     * marcada como falha com um post no ar.
     */
    tabelas.social_posts = { row: linhaV2() };
    perderDisputa.ligado = true;
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.status).toBe("skipped");
    expect(r.ok).toBe(true);
    expect(renderizouV2).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(0);
    expect(updates.find((u) => u.status === "failed")).toBeUndefined();
    expect(alertas).toHaveLength(0);
  });

  it("a marca de posse não carrega conteúdo: é só o status", async () => {
    // O legado grava título, legenda e content_json junto com `generated`,
    // porque ele acabou de produzir os três. Aqui não se produziu nada.
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    const posse = updates.find((u) => u.status === "generated")!;
    expect(Object.keys(posse).sort()).toEqual(["status", "updated_at"]);
  });

  it("não toca em title, caption nem nas chaves editoriais de content_json", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    for (const u of updates) {
      expect(Object.keys(u)).not.toContain("title");
      expect(Object.keys(u)).not.toContain("caption");
      expect(Object.keys(u)).not.toContain("content_json");
      expect(Object.keys(u)).not.toContain("visual_asset_id");
      expect(Object.keys(u)).not.toContain("story_id");
      expect(Object.keys(u)).not.toContain("event_fingerprint");
      expect(Object.keys(u)).not.toContain("origin_channel");
      expect(Object.keys(u)).not.toContain("social_guard_status");
    }
  });
});

// ---------------------------------------------------------------- D
describe("D. social-v2 sem foto publica o brand card", () => {
  it("renderiza capa de texto e não sai procurando outra imagem", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("published");

    const entrada = renderizouV2.mock.calls[0][0][0];
    expect(entrada.asset).toBeNull();
    expect(entrada.motivoSemFoto).toBe("NO_VALID_IMAGE");
    // Falta de foto não é pedido de busca: nenhum renderizador com fallback foi acionado.
    expect(renderizouLegado).not.toHaveBeenCalled();
  });

  it("com foto aprovada, é a foto da linha que entra na arte", async () => {
    tabelas.social_posts = {
      row: linhaV2({ visual_asset_id: "asset-1" }, {
        // A variante acompanha a foto: é assim que o store grava a linha.
        arte: { versao: "v2", variante: "fullbleed_portrait", eixo: "processo" },
        visual: {
          imageUrl: "https://upload.wikimedia.org/foto.jpg",
          attribution: "Foto: Alguém / Wikimedia Commons / CC BY-SA",
        },
      }),
    };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    const entrada = renderizouV2.mock.calls[0][0][0];
    expect(entrada.asset).toEqual({
      imageUrl: "https://upload.wikimedia.org/foto.jpg",
      attribution: "Foto: Alguém / Wikimedia Commons / CC BY-SA",
    });
  });
});

// ---------------------------------------------------------------- E
describe("E. carga V2 incompleta não é consertada", () => {
  const faltas: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["sem title", { title: "" }, {}],
    ["sem caption", { caption: "   " }, {}],
    ["sem story_id", { story_id: null }, {}],
    ["sem hashtags", {}, { hashtags: [] }],
    ["sem o bloco arte", {}, { arte: undefined }],
    ["sem o bloco visual", {}, { visual: undefined }],
    ["visual sem foto e sem capa=texto", {}, { visual: { motivo: "" } }],
    ["guarda reprovou", { social_guard_status: "failed" }, {}],
    ["é ensaio", { dry_run: true }, {}],
  ];

  for (const [nome, over, conteudo] of faltas) {
    it(`${nome}: bloqueia, com código estruturado, sem publicar`, async () => {
      const conteudoLimpo = { ...conteudo };
      const linha = linhaV2(over, conteudoLimpo);
      for (const [k, v] of Object.entries(conteudoLimpo)) {
        if (v === undefined) delete (linha.content_json as Record<string, unknown>)[k];
      }
      tabelas.social_posts = { row: linha };
      const { fetcher, chamadas } = metaFalsa();

      const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

      expect(r.ok).toBe(false);
      expect(r.status).toBe("failed");
      expect(r.error).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");

      // Não tentou consertar: nenhum gerador, nenhum render, nenhuma Meta.
      expect(gerouCopyLegado).not.toHaveBeenCalled();
      expect(renderizouV2).not.toHaveBeenCalled();
      expect(renderizouLegado).not.toHaveBeenCalled();
      expect(chamadas).toHaveLength(0);

      // O código fica na linha, para alguém olhar depois.
      const falha = updates.find((u) => u.status === "failed");
      expect(String(falha?.error_message)).toContain("SOCIAL_V2_PAYLOAD_INCOMPLETE");
    });
  }
});

// ---------------------------------------------------------------- F, G
describe("F e G. legenda e manchete chegam intactas à Meta", () => {
  it("a legenda enviada é byte a byte a persistida", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    const container = chamadas.find((c) => c.url.includes("/media") && !c.url.includes("media_publish"));
    expect(container?.corpo.caption).toBe(LEGENDA);
    expect(String(container?.corpo.caption)).toContain("#USCIS #Imigracao");
  });

  it("a manchete que vai para a arte é a persistida em title", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(renderizouV2.mock.calls[0][0][0].headline).toBe(HEADLINE);
    expect(renderizouV2.mock.calls[0][0][0].eixo).toBe("processo");
  });

  it("a arte publicada é a que saiu do renderizador determinístico", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(subiuArte).toHaveBeenCalledTimes(1);
    const [caminho, tamanho] = subiuArte.mock.calls[0];
    expect(String(caminho)).toContain("post-v2/social-v2-1.png");
    expect(tamanho).toBe(Buffer.from(`arte-v2:${HEADLINE}`).byteLength);

    const container = chamadas.find((c) => c.url.includes("/media") && !c.url.includes("media_publish"));
    expect(String(container?.corpo.image_url)).toContain("social-v2-1.png");
  });
});

// ---------------------------------------------------------------- H
describe("H. retry não cria um segundo container", () => {
  it("container FINISHED de uma tentativa anterior republica o MESMO creation_id", async () => {
    tabelas.social_posts = {
      row: linhaV2({
        provider_creation_id: "container-anterior",
        publish_attempted_at: "2026-09-06T11:00:00Z",
      }),
    };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    // Nenhuma criação de container nova: só consulta de estado e publish.
    const criacoes = chamadas.filter((c) => c.url.endsWith("/media") && c.corpo.image_url);
    expect(criacoes).toHaveLength(0);
    // E republicou o container que já existia.
    const publish = chamadas.find((c) => c.url.includes("/media_publish"));
    expect(publish?.corpo.creation_id).toBe("container-anterior");
    // Nem renderizou de novo: a arte da tentativa anterior serviu.
    expect(renderizouV2).not.toHaveBeenCalled();
  });

  it("post já publicado não fala com a Meta", async () => {
    tabelas.social_posts = { row: linhaV2({ status: "published" }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.status).toBe("published");
    expect(chamadas).toHaveLength(0);
    expect(renderizouV2).not.toHaveBeenCalled();
  });

  it("registra a intenção antes de publicar, também no ramo V2", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    const iCreation = updates.findIndex((u) => u.provider_creation_id);
    expect(iCreation).toBeGreaterThanOrEqual(0);
    expect(updates[iCreation].publish_attempted_at).toBeTruthy();

    // A gravação da intenção acontece antes do media_publish chegar à Meta.
    const iPublish = chamadas.findIndex((c) => c.url.includes("/media_publish"));
    expect(iPublish).toBeGreaterThanOrEqual(0);
    // E o media_id só é gravado depois.
    const iMedia = updates.findIndex((u) => u.provider_post_id);
    expect(iMedia).toBeGreaterThan(iCreation);
  });
});

// ---------------------------------------------------------------- extra
describe("a peça publicada tem que ser a peça aprovada", () => {
  it("fonte que não carregou bloqueia a publicação", async () => {
    /*
     * `document.fonts.ready` resolve mesmo quando o Google Fonts não respondeu.
     * Sem Playfair Display, o ajuste mede a manchete na serifa do sistema,
     * encolhe de outro jeito e quebra em outro ponto. A diferença é pequena o
     * bastante para passar batida, que é o que a torna perigosa.
     */
    arteDefeituosa.fontesQueFaltaram = ["Playfair Display"];
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("Playfair Display");
    expect(chamadas).toHaveLength(0);
    expect(subiuArte).not.toHaveBeenCalled();
  });

  it("tema que não veio do banco bloqueia: canvas e paleta sairiam diferentes", async () => {
    arteDefeituosa.temaDegradado = "tema do banco inacessível, caiu no default do repo";
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("sem o tema do banco");
    expect(subiuArte).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(0);
  });

  it("arte acima do teto de bytes da Meta não sobe nem publica", async () => {
    arteDefeituosa.bytes = 9 * 1024 * 1024;
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("teto da Meta");
    expect(subiuArte).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(0);
  });
});

describe("o token que a Meta recebe é o efetivo, em toda chamada", () => {
  it("a reconciliação de tentativa anterior usa o token resolvido, não a semente", async () => {
    /*
     * O defeito: `reconciliarTentativaAnterior` recebia a env crua, e o token
     * efetivo só era resolvido 78 linhas abaixo. Em regime a semente está
     * vencida — o cron troca o token em `project_credentials` e ninguém
     * atualiza a env.
     *
     * A consequência era a pior possível para este caminho: um post JÁ
     * publicado no Instagram recebia "Session has expired" na consulta do
     * container, virava "revisar", e nunca tinha o `media_id` reconciliado.
     * Ficava sem insights, sem automação de Direct, e com a linha marcada como
     * falha — enquanto o container estava saudável.
     */
    tabelas.social_posts = {
      row: linhaV2({
        provider_creation_id: "container-anterior",
        publish_attempted_at: "2026-09-06T11:00:00Z",
      }),
    };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("published");

    // Toda chamada à Meta, inclusive a da reconciliação, com o token efetivo.
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) {
      const daUrl = new URL(c.url).searchParams.get("access_token");
      const doCorpo = c.corpo.access_token;
      expect(daUrl ?? doCorpo ?? TOKEN_EFETIVO, c.url.slice(0, 70)).toBe(TOKEN_EFETIVO);
    }
  });

  it("nenhuma chamada leva a semente da env", async () => {
    tabelas.social_posts = { row: linhaV2() };
    const { fetcher, chamadas } = metaFalsa();
    await processScheduledPost("post-v2", {}, ENV, fetcher);

    for (const c of chamadas) {
      expect(c.url, c.url.slice(0, 70)).not.toContain("semente-vencida");
      expect(c.corpo.access_token ?? "").not.toBe("semente-vencida");
    }
  });
});

describe("publicação de desfecho incerto", () => {
  /** A Meta aceita o container e depois o publish falha: não se sabe se saiu. */
  function metaQueEngasgaNoPublish() {
    const fetcher = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/media_publish")) return new Response("erro", { status: 500 });
      if (u.includes("/media?fields=id,caption")) return Response.json({ data: [] });
      if (u.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
      if (u.includes("/media")) return Response.json({ id: "container-1" });
      return Response.json({});
    }) as unknown as typeof fetch;
    return fetcher;
  }

  it("vai para revisão e o container fica registrado", async () => {
    tabelas.social_posts = { row: linhaV2() };

    const r = await processScheduledPost("post-v2", {}, ENV, metaQueEngasgaNoPublish());

    expect(r.ok).toBe(false);
    expect(r.status).toBe("needs_review");

    // O creation_id foi gravado ANTES do publish, que é o que permite
    // reconciliar no giro seguinte em vez de chutar.
    expect(updates.find((u) => u.provider_creation_id === "container-1")).toBeTruthy();
    const falha = updates.find((u) => u.status === "failed");
    expect(String(falha?.error_message)).toContain("PUBLICAÇÃO INCERTA");
  });

  it("se nem o registro da revisão pode ser gravado, escala", async () => {
    /*
     * O pior estado do sistema, e o que não tinha teste: a Meta pode ter
     * publicado, e a marcação que impede o próximo giro de tentar de novo
     * falhou. A linha continua elegível, então o risco é post duplicado. Não
     * há conserto automático; o que tem que existir é alguém sabendo, com o
     * container na mão, enquanto ainda dá para reconciliar.
     */
    tabelas.social_posts = { row: linhaV2() };
    falharUpdate.campo = "error_message";

    const r = await processScheduledPost("post-v2", {}, ENV, metaQueEngasgaNoPublish());

    expect(r.ok).toBe(false);
    const critico = alertas.find((a) => a.nivel === "critical" && a.titulo.includes("NÃO consegui registrar"));
    expect(critico).toBeTruthy();
    expect(critico!.corpo).toContain("risco de post duplicado");
    expect(critico!.corpo).toContain("container-1");
  });
});

// ---------------------------------------------------------------- I
describe("I. legado e V2 no mesmo giro", () => {
  it("cada um vai pelo seu ramo, na mesma execução do processo", async () => {
    const { fetcher } = metaFalsa();

    tabelas.social_posts = { row: linhaLegada() };
    const legado = await processScheduledPost("post-legado", {}, ENV, fetcher);

    tabelas.social_posts = { row: linhaV2() };
    const v2 = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(legado.status).toBe("published");
    expect(v2.status).toBe("published");

    // Uma passada pelo gerador antigo (a do legado), uma pelo novo (a do V2).
    expect(gerouCopyLegado).toHaveBeenCalledTimes(1);
    expect(renderizouLegado).toHaveBeenCalledTimes(1);
    expect(renderizouV2).toHaveBeenCalledTimes(1);
  });
});
