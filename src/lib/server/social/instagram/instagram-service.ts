import type { EditionContent } from "../../newsroom/schemas";
import {
  DEFAULT_PROJECT_ID,
  type Project,
  projectToday,
  requireActiveProject,
} from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import {
  createCarouselContainer,
  createCarouselItemContainer,
  publishContainer,
  waitForContainerReady,
} from "./meta-client";
import { generateInstagramCarouselPipeline } from "./pipeline";
import { markPostFailed } from "./scheduler";
import type { InstagramCarouselContent } from "./schemas";

export type InstagramRunResult = {
  ok: boolean;
  projectId: string;
  socialPostId: string;
  status: string;
  providerPostId?: string;
  carousel?: InstagramCarouselContent;
  slideUrls?: string[];
  executionTimeMs: number;
  error?: string;
};

/**
 * Edição do dia gravada em `news_editions`.
 *
 * Não existe conteúdo de reserva aqui. O código anterior, ao não encontrar a
 * edição, seguia com um objeto de notícias fictícias escrito no próprio arquivo
 * — e publicava isso no perfil real.
 */
async function loadEdition(project: Project, editionDate: string): Promise<EditionContent> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("news_editions")
    .select("stories, headline, subject, subject_options, preheader, intro, quick_bits, closing, final_line")
    .eq("project_id", project.id)
    .eq("edition_date", editionDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar a edição de ${editionDate}: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Não há edição gravada para ${project.slug} em ${editionDate}. O post não pode ser gerado sem a pauta real.`,
    );
  }

  return {
    subject_options: (data.subject_options as string[]) ?? [data.subject as string],
    subject: data.subject as string,
    preheader: data.preheader as string,
    headline: data.headline as string,
    intro: data.intro as string,
    stories: data.stories as EditionContent["stories"],
    quick_bits: (data.quick_bits as EditionContent["quick_bits"]) ?? [],
    closing: data.closing as string,
    final_line: data.final_line as string,
  };
}

/**
 * Renderiza os slides e sobe para o Storage, devolvendo as URLs públicas.
 *
 * Os PNGs eram gravados em base64 dentro da coluna jsonb de `social_posts`:
 * uma linha passava de 20 MB e a rota que servia uma imagem carregava o
 * manifesto inteiro do banco. A função de upload já existia no renderer e não
 * era chamada por ninguém.
 *
 * O import do renderer é dinâmico de propósito: ele carrega o Playwright, que
 * só existe na máquina do worker. A aplicação web nunca executa este caminho.
 */
async function renderAndUploadSlides(
  project: Project,
  carousel: InstagramCarouselContent,
  editionDate: string,
  socialPostId: string,
): Promise<Array<{ index: number; url: string; filename: string }>> {
  const { renderOpenDesignSlides, uploadOpenDesignSlideToStorage } = await import("./opendesign-renderer");

  const rendered = await renderOpenDesignSlides(carousel);
  const uploaded: Array<{ index: number; url: string; filename: string }> = [];

  for (const slide of rendered) {
    const filepath = `${project.slug}/${editionDate}/${socialPostId}/${slide.filename}`;
    const url = await uploadOpenDesignSlideToStorage(slide.pngBuffer, filepath);

    if (!url) {
      throw new Error(`Falha ao subir o slide ${slide.index} para o Storage.`);
    }

    uploaded.push({ index: slide.index, url, filename: slide.filename });
  }

  return uploaded;
}

/** Publica o carrossel, aguardando cada container ficar pronto. */
async function publishCarousel(
  imageUrls: string[],
  caption: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<string> {
  if (imageUrls.length < 2) {
    throw new Error(`Um carrossel precisa de ao menos 2 slides; foram gerados ${imageUrls.length}.`);
  }

  const containerIds: string[] = [];

  for (const [i, url] of imageUrls.entries()) {
    const item = await createCarouselItemContainer(url, env, fetcher);
    if (!item.ok || !item.creationId) {
      throw new Error(`Falha ao criar o container do slide ${i + 1}: ${item.error}`);
    }
    containerIds.push(item.creationId);
  }

  const carouselContainer = await createCarouselContainer(containerIds, caption, env, fetcher);
  if (!carouselContainer.ok || !carouselContainer.creationId) {
    throw new Error(`Falha ao criar o container do carrossel: ${carouselContainer.error}`);
  }

  const pronto = await waitForContainerReady(carouselContainer.creationId, env, fetcher);
  if (!pronto.ok) {
    throw new Error(`Container não ficou pronto para publicação: ${pronto.error}`);
  }

  const publicado = await publishContainer(carouselContainer.creationId, env, fetcher);
  if (!publicado.ok || !publicado.mediaId) {
    throw new Error(`Falha na publicação final: ${publicado.error}`);
  }

  return publicado.mediaId;
}

/**
 * Processa uma vaga agendada: gera o roteiro da pauta, renderiza, sobe as
 * imagens e publica. É o que o worker executa.
 */
export async function processScheduledPost(
  socialPostId: string,
  options: { autoPost?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<InstagramRunResult> {
  const startTime = Date.now();
  const supabase = getSupabaseAdminClient();

  const { data: post, error: postErr } = await supabase
    .from("social_posts")
    .select("id, project_id, edition_date, status, content_json")
    .eq("id", socialPostId)
    .maybeSingle();

  if (postErr || !post) {
    throw new Error(`Post ${socialPostId} não encontrado.`);
  }

  const projectId = post.project_id as string;

  try {
    if (post.status === "published") {
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "published",
        executionTimeMs: Date.now() - startTime,
      };
    }

    const project = await requireActiveProject(projectId);
    const editionDate = post.edition_date as string;
    const storyIndex = Number((post.content_json as { story_index?: number })?.story_index ?? 0);

    const edition = await loadEdition(project, editionDate);
    const story = edition.stories[storyIndex];

    if (!story) {
      throw new Error(
        `A edição de ${editionDate} tem ${edition.stories.length} pautas; a posição ${storyIndex} não existe.`,
      );
    }

    console.log(`[INSTAGRAM WORKER] ${project.slug} ${editionDate} pauta ${storyIndex + 1}: ${story.title}`);

    const pipelineResult = await generateInstagramCarouselPipeline(
      edition,
      editionDate,
      env,
      fetcher,
      story,
    );

    await supabase
      .from("social_posts")
      .update({
        title: pipelineResult.carousel.title,
        caption: pipelineResult.carousel.caption.full_caption,
        content_json: { ...pipelineResult.carousel, story_index: storyIndex },
        tokens_input: pipelineResult.usage.promptTokens,
        tokens_output: pipelineResult.usage.completionTokens,
        cost_estimate_usd: pipelineResult.usage.estimatedCostUsd,
        status: "generated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", socialPostId);

    const slides = await renderAndUploadSlides(project, pipelineResult.carousel, editionDate, socialPostId);

    await supabase
      .from("social_posts")
      .update({
        slides_manifest: slides,
        asset_paths: slides.map((s) => s.url),
        updated_at: new Date().toISOString(),
      })
      .eq("id", socialPostId);

    const autoPost = options.autoPost ?? env.INSTAGRAM_AUTO_POST !== "false";

    if (!autoPost) {
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "generated",
        carousel: pipelineResult.carousel,
        slideUrls: slides.map((s) => s.url),
        executionTimeMs: Date.now() - startTime,
      };
    }

    const mediaId = await publishCarousel(
      slides.map((s) => s.url),
      pipelineResult.carousel.caption.full_caption,
      env,
      fetcher,
    );

    await supabase
      .from("social_posts")
      .update({
        status: "published",
        provider_post_id: mediaId,
        published_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", socialPostId);

    console.log(`[INSTAGRAM WORKER] Publicado com sucesso. Media ID: ${mediaId}`);

    return {
      ok: true,
      projectId,
      socialPostId,
      status: "published",
      providerPostId: mediaId,
      carousel: pipelineResult.carousel,
      slideUrls: slides.map((s) => s.url),
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    // O motivo fica gravado: as colunas error_message existiam e nunca eram
    // preenchidas, então uma falha só era descoberta olhando o Instagram.
    const message = err instanceof Error ? err.message : String(err);
    await markPostFailed(socialPostId, message);
    console.error(`[INSTAGRAM WORKER] Post ${socialPostId} falhou: ${message}`);

    return {
      ok: false,
      projectId,
      socialPostId,
      status: "failed",
      error: message,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Cria uma vaga com horário imediato, para o worker processar no próximo giro.
 * É o que o painel aciona: a aplicação web não renderiza imagem.
 */
export async function requestInstagramPost(options: {
  projectId?: string;
  editionDateStr?: string;
  storyIndex?: number;
}): Promise<{ socialPostId: string; scheduledAt: string; storyIndex: number }> {
  const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);
  const editionDate = options.editionDateStr || projectToday(project);
  const storyIndex = options.storyIndex ?? 0;

  const edition = await loadEdition(project, editionDate);
  const story = edition.stories[storyIndex];
  if (!story) {
    throw new Error(`A edição de ${editionDate} não tem pauta na posição ${storyIndex}.`);
  }

  const supabase = getSupabaseAdminClient();
  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from("social_posts")
    .upsert(
      {
        project_id: project.id,
        edition_date: editionDate,
        article_slug: `edicao-${editionDate}`,
        platform: "instagram",
        post_type: "carousel",
        title: story.title,
        status: "scheduled",
        scheduled_at: agora,
        idempotency_key: `instagram-${editionDate}-manual-${String(storyIndex + 1).padStart(2, "0")}`,
        content_json: { story_index: storyIndex, story_title: story.title },
        dry_run: false,
        updated_at: agora,
      },
      { onConflict: "project_id,idempotency_key" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Falha ao enfileirar o post: ${error.message}`);
  }

  return { socialPostId: data.id, scheduledAt: agora, storyIndex };
}
