import { type Project, requireActiveProject } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { loadEdition } from "./edition-loader";
import {
  createCarouselContainer,
  createCarouselItemContainer,
  publishContainer,
  waitForContainerReady,
} from "./meta-client";
import { renderOpenDesignSlides, uploadOpenDesignSlideToStorage } from "./opendesign-renderer";
import { generateInstagramCarouselPipeline } from "./pipeline";
import { markPostFailed } from "./scheduler";
import type { InstagramCarouselContent } from "./schemas";

/**
 * Geração, renderização e publicação dos posts.
 *
 * Só o worker carrega este módulo. Ele importa o renderizador, que depende do
 * Playwright — ausente na hospedagem que serve o site, onde nem o build passa
 * se algo do lado web alcançar esta cadeia.
 */

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
 * Renderiza os slides e sobe para o Storage, devolvendo as URLs públicas.
 *
 * Os PNGs eram gravados em base64 numa coluna jsonb: uma linha passava de
 * 20 MB e servir uma imagem carregava o manifesto inteiro do banco.
 */
async function renderAndUploadSlides(
  project: Project,
  carousel: InstagramCarouselContent,
  editionDate: string,
  socialPostId: string,
): Promise<Array<{ index: number; url: string; filename: string }>> {
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

/** Publica o carrossel, aguardando o container ficar pronto. */
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

/** Processa uma vaga agendada de ponta a ponta. */
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

    const pipelineResult = await generateInstagramCarouselPipeline(edition, editionDate, env, fetcher, story);

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
