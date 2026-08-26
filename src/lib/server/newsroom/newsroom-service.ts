import { createListmonkClient } from "../listmonk";
import { runInstagramCarouselService } from "../social/instagram/instagram-service";
import { getSupabaseAdminClient } from "../supabase-admin";
import { collectAllNews } from "./collector";
import { deduplicateCandidates } from "./deduplicator";
import { defaultNewsSources } from "./news-sources";
import { runNewsroomPipeline } from "./pipeline";
import { rankAndFilterCandidates } from "./ranker";
import { EditionContent } from "./schemas";

export type RunNewsroomOptions = {
  dryRun?: boolean;
  timeWindowHours?: number;
  idempotencyKey?: string;
  publishToPortal?: boolean;
  createNewsletterCampaign?: boolean;
  autoSend?: boolean;
};

const fallbackImages = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1200&q=80",
];

export function renderEditionToHtml(edition: EditionContent, coverImages: string[] = []): string {
  const todayStr = new Date().toISOString().split("T")[0];

  const now = new Date();
  const dateFormatted = now
    .toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();

  const tocHtml = edition.stories
    .map((s) => {
      const emojiMap: Record<string, string> = {
        "Redes Sociais": "📲",
        Vendas: "💼",
        Produtividade: "💡",
        Ferramentas: "🤖",
        Tendências: "🚀",
      };
      const emoji = emojiMap[s.category] || "⚡";
      return `<div style="margin-bottom: 6px; font-size: 13px; color: #374151;">
        <span style="font-weight: 700; color: #111827;">${emoji} ${s.category.toUpperCase()}:</span> ${s.title}
      </div>`;
    })
    .join("");

  const storiesHtml = edition.stories
    .map((s, index) => {
      const whatsappText = encodeURIComponent(
        `Olha essa novidade de IA sobre ${s.title}: \n\n"${s.summary.slice(0, 150)}..." \n\nVeja a edição completa na desbuguei.ia: https://desbuguei.ia/artigos/edicao-${todayStr}`
      );
      const whatsappShareUrl = `https://api.whatsapp.com/send?text=${whatsappText}`;

      const sourceCreditName = s.source_name || "Fonte Original";
      const summaryWithInlineLink = s.summary.replace(
        /(notícia|estudo|pesquisa|anúncio|ferramenta|plataforma|novo modelo|atualização)/i,
        `<a href="${s.source_url}" target="_blank" style="color: #374151; font-weight: 600; text-decoration: underline;">$1</a>`
      );

      const storyImage = coverImages[index] || fallbackImages[index % fallbackImages.length];

      return `
      <section style="margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
        <!-- Tag de Categoria Estilo The News -->
        <div style="margin-bottom: 6px;">
          <span style="display: inline-block; color: #d97706; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">
            ${s.category}
          </span>
        </div>

        <!-- Título da Pauta -->
        <h2 style="font-size: 24px; font-weight: 900; color: #111827; margin: 4px 0 16px 0; line-height: 1.25;">
          ${s.title}
        </h2>

        <!-- Imagem da Notícia com atributos de tag inline anti-download -->
        <div style="margin-bottom: 8px; border-radius: 12px; overflow: hidden; background-color: #f3f4f6;">
          <img src="${storyImage}" alt="${s.title}" border="0" loading="eager" decoding="async" style="display: block; width: 100%; height: auto; max-height: 340px; object-fit: cover; border-radius: 12px; margin: 0 auto;" />
        </div>
        <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-bottom: 18px;">
          (Imagem: ${sourceCreditName} | Reprodução)
        </div>

        <!-- Conteúdo Completo com Link da Fonte Embutido no Texto -->
        <div style="font-size: 15px; line-height: 1.7; color: #374151; margin-bottom: 16px;">
          ${summaryWithInlineLink.includes("href=") ? summaryWithInlineLink : `${summaryWithInlineLink} (<a href="${s.source_url}" target="_blank" style="color: #374151; text-decoration: underline;">fonte original: ${sourceCreditName}</a>)`}
        </div>

        <!-- Caixa Amarela Prática estilo The News -->
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 18px 0;">
          <p style="font-size: 14px; font-weight: 800; color: #92400e; margin: 0 0 6px 0;">
            💡 Como aplicar isso no seu perfil ou vendas:
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #1f2937; margin: 0;">
            ${s.practical_impact}
          </p>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 12px;">
          <strong>Por que olhar de perto:</strong> ${s.why_it_matters}
        </p>

        ${
          s.humor_line
            ? `<p style="font-size: 13px; font-style: italic; color: #6b7280; margin: 8px 0 16px 0;">
                💬 "${s.humor_line}"
               </p>`
            : ""
        }

        <!-- Link Verde de Compartilhamento pelo WhatsApp ao Final de CADA Notícia -->
        <div style="text-align: right; margin-top: 18px;">
          <a href="${whatsappShareUrl}" target="_blank" style="color: #15803d; font-size: 13px; font-weight: 800; text-decoration: underline;">
            Compartilhe essa notícia pelo WhatsApp
          </a>
        </div>
      </section>
    `;
    })
    .join("");

  const quickBitsHtml =
    edition.quick_bits && edition.quick_bits.length > 0
      ? `
      <section style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 20px; margin: 32px 0;">
        <h3 style="font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin: 0 0 14px 0;">
          ⚡ Giro Rápido & Outras Sacadas
        </h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #374151; line-height: 1.65;">
          ${edition.quick_bits.map((b) => `<li style="margin-bottom: 10px;"><strong>${b.title}:</strong> ${b.text}</li>`).join("")}
        </ul>
      </section>
    `
      : "";

  return `
    <div style="max-width: 640px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background-color: #ffffff; padding: 20px;">
      
      <!-- Cabeçalho Estilo The News -->
      <header style="text-align: center; border-bottom: 3px solid #ff4a1c; padding-bottom: 18px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 800; color: #6b7280; letter-spacing: 0.1em; margin-bottom: 8px;">
          ${dateFormatted}
        </div>
        <div style="display: inline-block; background-color: #ff4a1c; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 18px; padding: 6px 16px; border-radius: 8px; margin-bottom: 12px; letter-spacing: 0.05em;">
          b. / desbuguei.ia
        </div>
        <h1 style="font-size: 26px; font-weight: 900; margin: 10px 0 6px 0; color: #111827; line-height: 1.25;">
          ${edition.headline}
        </h1>
        <p style="font-size: 14px; color: #4b5563; margin: 0; font-weight: 500;">
          ${edition.preheader}
        </p>
      </header>

      <!-- Saudação & Abertura -->
      <div style="font-size: 16px; line-height: 1.65; color: #1f2937; margin-bottom: 24px; background-color: #fafafa; padding: 16px 18px; border-radius: 12px; border: 1px solid #f3f4f6;">
        <p style="margin: 0 0 10px 0; font-weight: 800; color: #ff4a1c; text-transform: uppercase; font-size: 13px; letter-spacing: 0.08em;">
          ☕ Bom dia!
        </p>
        ${edition.intro}
      </div>

      <!-- Resumo Rápido (TOC) -->
      <div style="background-color: #f3f4f6; border-radius: 12px; padding: 14px 18px; margin-bottom: 32px;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.1em; margin-bottom: 8px;">
          Nesta edição:
        </div>
        ${tocHtml}
      </div>

      <!-- Histórias Principais com Imagem em CADA bloco -->
      ${storiesHtml}

      <!-- Giro Rápido -->
      ${quickBitsHtml}

      <!-- Caixa de Recomendação -->
      <div style="background-color: #fff0c2; border-radius: 12px; padding: 18px; margin: 32px 0; border: 1px solid #fde047; text-align: center;">
        <p style="font-size: 15px; font-weight: 800; color: #854d0e; margin: 0 0 6px 0;">
          🤝 Curtiu a edição de hoje?
        </p>
        <p style="font-size: 13px; color: #713f12; margin: 0; line-height: 1.5;">
          Encaminhe esse e-mail para um amigo que quer aprender IA para crescer nas redes sociais ou vender mais!
        </p>
      </div>

      <!-- Rodapé QUEM SOMOS Formatado Idêntico ao The News -->
      <footer style="margin-top: 40px; padding-top: 24px; border-top: 2px solid #e5e7eb;">
        
        <div style="text-align: left; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; margin-bottom: 28px;">
          <div style="font-size: 11px; font-weight: 900; color: #d97706; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
            QUEM SOMOS
          </div>
          <h3 style="font-size: 26px; font-weight: 900; color: #111827; margin: 0 0 14px 0; letter-spacing: -0.02em;">
            desbuguei.ia
          </h3>
          <p style="font-size: 14px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
            Mais inteligente em 5 minutos. Somos um jornal gratuito e diário, que tem por objetivo te trazer tudo o que você precisa saber para começar o seu dia bem e informado sobre Inteligência Artificial, redes sociais, vendas e produtividade.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
            Notícias, de fato, relevantes sobre as principais atualidades de IA no mundo e no Brasil, sempre simplificadas para o seu perfil e para o seu negócio.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #374151; margin-bottom: 16px;">
            Direto na sua caixa de entrada do e-mail favorito, sempre às 06:03 AM. É gratuito, mas pode viciar.
          </p>
          <p style="font-size: 18px; font-weight: 900; color: #111827; margin: 0;">
            até amanhã!
          </p>
        </div>

        <!-- Seção Powered By & Links de Redes / Inscrição -->
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; font-style: italic; color: #6b7280; margin-bottom: 8px;">
            powered by
          </div>
          <div style="display: inline-block; background-color: #ff4a1c; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 18px; padding: 6px 14px; border-radius: 8px; margin-bottom: 16px;">
            b. / desbuguei.ia
          </div>

          <div style="margin: 16px 0; font-size: 13px; font-weight: 700; color: #111827;">
            <a href="https://instagram.com" target="_blank" style="margin: 0 8px; text-decoration: none; color: #111827;">Instagram</a> •
            <a href="https://linkedin.com" target="_blank" style="margin: 0 8px; text-decoration: none; color: #111827;">LinkedIn</a> •
            <a href="https://youtube.com" target="_blank" style="margin: 0 8px; text-decoration: none; color: #111827;">YouTube</a>
          </div>

          <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
            Atualize suas <a href="{{ UnsubscribeURL }}" target="_blank" style="color: #374151; text-decoration: underline;">preferências de e-mail</a> ou cancele a assinatura <a href="{{ UnsubscribeURL }}" target="_blank" style="color: #374151; text-decoration: underline;">aqui</a>
          </div>

          <div style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
            © 2026 desbuguei.ia. Todos os direitos reservados.
          </div>
        </div>

      </footer>
    </div>
  `;
}

export async function runNewsroom(
  options: RunNewsroomOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
) {
  const dryRun = options.dryRun ?? (env.DRY_RUN === "true" || env.DRY_RUN === undefined ? true : false);
  const publishToPortal = options.publishToPortal ?? !dryRun;
  const createNewsletterCampaign = options.createNewsletterCampaign ?? !dryRun;
  const autoSend = options.autoSend ?? (env.NEWSLETTER_AUTO_SEND === "true" || (!dryRun && env.NEWSLETTER_AUTO_SEND !== "false"));

  const todayStr = new Date().toISOString().split("T")[0];
  const idempotencyKey = options.idempotencyKey || `daily-edition-${todayStr}`;

  console.log(`[NEWSROOM] Iniciando run da redação (dry_run: ${dryRun}, auto_send: ${autoSend}, key: ${idempotencyKey})...`);

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: existingRun } = await supabase
        .from("newsroom_runs")
        .select("id, status, edition_id")
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (existingRun && existingRun.status === "success") {
        console.log(`[NEWSROOM] Run já executado com sucesso hoje (${idempotencyKey}). Cancelando duplicação.`);
        return { ok: false, reason: "already_executed_today", idempotencyKey };
      }
    } catch {
      // continua em caso de primeiro registro
    }
  }

  const startTime = Date.now();

  console.log("[NEWSROOM] Coletando notícias das fontes confiáveis brasileiras e globais...");
  const collectionResult = await collectAllNews(defaultNewsSources, fetcher);
  console.log(`[NEWSROOM] ${collectionResult.candidates.length} candidatas encontradas na janela de ${collectionResult.windowHours}h em ${collectionResult.sourcesAttempted} fontes.`);

  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(collectionResult.candidates);
  console.log(`[NEWSROOM] ${uniqueGroups.length} grupos únicos após deduplicação (${duplicatesCount} duplicatas removidas).`);

  const ranked = rankAndFilterCandidates(uniqueGroups);
  console.log(`[NEWSROOM] ${ranked.length} pautas classificadas por relevância e limite de marca.`);

  if (ranked.length < 4) {
    throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
  }

  console.log("[NEWSROOM] Executando pipeline editorial da OpenAI...");
  const pipelineResult = await runNewsroomPipeline(ranked, env, fetcher);

  const coverImages = pipelineResult.selectedCandidates.map((c) => c.image_url).filter(Boolean) as string[];
  const htmlContent = renderEditionToHtml(pipelineResult.edition, coverImages);
  const wordCount = htmlContent.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const executionTimeMs = Date.now() - startTime;

  console.log(`[NEWSROOM] Pipeline concluído com sucesso em ${executionTimeMs}ms! (QA score: ${pipelineResult.qaResult.score}/100, Palavras: ${wordCount})`);

  let createdArticleSlug: string | undefined;
  let createdCampaignId: number | undefined;
  let campaignStatus: string = "draft";

  if (publishToPortal) {
    try {
      const supabase = getSupabaseAdminClient();
      const articleSlug = `edicao-${todayStr}`;
      const primaryCoverImage = coverImages[0] || fallbackImages[0];

      const { data: articleData, error: articleErr } = await supabase
        .from("articles")
        .upsert(
          {
            slug: articleSlug,
            title: pipelineResult.edition.headline,
            excerpt: pipelineResult.edition.preheader,
            description: pipelineResult.edition.intro,
            cover_image: primaryCoverImage,
            status: "published",
            category: "Edição Diária",
            author: "desbuguei.ia",
            reading_minutes: Math.ceil(wordCount / 200),
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "slug" }
        )
        .select("id, slug")
        .single();

      if (!articleErr && articleData) {
        createdArticleSlug = articleData.slug;
        console.log(`[NEWSROOM PORTAL] Edição publicada no portal com sucesso em /artigos/${createdArticleSlug}`);

        await supabase.from("article_revisions").insert({
          article_id: articleData.id,
          title: pipelineResult.edition.headline,
          body: pipelineResult.edition as any,
          created_by: "newsroom_bot",
        });
      }
    } catch (pubErr) {
      console.error("[NEWSROOM PORTAL ERROR] Falha ao publicar edição no portal:", pubErr);
    }
  }

  if (createNewsletterCampaign) {
    try {
      const listmonk = createListmonkClient(env, fetcher);
      const campaignName = `desbuguei.ia — Edição ${todayStr}`;
      const campaignResult = await listmonk.createCampaign({
        name: campaignName,
        subject: pipelineResult.edition.subject,
        body: htmlContent,
        autoSend: autoSend && pipelineResult.qaResult.passed,
      });

      if (campaignResult.ok && campaignResult.id) {
        createdCampaignId = campaignResult.id;
        campaignStatus = campaignResult.status || (autoSend ? "running" : "draft");
        console.log(`[NEWSROOM LISTMONK] Campanha criada no Listmonk ID #${createdCampaignId} (status: ${campaignStatus})`);
      }
    } catch (lmErr) {
      console.error("[NEWSROOM LISTMONK ERROR] Falha ao criar campanha no Listmonk:", lmErr);
    }
  }

  // 100% Automação do Instagram: Dispara geração & postagem do carrossel automaticamente
  if (!dryRun) {
    try {
      console.log("[NEWSROOM INSTAGRAM] Disparando criação e publicação 100% automática no Instagram...");
      await runInstagramCarouselService(
        {
          dryRun: false,
          autoPost: autoSend,
          editionDateStr: todayStr,
          editionContent: pipelineResult.edition,
          articleSlug: createdArticleSlug || `edicao-${todayStr}`,
        },
        env,
        fetcher
      ).catch((instErr) => console.error("[NEWSROOM INSTAGRAM ERROR] Falha não-bloqueante no Instagram:", instErr));
    } catch (instErr) {
      console.error("[NEWSROOM INSTAGRAM ERROR] Falha no disparo do Instagram:", instErr);
    }
  }

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("newsroom_runs")
        .insert({
          started_at: new Date(startTime).toISOString(),
          finished_at: new Date().toISOString(),
          status: "success",
          sources_count: collectionResult.sourcesAttempted,
          candidates_found: collectionResult.candidates.length,
          candidates_filtered: collectionResult.candidates.length - uniqueGroups.length,
          duplicates_count: duplicatesCount,
          stories_selected: pipelineResult.selectedCandidates.length,
          tokens_input: pipelineResult.totalUsage.promptTokens,
          tokens_output: pipelineResult.totalUsage.completionTokens,
          cost_estimate_usd: pipelineResult.totalUsage.estimatedCostUsd,
          dry_run: false,
          idempotency_key: idempotencyKey,
        });
    } catch (dbErr) {
      console.error("[NEWSROOM DB] Erro ao gravar histórico no Supabase:", dbErr);
    }
  }

  return {
    ok: true,
    dryRun,
    publishedToPortal: Boolean(createdArticleSlug),
    articleSlug: createdArticleSlug,
    listmonkCampaignId: createdCampaignId,
    campaignStatus,
    idempotencyKey,
    executionTimeMs,
    sourcesAttempted: collectionResult.sourcesAttempted,
    candidatesFound: collectionResult.candidates.length,
    duplicatesCount,
    windowHours: collectionResult.windowHours,
    rankedCandidatesCount: ranked.length,
    selectedStoriesCount: pipelineResult.selectedCandidates.length,
    edition: pipelineResult.edition,
    qaResult: pipelineResult.qaResult,
    htmlContent,
    wordCount,
    tokens: pipelineResult.totalUsage,
  };
}
