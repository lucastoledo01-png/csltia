import { createListmonkClient } from "../listmonk";
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

export function renderEditionToHtml(edition: EditionContent, coverImage?: string): string {
  const defaultBanner = coverImage || "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80";

  const storiesHtml = edition.stories
    .map(
      (s) => `
      <section style="margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #eaecf0;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #ff4a1c;">
          ${s.category}
        </span>
        <h2 style="font-size: 22px; font-weight: 800; color: #111827; margin: 8px 0 12px 0; line-height: 1.3;">
          ${s.title}
        </h2>
        <p style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
          ${s.summary}
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
          <strong>Por que importa:</strong> ${s.why_it_matters}
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
          <strong>Na prática:</strong> ${s.practical_impact}
        </p>
        ${
          s.humor_line
            ? `<div style="background-color: #fafafa; border-left: 3px solid #ff4a1c; padding: 10px 14px; font-style: italic; font-size: 14px; color: #1f2937; margin: 12px 0;">
                "${s.humor_line}"
               </div>`
            : ""
        }
        <div style="margin-top: 10px;">
          <a href="${s.source_url}" target="_blank" style="font-size: 12px; font-weight: 600; color: #ff4a1c; text-decoration: none;">
            Fonte: ${s.source_name} ↗
          </a>
        </div>
      </section>
    `
    )
    .join("");

  const quickBitsHtml =
    edition.quick_bits && edition.quick_bits.length > 0
      ? `
      <section style="background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; margin: 28px 0;">
        <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #854d0e; margin-top: 0; margin-bottom: 12px;">
          🐛 Enquanto isso no modo debug...
        </h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #374151; line-height: 1.6;">
          ${edition.quick_bits.map((b) => `<li style="margin-bottom: 8px;"><strong>${b.title}:</strong> ${b.text}</li>`).join("")}
        </ul>
      </section>
    `
      : "";

  return `
    <div style="max-width: 640px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background-color: #ffffff; padding: 20px;">
      <header style="text-align: center; border-bottom: 2px solid #ff4a1c; padding-bottom: 20px; margin-bottom: 28px;">
        <div style="display: inline-block; background-color: #ff4a1c; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 14px; padding: 4px 12px; border-radius: 8px; margin-bottom: 12px;">
          b. / desbuguei.ia
        </div>
        <h1 style="font-size: 28px; font-weight: 900; margin: 8px 0; color: #111827;">${edition.headline}</h1>
        <p style="font-size: 14px; color: #6b7280; margin: 0;">${edition.preheader}</p>
      </header>

      <div style="margin-bottom: 28px; border-radius: 16px; overflow: hidden;">
        <img src="${defaultBanner}" alt="${edition.headline}" style="width: 100%; height: auto; max-height: 320px; object-fit: cover; border-radius: 16px; display: block;" />
      </div>

      <div style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 28px;">
        ${edition.intro}
      </div>

      ${storiesHtml}
      ${quickBitsHtml}

      <footer style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #eaecf0; text-align: center; font-size: 14px; color: #6b7280;">
        <p style="margin-bottom: 12px; color: #111827; font-weight: 500;">${edition.closing}</p>
        <p style="font-weight: 800; color: #ff4a1c; font-size: 15px; margin: 12px 0;">${edition.final_line}</p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">© 2026 desbuguei.ia. Todos os direitos reservados.</p>
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

  const primaryCoverImage = pipelineResult.selectedCandidates[0]?.image_url || "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80";
  const htmlContent = renderEditionToHtml(pipelineResult.edition, primaryCoverImage);
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

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("newsroom_runs").insert({
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
