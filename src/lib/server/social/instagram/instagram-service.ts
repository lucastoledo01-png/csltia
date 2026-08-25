import { getSupabaseAdminClient } from "../../supabase-admin";
import { EditionContent } from "../../newsroom/schemas";
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

  const dryRun = options.dryRun ?? (env.INSTAGRAM_DRY_RUN === "false" ? false : true);
  const autoPost = options.autoPost ?? (env.INSTAGRAM_AUTO_POST === "true" ? true : false);

  console.log(`[INSTAGRAM SERVICE] Iniciando pipeline de carrossel (dryRun: ${dryRun}, autoPost: ${autoPost}, key: ${idempotencyKey})...`);

  // 1. Verificar Idempotência no Supabase
  try {
    const supabase = getSupabaseAdminClient();
    const { data: existingPost } = await supabase
      .from("social_posts")
      .select("id, status, title, content_json, caption")
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
        carousel: existingPost.content_json as InstagramCarouselContent,
        status: existingPost.status,
        executionTimeMs: Date.now() - startTime,
      };
    }
  } catch {
    // Continua para nova geração
  }

  // 2. Buscar Conteúdo da Edição Diária se não fornecido diretamente
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

  // Se mesmo assim não houver edição, usar estrutura de demonstração rica baseada na newsletter Desbuguei
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
        {
          rank: 4,
          category: "Ferramentas",
          title: "Gerador de imagens por IA ganha controle fino de tipografia e textos",
          summary: "Novas atualizações corrigem o antigo problema de letras borradas em banners e peças publicitárias.",
          context: "Designers e profissionais de marketing agora criam peças publicitárias prontas sem arte-final pesada.",
          why_it_matters: "Permite criar anúncios de alta conversão sem precisar de software de edição complexo.",
          practical_impact: "Gere imagens com títulos nítidos para stories e anúncios de feed em menos de 1 minuto.",
          humor_line: "O texto borrado por IA oficialmente virou coisa do passado.",
          source_name: "AI Trends",
          source_url: "https://aitrends.com",
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

  // 3. Transformar Edição em Roteiro de Carrossel + Caption via OpenAI
  console.log(`[INSTAGRAM SERVICE] Gerando roteiro de carrossel via OpenAI...`);
  const pipelineResult = await generateInstagramCarouselPipeline(edition, todayStr, env, fetcher);

  // 4. Montar o Manifest dos Slides
  const slidesManifest = pipelineResult.carousel.slides.map((s) => ({
    index: s.index,
    type: s.type,
    eyebrow: s.eyebrow,
    title: s.title,
    body: s.body,
    bullet_points: s.bullet_points || [],
    practical_tip: s.type === "practical_impact" ? s.body : undefined,
    cover_image_prompt: s.cover_image_prompt,
    cta_text: s.cta_text,
  }));

  const initialStatus = dryRun ? "draft" : "generated";
  let socialPostId: string | undefined;

  // 5. Salvar Registro no Supabase (`social_posts`)
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
        status: initialStatus,
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
      console.log(`[INSTAGRAM SERVICE] Carrossel salvo com sucesso no banco de dados com ID: ${socialPostId}`);
    } else if (dbError) {
      console.warn(`[INSTAGRAM SERVICE] Erro ao gravar social_post no Supabase (não-bloqueante):`, dbError.message);
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
    carousel: pipelineResult.carousel,
    status: initialStatus,
    executionTimeMs,
    tokens: pipelineResult.usage,
  };
}
