import { type Project, requireActiveProject } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { loadEdition } from "./edition-loader";
import {
  createCarouselContainer,
  createCarouselItemContainer,
  createSingleImageContainer,
} from "./meta-client";
import { renderOpenDesignSlides, uploadOpenDesignSlideToStorage } from "./opendesign-renderer";
import {
  generateInstagramCarouselPipeline,
  generateTutorialCarouselPipeline,
  type TutorialArticleInput,
} from "./pipeline";
import { resolveInstagramToken } from "./meta-token";
import { markPostFailed } from "./scheduler";
import { getArticleBySlug } from "../../articles-service";
import { montarCarrosselDeCampanha } from "../../prompt-system/carrossel-de-campanha";
import { concluirCampanhaPublicada } from "../../prompt-system/pos-publicacao";
import { garantirFunilPermanente } from "../../prompt-system/funil-permanente";
import { garantirLegendaSocial, type ContextoDaLegenda } from "../legenda";
import {
  gravarOuFalhar,
  publicarComRegistro,
  reconciliarTentativaAnterior,
} from "./publicacao-segura";
import { formatError, sendAlert } from "../../alerts";
import type { CarouselFormat, InstagramCarouselContent } from "./schemas";
import type { AITokenUsage } from "../../newsroom/ai-provider";

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

type CarrosselGerado = {
  carousel: InstagramCarouselContent;
  usage: AITokenUsage;
  /** Do que a pauta trata, para a hashtag sair do assunto e não do perfil. */
  contexto: Omit<ContextoDaLegenda, "fechamentoDaNewsletter">;
};

/**
 * Gera o roteiro do post conforme o formato. Cada um parte de uma origem
 * diferente: notícia da edição diária, tutorial de um artigo já revisado,
 * prompt dos assets já gerados da campanha.
 */
async function gerarCarrossel(
  format: CarouselFormat,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<CarrosselGerado> {
  if (format === "prompt") {
    const campaignId = String(meta.campaign_id ?? "").trim();
    if (!campaignId) throw new Error("Post de prompt sem campaign_id no content_json.");

    // Sem LLM: parte de dados que já existem (hook do conceito, aplicações e
    // as imagens geradas). Ver `carrossel-de-campanha.ts`.
    const { carousel, campanha } = await montarCarrosselDeCampanha(campaignId);
    // Zerado porque não houve chamada de modelo — o custo deste formato está
    // na geração das imagens (etapa 4), contabilizada lá.
    return {
      carousel,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      contexto: {
        titulo: carousel.title,
        resumo: carousel.caption.intro_summary,
        categoria: carousel.primary_topic,
        keyword: campanha.keyword,
      },
    };
  }

  if (format === "tutorial") {
    const slug = String(meta.article_slug ?? "").trim();
    if (!slug) throw new Error("Post de tutorial sem article_slug no content_json.");

    const article = await getArticleBySlug(slug);
    if (!article) throw new Error(`Artigo "${slug}" não encontrado.`);

    const input: TutorialArticleInput = {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      primaryTopic: article.category || "Claude Code",
      sections: article.content,
      keyword: String(meta.keyword ?? "TUTORIAL"),
    };
    const gerado = await generateTutorialCarouselPipeline(input, editionDate, env, fetcher);
    return {
      ...gerado,
      contexto: {
        titulo: article.title,
        resumo: article.excerpt,
        categoria: article.category ?? "",
        keyword: input.keyword,
      },
    };
  }

  const storyIndex = Number((meta.story_index as number) ?? 0);
  const edition = await loadEdition(project, editionDate);
  const story = edition.stories[storyIndex];
  if (!story) {
    throw new Error(
      `A edição de ${editionDate} tem ${edition.stories.length} pautas; a posição ${storyIndex} não existe.`,
    );
  }
  // A marca vem do projeto pelo mesmo motivo da redação: o sistema é
  // multi-projeto e o nome, o público e a keyword do CTA estavam escritos
  // dentro da constante do prompt.
  const keyword = String(project.settings?.instagram_keyword ?? "").trim() || "NEWS";

  /*
   * A assinatura da newsletter NÃO entra aqui.
   *
   * Ela entrava, como `assinatura`, e o prompt mandava encerrar a legenda com
   * ela: foi assim que "Até amanhã. Equipe imigra.us." apareceu embaixo do CTA
   * de um post. Newsletter tem uma despedida por dia; um perfil que publica
   * várias vezes por dia não tem nenhuma. O fechamento do e-mail agora só
   * aparece no `garantirLegendaSocial`, como texto a remover.
   */
  const gerado = await generateInstagramCarouselPipeline(edition, editionDate, env, fetcher, story, {
    nome: project.brand.displayName || project.name,
    nicho: project.niche,
    extra: project.editorialPromptExtra,
    keyword,
  });

  return {
    ...gerado,
    contexto: {
      titulo: story.title,
      resumo: `${story.summary} ${story.context ?? ""}`.trim(),
      categoria: story.category,
      keyword,
    },
  };
}

/**
 * O roteiro do post, com a legenda já auditada.
 *
 * Ponto único: os três formatos passam por aqui antes de a legenda ser gravada
 * em `social_posts` e antes de ir para a Meta. Era a falta desse ponto que
 * permitia a um formato sair com hashtag fixa e a outro sair sem nenhuma.
 */
async function generateCarouselForPost(
  format: CarouselFormat,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<{ carousel: InstagramCarouselContent; usage: AITokenUsage }> {
  const gerado = await gerarCarrossel(format, meta, project, editionDate, env, fetcher);

  const auditada = garantirLegendaSocial(gerado.carousel, {
    ...gerado.contexto,
    fechamentoDaNewsletter: String(project.settings?.final_line ?? "").trim(),
  });

  for (const problema of auditada.problemas) {
    console.warn(`[INSTAGRAM LEGENDA] ${problema.motivo}: ${problema.detalhe}`);
  }
  if (auditada.reparos.length > 0) {
    console.log(`[INSTAGRAM LEGENDA] Reparos aplicados: ${auditada.reparos.join(" ; ")}.`);
  }

  return { carousel: auditada.carousel, usage: gerado.usage };
}

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

/**
 * Publica o post, aguardando o container ficar pronto.
 *
 * Um slide vira post de imagem única; dois ou mais viram carrossel. A escolha
 * sai da quantidade de slides, não do formato: é a contagem que a API da Meta
 * exige que case com o tipo de container, e derivar dela evita um formato
 * novo publicar pelo caminho errado sem ninguém lembrar de atualizar aqui.
 */
async function montarContainer(
  imageUrls: string[],
  caption: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<string> {
  if (imageUrls.length === 0) {
    throw new Error("Nenhum slide foi renderizado — não há o que publicar.");
  }

  if (imageUrls.length === 1) {
    const unico = await createSingleImageContainer(imageUrls[0], caption, env, fetcher);
    if (!unico.ok || !unico.creationId) {
      throw new Error(`Falha ao criar o container de imagem única: ${unico.error}`);
    }
    return unico.creationId;
  }

  const containerIds: string[] = [];

  for (const [i, url] of imageUrls.entries()) {
    const item = await createCarouselItemContainer(url, env, fetcher);
    if (!item.ok || !item.creationId) {
      throw new Error(`Falha ao criar o container do slide ${i + 1}: ${item.error}`);
    }
    containerIds.push(item.creationId);
  }

  const pai = await createCarouselContainer(containerIds, caption, env, fetcher);
  if (!pai.ok || !pai.creationId) {
    throw new Error(`Falha ao criar o container de carrossel: ${pai.error}`);
  }
  return pai.creationId;
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
    .select("id, project_id, edition_date, status, content_json, caption, provider_post_id, provider_creation_id, publish_attempted_at")
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

    /*
     * Antes de gastar um centavo, perguntar se já foi.
     *
     * `status` não é prova de nada: se a Meta publicou e a gravação seguinte
     * falhou, a linha ficou em `generated` com o post no ar. Quem sabe a
     * verdade é o container, e é a ele que se pergunta. Nada abaixo desta
     * verificação roda para um post que já está publicado.
     */
    const jaTentado = await reconciliarTentativaAnterior(
      supabase,
      socialPostId,
      {
        providerPostId: (post.provider_post_id as string | null) ?? null,
        providerCreationId: (post.provider_creation_id as string | null) ?? null,
        publishAttemptedAt: (post.publish_attempted_at as string | null) ?? null,
        caption: (post.caption as string | null) ?? "",
      },
      env,
      fetcher,
    );

    if (jaTentado?.desfecho === "publicado") {
      console.log(
        `[INSTAGRAM WORKER] Post ${socialPostId} já estava publicado (mídia ${jaTentado.mediaId}). Nada refeito.`,
      );
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "published",
        providerPostId: jaTentado.mediaId,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (jaTentado?.desfecho === "revisar") {
      await markPostFailed(socialPostId, `PUBLICAÇÃO INCERTA: ${jaTentado.motivo}`);
      console.error(`[INSTAGRAM WORKER] ${socialPostId} precisa de revisão: ${jaTentado.motivo}`);
      return {
        ok: false,
        projectId,
        socialPostId,
        status: "needs_review",
        error: jaTentado.motivo,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const project = await requireActiveProject(projectId);
    const editionDate = post.edition_date as string;
    const meta = (post.content_json ?? {}) as Record<string, unknown>;
    const format: CarouselFormat = (meta.format as CarouselFormat) ?? "noticia";

    const pipelineResult = await generateCarouselForPost(format, meta, project, editionDate, env, fetcher);

    console.log(
      `[INSTAGRAM WORKER] ${project.slug} ${editionDate} formato ${format}: ${pipelineResult.carousel.title}`,
    );

    await gravarOuFalhar(
      supabase,
      socialPostId,
      {
        title: pipelineResult.carousel.title,
        caption: pipelineResult.carousel.caption.full_caption,
        // preserva os metadados de origem (format, story_index, article_slug, keyword…)
        content_json: { ...pipelineResult.carousel, ...meta },
        tokens_input: pipelineResult.usage.promptTokens,
        tokens_output: pipelineResult.usage.completionTokens,
        cost_estimate_usd: pipelineResult.usage.estimatedCostUsd,
        status: "generated",
      },
      "o roteiro gerado",
    );

    const slides = await renderAndUploadSlides(project, pipelineResult.carousel, editionDate, socialPostId);

    await gravarOuFalhar(
      supabase,
      socialPostId,
      { slides_manifest: slides, asset_paths: slides.map((s) => s.url) },
      "o manifesto dos slides",
    );

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

    // Token efetivo: o persistido em project_credentials (renovado pelo cron)
    // ou a env como semente. O meta-client lê env.INSTAGRAM_ACCESS_TOKEN.
    const igEnv = { ...env, INSTAGRAM_ACCESS_TOKEN: await resolveInstagramToken(projectId, env) };

    /*
     * Container primeiro, publicação depois, e o registro no meio.
     *
     * Montar o container não publica nada: é a etapa reversível. A partir de
     * `publicarComRegistro` tudo é irreversível, e é por isso que o
     * `creation_id` é gravado antes da chamada, não depois.
     */
    const creationId = await montarContainer(
      slides.map((s) => s.url),
      pipelineResult.carousel.caption.full_caption,
      igEnv,
      fetcher,
    );

    const publicacao = await publicarComRegistro(supabase, socialPostId, creationId, igEnv, fetcher);

    if (publicacao.desfecho === "revisar") {
      await markPostFailed(socialPostId, `PUBLICAÇÃO INCERTA: ${publicacao.motivo}`);
      console.error(`[INSTAGRAM WORKER] ${socialPostId} precisa de revisão: ${publicacao.motivo}`);
      return {
        ok: false,
        projectId,
        socialPostId,
        status: "needs_review",
        error: publicacao.motivo,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const mediaId = publicacao.mediaId;
    console.log(`[INSTAGRAM WORKER] Publicado com sucesso. Media ID: ${mediaId}`);

    // Post de campanha do Sistema PROMPT: é aqui, e só aqui, que o
    // `ig_media_id` existe sem ninguém ter que procurá-lo no Instagram. A
    // automação do OpenReply é criada agora, com a copy do Direct preenchida
    // por padrão — o painel deixa de exigir os dois à mão.
    const campaignId = String((post.content_json as Record<string, unknown> | null)?.campaign_id ?? "").trim();
    if (campaignId) {
      const r = await concluirCampanhaPublicada(campaignId, mediaId, projectId);
      console.log(
        `[INSTAGRAM WORKER] Campanha ${campaignId}: automação ${r.automacaoCriada ? "criada" : "não criada"}` +
          (r.erro ? ` (${r.erro})` : ""),
      );
    } else {
      /*
       * Post que não vem de campanha, que é o caso de toda notícia.
       *
       * O funil permanente do projeto entra aqui: a mesma keyword em toda
       * publicação, levando ao mesmo destino. Sem isto o CTA do post pede um
       * comentário que não dispara nada.
       */
      const f = await garantirFunilPermanente(projectId);
      console.log(
        f.ligado
          ? `[INSTAGRAM WORKER] Funil "${f.keyword}" ativo (automação ${f.automationId}` +
              `${f.criadaAgora ? ", criada agora" : ""}).`
          : `[INSTAGRAM WORKER] Funil permanente indisponível: ${f.motivo}`,
      );
    }

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
    await sendAlert("critical", "Post do Instagram falhou", `Post ${socialPostId}\n${formatError(err)}`);

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
