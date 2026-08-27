import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstagramCarouselSchema } from "./schemas";

/**
 * Stub do cliente Supabase: cada tabela devolve o que o teste programou.
 * O serviço nunca deve alcançar a rede — o teste anterior chamava OpenAI e
 * Supabase de verdade e estourava o tempo limite.
 */
const tabelas: Record<string, { row?: unknown; rows?: unknown[] }> = {};
const updates: Array<{ tabela: string; valores: Record<string, unknown> }> = [];

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
      updates.push({ tabela, valores });
      return query;
    },
    upsert: () => query,
    insert: () => query,
    then: undefined,
  };
  return query;
}

vi.mock("../../supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: (tabela: string) => construirQuery(tabela) }),
}));

const { processScheduledPost } = await import("./worker-service");

beforeEach(() => {
  for (const chave of Object.keys(tabelas)) delete tabelas[chave];
  updates.length = 0;
});

describe("validação do roteiro do carrossel", () => {
  it("aceita um carrossel bem formado", () => {
    const carrossel = {
      title: "Carrossel de Teste Desbuguei",
      edition_date: "2026-08-28",
      primary_topic: "Redes Sociais",
      target_audience_focus: "Criadores e Vendedores",
      slides: [
        {
          index: 1,
          type: "cover" as const,
          eyebrow: "BUGNEWS",
          title: "Instagram lança IA de edição",
          body: "Veja o que muda no seu perfil hoje",
          cover_image_prompt: "Minimalist 3D render tech background",
        },
        { index: 2, type: "intro" as const, title: "O que aconteceu?", body: "A Meta liberou novas ferramentas." },
        {
          index: 3,
          type: "content" as const,
          title: "Como funciona",
          body: "Você escolhe o tema e a IA gera 3 roteiros.",
          bullet_points: ["Mais rápido", "Sem travamentos"],
        },
        { index: 4, type: "practical_impact" as const, title: "Como usar hoje", body: "Abra a aba de criação." },
        {
          index: 5,
          type: "cta" as const,
          title: "Curtiu?",
          body: "Salve este post!",
          cta_text: "Comente NEWS para receber no Direct",
        },
      ],
      caption: {
        headline: "A IA do Instagram atualizou! ⬇️",
        intro_summary: "Novas ferramentas de edição direta no app.",
        key_takeaways: ["Roteiros rápidos", "Mais engajamento"],
        cta_call: "Comente NEWS para receber no Direct!",
        hashtags: ["#inteligenciaartificial", "#redessociais", "#desbuguei"],
        full_caption: "Confira a nova IA do Instagram! Agora você está desbugado.",
      },
    };

    expect(InstagramCarouselSchema.safeParse(carrossel).success).toBe(true);
  });

  it("recusa carrossel com menos de 5 slides", () => {
    const resultado = InstagramCarouselSchema.safeParse({
      title: "Título curto demais para valer",
      edition_date: "2026-08-28",
      primary_topic: "IA",
      slides: [],
      caption: {
        headline: "Uma legenda qualquer",
        intro_summary: "Resumo com tamanho suficiente para passar.",
        key_takeaways: ["a", "b"],
        cta_call: "Comente NEWS aqui embaixo",
        hashtags: ["#a", "#b", "#c"],
        full_caption: "x".repeat(60),
      },
    });

    expect(resultado.success).toBe(false);
  });
});

describe("processamento de um post agendado", () => {
  const post = {
    id: "post-1",
    project_id: "projeto-1",
    edition_date: "2026-08-28",
    status: "scheduled",
    content_json: { story_index: 0 },
  };

  const projeto = {
    id: "projeto-1",
    slug: "desbuguei",
    name: "Desbuguei",
    status: "active",
    niche: "IA",
    content_language: "pt-BR",
    timezone: "America/Sao_Paulo",
    site_url: null,
    brand_display_name: "b. / desbuguei.ia",
    brand_tagline: "",
    brand_primary_color: "#ff4a1c",
    brand_logo_url: null,
    brand_social_links: {},
    newsletter_from_name: "desbuguei.ia",
    publish_hour_local: 6,
    publish_minute_local: 3,
    editorial_prompt_extra: "",
    settings: {},
  };

  it("falha e registra o motivo quando não há edição gravada", async () => {
    tabelas.social_posts = { row: post };
    tabelas.projects = { row: projeto };
    tabelas.news_editions = { row: null };

    const resultado = await processScheduledPost("post-1");

    expect(resultado.ok).toBe(false);
    expect(resultado.status).toBe("failed");
    expect(resultado.error).toMatch(/não há edição gravada/i);

    // O motivo precisa ficar na linha: as colunas error_message existiam e
    // nunca eram preenchidas.
    const falha = updates.find((u) => u.valores.status === "failed");
    expect(falha?.valores.error_message).toMatch(/não há edição gravada/i);
  });

  it("não gera conteúdo de exemplo quando a edição está ausente", async () => {
    tabelas.social_posts = { row: post };
    tabelas.projects = { row: projeto };
    tabelas.news_editions = { row: null };

    const resultado = await processScheduledPost("post-1");

    // O comportamento antigo publicava notícias fictícias escritas no fonte.
    expect(resultado.carousel).toBeUndefined();
    expect(resultado.providerPostId).toBeUndefined();
  });

  it("não reprocessa um post já publicado", async () => {
    tabelas.social_posts = { row: { ...post, status: "published" } };

    const resultado = await processScheduledPost("post-1");

    expect(resultado.ok).toBe(true);
    expect(resultado.status).toBe("published");
    expect(updates).toHaveLength(0);
  });

  it("recusa posição de pauta que não existe na edição", async () => {
    tabelas.social_posts = { row: { ...post, content_json: { story_index: 9 } } };
    tabelas.projects = { row: projeto };
    tabelas.news_editions = {
      row: {
        stories: [{ title: "Única pauta" }],
        headline: "h",
        subject: "s",
        subject_options: ["s"],
        preheader: "p",
        intro: "i",
        quick_bits: [],
        closing: "c",
        final_line: "f",
      },
    };

    const resultado = await processScheduledPost("post-1");

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/posição 9 não existe/i);
  });
});
