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
import { ehSocialV2, lerCargaV2, MOTIVO_CARGA_INCOMPLETA, type LinhaDePost } from "./carga-v2";
import { prepararArteV2 } from "./worker-v2";
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

type SlideSubido = { index: number; url: string; filename: string };

/**
 * Registra "publicação incerta" e ESCALA se nem isso puder ser registrado.
 *
 * Este é o pior estado do sistema: a Meta pode ter publicado, e daqui não se
 * sabe. A linha marcada como `failed` com o motivo é o que impede o próximo
 * giro de tentar de novo e possivelmente duplicar o post.
 *
 * Se a gravação desse registro falhar, a linha continua `scheduled`,
 * `findDuePosts` a pega no giro seguinte, e o risco de post duplicado volta.
 * Não há nada no código que resolva isso sozinho: o que existe é avisar
 * alguém, com o id do container na mão, enquanto ainda dá para reconciliar.
 */
async function registrarRevisao(
  socialPostId: string,
  motivo: string,
  creationId?: string | null,
): Promise<void> {
  const r = await markPostFailed(socialPostId, `PUBLICAÇÃO INCERTA: ${motivo}`);
  console.error(`[INSTAGRAM WORKER] ${socialPostId} precisa de revisão: ${motivo}`);

  if (!r.gravado) {
    await sendAlert(
      "critical",
      "Publicação incerta que NÃO consegui registrar",
      `Post ${socialPostId} teve desfecho incerto e a marcação falhou: ${r.erro}.\n` +
        `A linha continua elegível para o worker, então há risco de post duplicado.\n` +
        `Motivo original: ${motivo}` +
        (creationId ? `\nContainer: ${creationId}` : ""),
    );
  }
}

/**
 * O que os dois ramos entregam à parte irreversível.
 *
 * `carousel` só existe no legado: é o roteiro que ele acabou de gerar, e o
 * resultado da execução o devolve para quem chamou. O V2 não tem roteiro novo
 * para devolver, e inventar um vazio só para preencher o campo faria o
 * chamador achar que houve geração.
 */
type PreparoDaPublicacao = {
  legenda: string;
  slides: SlideSubido[];
  carousel?: InstagramCarouselContent;
};

/**
 * Caminho legado, sem uma vírgula de diferença.
 *
 * Este bloco saiu de dentro de `processScheduledPost` inteiro e na mesma
 * ordem: gera o roteiro, grava título/legenda/content_json e marca
 * `generated`, renderiza pelo renderizador antigo, grava o manifesto. O motivo
 * de virar função é ter um irmão do outro lado do `if`, não melhorar nada
 * aqui — post legado tem que continuar publicando exatamente como publicava.
 */
async function prepararLegado(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  socialPostId: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<PreparoDaPublicacao> {
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

  return {
    legenda: pipelineResult.carousel.caption.full_caption,
    slides,
    carousel: pipelineResult.carousel,
  };
}

/**
 * Caminho social-v2: ler, conferir, materializar.
 *
 * Nenhuma chamada a modelo de linguagem, nenhuma escrita em `title`,
 * `caption` ou nas chaves editoriais de `content_json`. O que o worker grava é
 * só o rastro da própria execução — onde a arte foi parar.
 *
 * Carga incompleta não é tratada como erro técnico: é decisão de não publicar.
 * Ela sobe com o código `SOCIAL_V2_PAYLOAD_INCOMPLETE` e a lista do que
 * faltou, para o `catch` de fora gravar em `error_message` e o post ficar
 * parado até alguém olhar. Consertar aqui significaria gerar.
 */
async function prepararV2(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  linha: LinhaDePost,
  project: Project,
  editionDate: string,
  socialPostId: string,
  fetcher: typeof fetch,
): Promise<PreparoDaPublicacao> {
  const leitura = lerCargaV2(linha);

  if (!leitura.ok) {
    console.error(`[INSTAGRAM WORKER V2] ${socialPostId} bloqueado: ${leitura.motivo}`);
    throw new Error(leitura.motivo);
  }

  const { carga } = leitura;

  /*
   * Marca de posse ANTES de renderizar, e o valor é o que o CHECK já aceita.
   *
   * `findDuePosts` seleciona por `status = scheduled`. Renderizar primeiro e
   * gravar depois deixava a linha elegível durante o Chromium inteiro, e dois
   * giros concorrentes desenhariam e publicariam o mesmo post duas vezes. O
   * caminho legado nunca teve essa janela porque grava `generated` antes de
   * renderizar; aqui era pior justamente por gravar menos.
   *
   * O status é `generated` e não um `processing` novo: o CHECK da tabela aceita
   * ('draft','generated','approved','scheduled','published','failed'), e
   * inventar valor fora disso exigiria migration. No legado `generated`
   * significa "o worker pegou e produziu o artefato", que é exatamente o que
   * acontece na linha seguinte. Vocabulário compartilhado vale mais que
   * vocabulário preciso quando o preço da precisão é uma migration.
   */
  await gravarOuFalhar(supabase, socialPostId, { status: "generated" }, "a posse da vaga");

  console.log(
    `[INSTAGRAM WORKER V2] ${project.slug} ${editionDate}: "${carga.headline.slice(0, 60)}" ` +
      `(${carga.foto ? "com foto" : `capa de texto, ${carga.motivoSemFoto}`}, origem ${carga.originChannel})`,
  );

  const arte = await prepararArteV2(carga, {
    projectSlug: project.slug,
    editionDate,
    socialPostId,
    fetcher,
  });

  const slides: SlideSubido[] = arte.urls.map((url, i) => ({
    index: i,
    url,
    filename: `social-v2-${i + 1}.png`,
  }));

  /*
   * A única gravação deste ramo antes da publicação, e ela não toca em nada
   * aprovado: só registra onde o PNG foi parar e que a arte já existe. O
   * status NÃO muda aqui — `generated` é do vocabulário do legado, onde ele
   * significa "o roteiro acabou de ser escrito". Aqui não se escreveu nada.
   */
  await gravarOuFalhar(
    supabase,
    socialPostId,
    { slides_manifest: slides, asset_paths: slides.map((s) => s.url) },
    "o manifesto da arte V2",
  );

  return { legenda: carga.legenda, slides };
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
    /*
     * As colunas do V2 entram aqui, e o VALOR delas não muda o caminho legado:
     * numa linha antiga voltam nulas, `ehSocialV2` diz não, o fluxo segue.
     *
     * A EXISTÊNCIA delas, porém, é compartilhada. PostgREST recusa a consulta
     * inteira com 42703 se uma única coluna do select não existir no schema, e
     * isso derrubaria todo post, legado incluído. Conferido contra o banco de
     * produção: as 17 estão lá. É por isso que a falha abaixo virou alerta em
     * vez de exceção muda — a próxima coluna que alguém acrescentar aqui não
     * pode falhar em silêncio.
     */
    // Uma linha só, e literal: o cliente tipado do Supabase infere as colunas
    // lendo esta string em tempo de compilação, e concatená-la apaga os tipos.
    .select("id, project_id, edition_date, status, content_json, title, caption, provider_post_id, provider_creation_id, publish_attempted_at, generation_version, dry_run, story_id, event_fingerprint, visual_asset_id, origin_channel, social_guard_status")
    .eq("id", socialPostId)
    .maybeSingle();

  /*
   * Falha de leitura não é o mesmo que post inexistente, e as duas ficavam com
   * a mesma frase.
   *
   * Este `throw` acontece ANTES do `try` que trata o resto do fluxo, então ele
   * não passa por `markPostFailed` nem por `sendAlert`: a linha continua
   * `scheduled`, elegível no giro seguinte, sem rastro. Para um post que não
   * existe isso é correto e inofensivo. Para um erro de schema ou de conexão
   * seria um laço silencioso a cada giro, e é o tipo de coisa que se descobre
   * pelo Instagram vazio.
   */
  if (postErr) {
    const motivo = `Não consegui ler o post ${socialPostId}: ${postErr.message}`;
    console.error(`[INSTAGRAM WORKER] ${motivo}`);
    await sendAlert("critical", "Worker do Instagram não conseguiu ler a vaga", motivo);
    throw new Error(motivo);
  }

  if (!post) {
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
      await registrarRevisao(socialPostId, jaTentado.motivo, post.provider_creation_id ?? undefined);
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

    /*
     * A bifurcação, e por que ela mora exatamente aqui.
     *
     * Acima desta linha está o que vale para os dois ramos: achar a linha,
     * desistir se já publicou, e reconciliar uma tentativa anterior — a
     * pergunta "isto já foi ao ar?" não depende de quem gerou o post.
     *
     * Abaixo dela está a única diferença real: o legado PRODUZ o post, este
     * ramo o MATERIALIZA. Da montagem do container para baixo os dois voltam a
     * ser o mesmo código, porque a parte irreversível não deve ter duas
     * implementações se envelhecendo em paralelo.
     */
    const ehV2 = ehSocialV2(post as LinhaDePost);
    const preparo = ehV2
      ? await prepararV2(supabase, post as LinhaDePost, project, editionDate, socialPostId, fetcher)
      : await prepararLegado(supabase, meta, project, editionDate, socialPostId, env, fetcher);

    const slides = preparo.slides;

    const autoPost = options.autoPost ?? env.INSTAGRAM_AUTO_POST !== "false";

    if (!autoPost) {
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "generated",
        ...(preparo.carousel ? { carousel: preparo.carousel } : {}),
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
      preparo.legenda,
      igEnv,
      fetcher,
    );

    const publicacao = await publicarComRegistro(supabase, socialPostId, creationId, igEnv, fetcher);

    if (publicacao.desfecho === "revisar") {
      await registrarRevisao(socialPostId, publicacao.motivo, publicacao.creationId);
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
      ...(preparo.carousel ? { carousel: preparo.carousel } : {}),
      slideUrls: slides.map((s) => s.url),
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    // O motivo fica gravado: as colunas error_message existiam e nunca eram
    // preenchidas, então uma falha só era descoberta olhando o Instagram.
    const message = err instanceof Error ? err.message : String(err);
    await markPostFailed(socialPostId, message);
    console.error(`[INSTAGRAM WORKER] Post ${socialPostId} falhou: ${message}`);

    /*
     * Carga V2 incompleta não é o sistema quebrando, é o sistema se recusando.
     *
     * Chamar isso de crítico junto com "a Meta caiu" e "o Chromium morreu"
     * ensina a ignorar o canal de alerta, que é como um alerta crítico morre
     * de verdade. O post fica parado, o código está no `error_message`, e o
     * aviso diz que é decisão e não incêndio.
     */
    const cargaIncompleta = message.startsWith(MOTIVO_CARGA_INCOMPLETA);
    await sendAlert(
      cargaIncompleta ? "warning" : "critical",
      cargaIncompleta ? "Post social-v2 bloqueado por carga incompleta" : "Post do Instagram falhou",
      `Post ${socialPostId}\n${cargaIncompleta ? message : formatError(err)}`,
    );

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
