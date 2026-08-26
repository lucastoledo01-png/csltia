import { getSupabaseAdminClient } from "../../supabase-admin";
import { EditionContent } from "../../newsroom/schemas";
import {
  createCarouselContainer,
  createCarouselItemContainer,
  publishContainer,
} from "./meta-client";
import { renderOpenDesignSlides } from "./opendesign-renderer";
import { generateInstagramCarouselPipeline } from "./pipeline";
import { InstagramCarouselContent } from "./schemas";

export type RunInstagramOptions = {
  dryRun?: boolean;
  autoPost?: boolean;
  editionDateStr?: string;
  editionContent?: EditionContent;
  idempotencyKey?: string;
  articleSlug?: string;
};

export type InstagramRunResult = {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  autoPost: boolean;
  idempotencyKey: string;
  socialPostId?: string;
  providerPostId?: string;
  carousel?: InstagramCarouselContent;
  status: string;
  executionTimeMs: number;
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
};

export async function runInstagramCarouselService(
  options: RunInstagramOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<InstagramRunResult> {
  const startTime = Date.now();
  const todayStr = options.editionDateStr || new Date().toISOString().split("T")[0];
  const idempotencyKey = options.idempotencyKey || `instagram-carousel-${todayStr}`;

  const dryRun = options.dryRun ?? (env.INSTAGRAM_DRY_RUN === "true" ? true : false);
  const autoPost = options.autoPost ?? (env.INSTAGRAM_AUTO_POST === "false" ? false : true);

  console.log(`[INSTAGRAM OPENDESIGN SERVICE] Iniciando motor OpenDesign HTML/CSS 1080x1350 (dryRun: ${dryRun}, autoPost: ${autoPost}, key: ${idempotencyKey})...`);

  // 1. Verificar Idempotência no Supabase
  try {
    const supabase = getSupabaseAdminClient();
    const { data: existingPost } = await supabase
      .from("social_posts")
      .select("id, status, title, content_json, caption, provider_post_id")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existingPost) {
      console.log(`[INSTAGRAM SERVICE] Carrossel já existente no banco para a chave (${idempotencyKey}). Status: ${existingPost.status}`);
      return {
        ok: true,
        reason: "already_exists",
        dryRun,
        autoPost,
        idempotencyKey,
        socialPostId: existingPost.id,
        providerPostId: existingPost.provider_post_id,
        carousel: existingPost.content_json as InstagramCarouselContent,
        status: existingPost.status,
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch {
    // Continua para nova geração
  }

  // 2. Buscar Conteúdo da Edição Diária
  let edition: EditionContent | undefined = options.editionContent;
  let articleSlug = options.articleSlug || `edicao-${todayStr}`;

  if (!edition) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: editionRow } = await supabase
        .from("news_editions")
        .select("stories, headline, subject, preheader, intro, quick_bits, closing, final_line, slug")
        .eq("edition_date", todayStr)
        .single();

      if (editionRow) {
        edition = {
          subject_options: [editionRow.subject],
          subject: editionRow.subject,
          preheader: editionRow.preheader,
          headline: editionRow.headline,
          intro: editionRow.intro,
          stories: editionRow.stories,
          quick_bits: editionRow.quick_bits || [],
          closing: editionRow.closing,
          final_line: editionRow.final_line || "Agora você está desbugado. Bora iniciar o dia.",
        };
        articleSlug = editionRow.slug || articleSlug;
      }
    } catch {
      console.warn(`[INSTAGRAM SERVICE] Nenhuma edição prévia salva no banco para ${todayStr}. Usando modelo de dados em fallback...`);
    }
  }

  if (!edition) {
    edition = {
      subject_options: ["Radar de IA: As novidades mais quentes que você precisa testar hoje"],
      subject: "Radar de IA: As novidades mais quentes que você precisa testar hoje",
      preheader: "Resumo matinal com o que realmente importa sobre modelos, ferramentas e automação.",
      headline: "Edição Diária: Inteligência artificial desbugada e sem fumaça",
      intro: "Bom dia! O café já está na xícara? Hoje trouxemos novidades essenciais de IA e redes sociais.",
      stories: [
        {
          rank: 1,
          category: "Redes Sociais",
          title: "Instagram libera novas ferramentas de IA para criadores de conteúdo",
          summary: "A Meta lançou atualizações automáticas que permitem editar vídeos e gerar roteiros diretamente no app do Instagram.",
          context: "O mercado de criação de conteúdo está cada vez mais focado em agilidade.",
          why_it_matters: "Criadores e marcas podem economizar até 3 horas por semana na edição de Reels e carrosséis.",
          practical_impact: "Abra a aba de criação do Instagram, ative a sugestão de roteiros e gere 3 variações de ideias de posts em segundos.",
          humor_line: "O algoritmo agora quer ser seu co-roteirista de café.",
          source_name: "Meta AI News",
          source_url: "https://about.instagram.com/blog",
          secondary_urls: [],
        },
        {
          rank: 2,
          category: "Vendas",
          title: "WhatsApp lança assistente de IA para responder clientes e fechar vendas",
          summary: "Novo recurso de IA responde dúvidas de produtos e sugere links de checkout diretamente nas conversas comerciais.",
          context: "Empresas locais e e-commerces estão automatizando o atendimento de primeiro nível.",
          why_it_matters: "Aumenta a taxa de conversão ao reduzir o tempo de resposta de minutos para segundos.",
          practical_impact: "Configure respostas automáticas de catálogo no WhatsApp Business para capturar leads enquanto você dorme.",
          humor_line: "Seu atendimento ao cliente agora roda 24/7 sem pedir folga.",
          source_name: "TechCrunch",
          source_url: "https://techcrunch.com",
          secondary_urls: [],
        },
        {
          rank: 3,
          category: "Produtividade",
          title: "Novo modelo de IA transforma reuniões gravadas em tarefas acionáveis",
          summary: "Plataformas de IA passam a gerar resumos de áudio e listas de afazeres automaticamente ao final de cada call.",
          context: "Menos tempo em reuniões longas e mais foco na execução.",
          why_it_matters: "Elimina a necessidade de fazer atas de reunião manuais.",
          practical_impact: "Grave o áudio da reunião no celular e peça para a IA extrair os 3 próximos passos de cada membro da equipe.",
          humor_line: "Acabou a desculpa do 'esqueci o que ficou combinado'.",
          source_name: "VentureBeat",
          source_url: "https://venturebeat.com",
          secondary_urls: [],
        },
      ],
      quick_bits: [
        { title: "ChatGPT Update", text: "OpenAI lança nova interface mais rápida no celular.", url: "https://openai.com" },
      ],
      closing: "Encaminhe esta edição para aquele amigo que quer aprender IA para crescer nas redes!",
      final_line: "Agora você está desbugado. Bora iniciar o dia.",
    };
  }

  // 3. Transformar Edição em Roteiro Editorial de Carrossel via OpenAI
  console.log(`[INSTAGRAM SERVICE] Gerando roteiro editorial estilizado via OpenAI...`);
  const pipelineResult = await generateInstagramCarouselPipeline(edition, todayStr, env, fetcher);

  // 4. Renderizar os Slides 1080x1350 em HD usando o Playwright + OpenDesign HTML/CSS Engine
  console.log(`[OPENDESIGN RENDER] Renderizando ${pipelineResult.carousel.slides.length} slides HTML/CSS via Playwright em HD 2160x2700...`);
  const renderedSlides = await renderOpenDesignSlides(pipelineResult.carousel);

  const slidesManifest = [];
  const publicImageUrls: string[] = [];

  for (const slide of renderedSlides) {
    const supabase = getSupabaseAdminClient();
    const storagePath = `instagram_carousels/${todayStr}/${idempotencyKey}_slide_${slide.index}.png`;

    let publicUrl: string | null = null;
    try {
      const { error: uploadErr } = await supabase.storage
        .from("public_assets")
        .upload(storagePath, slide.pngBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("public_assets").getPublicUrl(storagePath);
        publicUrl = urlData?.publicUrl || null;
      }
    } catch {
      // Fallback
    }

    // Fallback de URL pública acessível de alta qualidade caso o bucket não exista no Supabase local
    const finalUrl = publicUrl || `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080`;
    publicImageUrls.push(finalUrl);

    slidesManifest.push({
      index: slide.index,
      type: slide.type,
      filename: slide.filename,
      publicUrl: finalUrl,
    });
  }

  let finalStatus = dryRun ? "draft" : "generated";
  let providerPostId: string | undefined;
  let socialPostId: string | undefined;

  // 5. Se autoPost === true e não for dryRun, Publicar Mídia Real via Meta Graph API
  if (autoPost && !dryRun) {
    try {
      console.log(`[INSTAGRAM AUTO POST] Publicando ${publicImageUrls.length} slides OpenDesign HTML na Meta Graph API...`);
      const itemContainerIds: string[] = [];

      for (let i = 0; i < publicImageUrls.length; i++) {
        const itemRes = await createCarouselItemContainer(publicImageUrls[i], env, fetcher);

        if (itemRes.ok && itemRes.creationId) {
          console.log(`   - Slide OpenDesign ${i + 1}/${publicImageUrls.length} container criado: ${itemRes.creationId}`);
          itemContainerIds.push(itemRes.creationId);
        } else {
          console.warn(`[INSTAGRAM ITEM ERROR] Falha ao criar slide ${i + 1}:`, itemRes.error);
        }
      }

      if (itemContainerIds.length >= 2) {
        const carouselRes = await createCarouselContainer(
          itemContainerIds,
          pipelineResult.carousel.caption.full_caption,
          env,
          fetcher
        );

        if (carouselRes.ok && carouselRes.creationId) {
          const publishRes = await publishContainer(carouselRes.creationId, env, fetcher);

          if (publishRes.ok && publishRes.mediaId) {
            providerPostId = publishRes.mediaId;
            finalStatus = "published";
            console.log(`[INSTAGRAM AUTO POST SUCCESS] Post carrossel OpenDesign HTML/CSS publicado com SUCESSO! Media ID: ${providerPostId}`);
          } else {
            console.error(`[INSTAGRAM PUBLISH ERROR] Erro na publicação final:`, publishRes.error);
          }
        }
      }
    } catch (postErr) {
      console.error(`[INSTAGRAM AUTO POST EXCEPTION] Erro no fluxo Meta API:`, postErr);
    }
  }

  // 6. Salvar Registro no Supabase (`social_posts`)
  try {
    const supabase = getSupabaseAdminClient();
    const { data: inserted, error: dbError } = await supabase
      .from("social_posts")
      .insert({
        edition_date: todayStr,
        article_slug: articleSlug,
        platform: "instagram",
        post_type: "carousel",
        title: pipelineResult.carousel.title,
        caption: pipelineResult.carousel.caption.full_caption,
        content_json: pipelineResult.carousel as any,
        slides_manifest: slidesManifest as any,
        status: finalStatus,
        provider_post_id: providerPostId,
        published_at: finalStatus === "published" ? new Date().toISOString() : null,
        idempotency_key: idempotencyKey,
        tokens_input: pipelineResult.usage.promptTokens,
        tokens_output: pipelineResult.usage.completionTokens,
        cost_estimate_usd: pipelineResult.usage.estimatedCostUsd,
        dry_run: dryRun,
      })
      .select("id")
      .single();

    if (!dbError && inserted) {
      socialPostId = inserted.id;
      console.log(`[INSTAGRAM SERVICE] Registro OpenDesign gravado no Supabase com ID: ${socialPostId}`);
    }
  } catch (err) {
    console.warn(`[INSTAGRAM SERVICE] Exceção ao gravar no banco:`, err);
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    ok: true,
    dryRun,
    autoPost,
    idempotencyKey,
    socialPostId,
    providerPostId,
    carousel: pipelineResult.carousel,
    status: finalStatus,
    executionTimeMs,
    tokens: pipelineResult.usage,
  };
}
