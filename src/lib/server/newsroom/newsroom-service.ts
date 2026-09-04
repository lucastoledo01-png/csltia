import { escapeHtml, safeHttpUrl } from "../html";
import { createListmonkClient } from "../listmonk";
import {
  scheduleEditionPosts,
  type ScheduledPostSlot,
} from "../social/instagram/scheduler";
import {
  DEFAULT_PROJECT_ID,
  getProjectNewsSources,
  projectToday,
  requireActiveProject,
} from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { collectAllNews } from "./collector";
import { deduplicateCandidates } from "./deduplicator";
import { runNewsroomPipeline } from "./pipeline";
import { rankAndFilterCandidates } from "./ranker";
import { EditionContent } from "./schemas";
import { sendAlert } from "../alerts";
import { MARCA } from "@/lib/marca";

export type RunNewsroomOptions = {
  /** Projeto para o qual a edição é produzida. Sem valor, usa o projeto semente. */
  projectId?: string;
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

/**
 * HTML da edição.
 *
 * `paraWeb` decide o que fica de fora, e a distinção não é cosmética: a mesma
 * string ia para a caixa de entrada **e** para o corpo do artigo no portal.
 * Na página, o resultado era a edição duplicada — a página desenha o próprio
 * cabeçalho (título, data, resumo) e logo abaixo aparecia o cabeçalho do
 * e-mail com os mesmos dados, mais o índice repetindo todos os títulos, mais
 * o rodapé com "powered by" e o link de descadastro. Foi o que apareceu como
 * "repetindo um monte de parte".
 *
 * O que sai no modo web é só o que a página já provê ou o que só faz sentido
 * numa caixa de entrada. As pautas em si são idênticas nos dois.
 */
export function renderEditionToHtml(
  edition: EditionContent,
  coverImages: string[] = [],
  paraWeb = false,
): string {
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
        <span style="font-weight: 700; color: #111827;">${emoji} ${escapeHtml(s.category.toUpperCase())}:</span> ${escapeHtml(s.title)}
      </div>`;
    })
    .join("");

  const storiesHtml = edition.stories
    .map((s, index) => {
      const whatsappText = encodeURIComponent(
        `${s.title}\n\n"${s.summary.slice(0, 150)}..."\n\nEdição completa: ${MARCA.site}/artigos/edicao-${todayStr}`
      );
      const whatsappShareUrl = `https://api.whatsapp.com/send?text=${whatsappText}`;

      const sourceCreditName = escapeHtml(s.source_name || "Fonte Original");
      const sourceUrl = safeHttpUrl(s.source_url);
      const safeTitle = escapeHtml(s.title);

      // O resumo é escapado antes de receber o link para que a âncora seja o
      // único HTML introduzido aqui.
      const escapedSummary = escapeHtml(s.summary);
      const summaryWithInlineLink = escapedSummary.replace(
        /(notícia|estudo|pesquisa|anúncio|ferramenta|plataforma|novo modelo|atualização)/i,
        `<a href="${sourceUrl}" target="_blank" style="color: #374151; font-weight: 600; text-decoration: underline;">$1</a>`
      );

      const storyImage = safeHttpUrl(coverImages[index] || fallbackImages[index % fallbackImages.length]);

      return `
      <section style="margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
        <!-- Tag de Categoria Estilo The News -->
        <div style="margin-bottom: 6px;">
          <span style="display: inline-block; color: #d97706; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">
            ${escapeHtml(s.category)}
          </span>
        </div>

        <!-- Título da Pauta -->
        <h2 style="font-size: 24px; font-weight: 900; color: #111827; margin: 4px 0 16px 0; line-height: 1.25;">
          ${safeTitle}
        </h2>

        <!-- Imagem da Notícia com atributos de tag inline anti-download -->
        <div style="margin-bottom: 8px; border-radius: 12px; overflow: hidden; background-color: #f3f4f6;">
          <img src="${storyImage}" alt="${safeTitle}" border="0" loading="eager" decoding="async" style="display: block; width: 100%; height: auto; max-height: 340px; object-fit: cover; border-radius: 12px; margin: 0 auto;" />
        </div>
        <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-bottom: 18px;">
          (Imagem: ${sourceCreditName} | Reprodução)
        </div>

        <!-- Conteúdo Completo com Link da Fonte Embutido no Texto -->
        <div style="font-size: 15px; line-height: 1.7; color: #374151; margin-bottom: 16px;">
          ${summaryWithInlineLink.includes("href=") ? summaryWithInlineLink : `${summaryWithInlineLink} (<a href="${sourceUrl}" target="_blank" style="color: #374151; text-decoration: underline;">fonte original: ${sourceCreditName}</a>)`}
        </div>

        <!-- Caixa do impacto prático -->
        <div style="background-color: ${MARCA.fundoRealce}; border-left: 4px solid ${MARCA.tintaEscura}; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 18px 0;">
          <p style="font-size: 14px; font-weight: 800; color: ${MARCA.tintaEscura}; margin: 0 0 6px 0;">
            💡 O que muda na prática:
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #1f2937; margin: 0;">
            ${escapeHtml(s.practical_impact)}
          </p>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 12px;">
          <strong>Por que olhar de perto:</strong> ${escapeHtml(s.why_it_matters)}
        </p>

        ${
          s.humor_line
            ? `<p style="font-size: 13px; font-style: italic; color: #6b7280; margin: 8px 0 16px 0;">
                💬 "${escapeHtml(s.humor_line)}"
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
          ${edition.quick_bits.map((b) => `<li style="margin-bottom: 10px;"><strong>${escapeHtml(b.title)}:</strong> ${escapeHtml(b.text)}</li>`).join("")}
        </ul>
      </section>
    `
      : "";

  return `
    <div style="max-width: 640px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background-color: #ffffff; padding: 20px;">
      
      ${/* No portal a página já mostra título, data e resumo. */ ""}
      ${paraWeb ? "" : `<header style="text-align: center; border-bottom: 3px solid ${MARCA.cor}; padding-bottom: 18px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 800; color: #6b7280; letter-spacing: 0.1em; margin-bottom: 8px;">
          ${escapeHtml(dateFormatted)}
        </div>
        <div style="display: inline-block; background-color: ${MARCA.cor}; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 18px; padding: 6px 16px; border-radius: 8px; margin-bottom: 12px; letter-spacing: 0.05em;">
          ${MARCA.nome}
        </div>
        <h1 style="font-size: 26px; font-weight: 900; margin: 10px 0 6px 0; color: #111827; line-height: 1.25;">
          ${escapeHtml(edition.headline)}
        </h1>
        <p style="font-size: 14px; color: #4b5563; margin: 0; font-weight: 500;">
          ${escapeHtml(edition.preheader)}
        </p>
      </header>`}

      <!-- Saudação & Abertura -->
      <div style="font-size: 16px; line-height: 1.65; color: #1f2937; margin-bottom: 24px; background-color: #fafafa; padding: 16px 18px; border-radius: 12px; border: 1px solid #f3f4f6;">
        <p style="margin: 0 0 10px 0; font-weight: 800; color: ${MARCA.cor}; text-transform: uppercase; font-size: 13px; letter-spacing: 0.08em;">
          ☕ Bom dia!
        </p>
        ${escapeHtml(edition.intro)}
      </div>

      ${/*
        Índice. Fora do portal: numa página de rolagem contínua ele só repete
        os títulos que vêm logo abaixo, e foi metade da duplicação relatada.
      */ ""}
      ${
        paraWeb
          ? ""
          : `<div style="background-color: #f3f4f6; border-radius: 12px; padding: 14px 18px; margin-bottom: 32px;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.1em; margin-bottom: 8px;">
          Nesta edição:
        </div>
        ${tocHtml}
      </div>`
      }

      <!-- Histórias Principais com Imagem em CADA bloco -->
      ${storiesHtml}

      <!-- Giro Rápido -->
      ${quickBitsHtml}

      <!-- Caixa de Recomendação -->
      ${
        paraWeb
          ? ""
          : `<div style="background-color: ${MARCA.fundoRealce}; border-radius: 12px; padding: 18px; margin: 32px 0; border: 1px solid ${MARCA.bordaRealce}; text-align: center;">
        <p style="font-size: 15px; font-weight: 800; color: ${MARCA.tintaEscura}; margin: 0 0 6px 0;">
          🤝 Curtiu a edição de hoje?
        </p>
        <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5;">
          Encaminhe para alguém que está planejando a mudança para os Estados Unidos.
        </p>
      </div>`
      }

      ${/*
        Rodapé de caixa de entrada: marca, redes e descadastro. No portal isso
        é ruído, e o link de descadastro chega a ser errado — a página é
        pública e o visitante não é assinante de lista nenhuma.
      */ ""}
      ${paraWeb ? "" : `<footer style="margin-top: 40px; padding-top: 24px; border-top: 2px solid #e5e7eb;">
        
        <div style="text-align: left; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; margin-bottom: 28px;">
          <div style="font-size: 11px; font-weight: 900; color: #d97706; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
            QUEM SOMOS
          </div>
          <h3 style="font-size: 26px; font-weight: 900; color: #111827; margin: 0 0 14px 0; letter-spacing: -0.02em;">
            ${MARCA.nome}
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

        <!--
          Convite para o Instagram. Vem depois do conteúdo de propósito: quem
          chegou aqui leu a edição, e é a essa pessoa que vale pedir o seguir.
          No topo, competiria com a notícia que fez a pessoa abrir o e-mail.
        -->
        <div style="background-color: ${MARCA.tintaEscura}; border-radius: 20px; padding: 28px 24px; text-align: center; margin-bottom: 28px;">
          <div style="font-family: monospace; font-size: 12px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: #9DB4D8;">
            Todo dia no Instagram
          </div>
          <div style="font-size: 20px; font-weight: 900; color: #ffffff; margin-top: 8px; line-height: 1.3;">
            A notícia do dia em uma imagem
          </div>
          <div style="font-size: 14px; color: #C8D6EC; margin-top: 8px; line-height: 1.5;">
            Mudança de regra, prazo e decisão que afeta brasileiros nos EUA — no formato
            que dá para ler no ônibus e mandar para quem precisa.
          </div>
          <a href="${MARCA.instagram}" target="_blank" style="display: inline-block; margin-top: 18px; background-color: ${MARCA.cor}; color: #ffffff; font-weight: 900; font-size: 14px; padding: 13px 28px; border-radius: 999px; text-decoration: none;">
            Seguir ${MARCA.instagramHandle}
          </a>
        </div>

        <!-- Seção Powered By & Links de Redes / Inscrição -->
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 12px; font-style: italic; color: #6b7280; margin-bottom: 8px;">
            powered by
          </div>
          <div style="display: inline-block; background-color: ${MARCA.cor}; color: #ffffff; font-weight: 900; font-family: monospace; font-size: 18px; padding: 6px 14px; border-radius: 8px; margin-bottom: 16px;">
            ${MARCA.nome}
          </div>

          <!--
            Só o perfil que existe. Antes daqui os três links apontavam para
            instagram.com, linkedin.com e youtube.com — a home dos sites, não a
            conta. Link que leva a lugar nenhum gasta a confiança de quem
            clicou e não devolve nada.
          -->
          <div style="margin: 16px 0; font-size: 13px; font-weight: 700; color: #111827;">
            <a href="${MARCA.instagram}" target="_blank" style="margin: 0 8px; text-decoration: none; color: #111827;">${MARCA.instagramHandle} no Instagram</a>
          </div>

          <div style="font-size: 12px; color: #6b7280; margin-top: 20px;">
            Atualize suas <a href="{{ UnsubscribeURL }}" target="_blank" style="color: #374151; text-decoration: underline;">preferências de e-mail</a> ou cancele a assinatura <a href="{{ UnsubscribeURL }}" target="_blank" style="color: #374151; text-decoration: underline;">aqui</a>
          </div>

          <div style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
            © 2026 ${MARCA.nome}. Todos os direitos reservados.
          </div>
        </div>

      </footer>`}
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

  const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);

  // A data vem do fuso do projeto. Com UTC, toda execução depois das 21h no
  // Brasil era gravada com a data do dia seguinte.
  const todayStr = projectToday(project);
  const idempotencyKey = options.idempotencyKey || `daily-edition-${todayStr}`;

  console.log(`[NEWSROOM] Iniciando run da redação de ${project.slug} (dry_run: ${dryRun}, auto_send: ${autoSend}, key: ${idempotencyKey})...`);

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: existingRun } = await supabase
        .from("newsroom_runs")
        .select("id, status, edition_id")
        .eq("project_id", project.id)
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

  // As fontes vêm do banco, por projeto. Antes eram um array fixo no código,
  // então um projeto de outro segmento exigiria editar o fonte e fazer deploy.
  const sources = await getProjectNewsSources(project.id);

  console.log(`[NEWSROOM] Coletando notícias de ${sources.length} fontes configuradas para ${project.slug}...`);
  const collectionResult = await collectAllNews(sources, fetcher);
  console.log(`[NEWSROOM] ${collectionResult.candidates.length} candidatas encontradas na janela de ${collectionResult.windowHours}h em ${collectionResult.sourcesAttempted} fontes.`);

  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(collectionResult.candidates);
  console.log(`[NEWSROOM] ${uniqueGroups.length} grupos únicos após deduplicação (${duplicatesCount} duplicatas removidas).`);

  const ranked = rankAndFilterCandidates(uniqueGroups);
  console.log(`[NEWSROOM] ${ranked.length} pautas classificadas por relevância e limite de marca.`);

  if (ranked.length < 4) {
    throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
  }

  console.log("[NEWSROOM] Executando pipeline editorial da OpenAI...");

  // A voz da edição vem do projeto, não de uma constante no código. Sem isto,
  // trocar a vertical no banco mudava as fontes e não mudava o texto — o
  // sistema coletava imigração e escrevia como se fosse notícia de IA.
  const pipelineResult = await runNewsroomPipeline(ranked, env, fetcher, {
    nome: project.brand.displayName || project.name,
    nicho: project.niche,
    extra: project.editorialPromptExtra,
    assinatura:
      String(project.settings?.final_line ?? "").trim() ||
      `Até amanhã. — ${project.brand.displayName || project.name}`,
  });

  const coverImages = pipelineResult.selectedCandidates.map((c) => c.image_url).filter(Boolean) as string[];
  const htmlContent = renderEditionToHtml(pipelineResult.edition, coverImages);
  // Versão sem o cromo de e-mail, para o corpo do artigo no portal.
  const htmlParaPortal = renderEditionToHtml(pipelineResult.edition, coverImages, true);
  const wordCount = htmlContent.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const executionTimeMs = Date.now() - startTime;

  console.log(`[NEWSROOM] Pipeline concluído com sucesso em ${executionTimeMs}ms! (QA score: ${pipelineResult.qaResult.score}/100, Palavras: ${wordCount})`);

  let createdArticleSlug: string | undefined;
  let createdCampaignId: number | undefined;
  let campaignStatus: string = "draft";
  let editionId: string | undefined;

  // A edição precisa ficar gravada antes de qualquer publicação: é dela que o
  // pipeline do Instagram tira as pautas dos posts do dia. A tabela
  // news_editions existia com 18 colunas e nenhum insert em todo o código, e o
  // serviço do Instagram, ao não encontrar a edição, caía num conteúdo de
  // demonstração escrito no próprio arquivo.
  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();

      const { count } = await supabase
        .from("news_editions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id);

      const { data: editionRow, error: editionErr } = await supabase
        .from("news_editions")
        .upsert(
          {
            project_id: project.id,
            edition_date: todayStr,
            edition_number: (count ?? 0) + 1,
            slug: `edicao-${todayStr}`,
            subject: pipelineResult.edition.subject,
            subject_options: pipelineResult.edition.subject_options,
            preheader: pipelineResult.edition.preheader,
            headline: pipelineResult.edition.headline,
            intro: pipelineResult.edition.intro,
            stories: pipelineResult.edition.stories,
            quick_bits: pipelineResult.edition.quick_bits ?? [],
            closing: pipelineResult.edition.closing,
            final_line: pipelineResult.edition.final_line,
            content_html: htmlContent,
            word_count: wordCount,
            qa_passed: pipelineResult.qaResult.passed,
            qa_score: pipelineResult.qaResult.score,
            qa_hallucination_risk: pipelineResult.qaResult.hallucination_risk,
            qa_issues: pipelineResult.qaResult.issues,
            status: "published",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,edition_date" },
        )
        .select("id")
        .single();

      if (editionErr) throw new Error(editionErr.message);
      editionId = editionRow?.id;
      console.log(`[NEWSROOM] Edição ${todayStr} gravada em news_editions (${editionId}).`);
    } catch (edErr) {
      // Sem a edição gravada os posts do dia não têm de onde sair, então a
      // falha interrompe em vez de seguir para a publicação.
      throw new Error(
        `Falha ao gravar a edição do dia: ${edErr instanceof Error ? edErr.message : String(edErr)}`,
      );
    }
  }

  if (publishToPortal) {
    try {
      const supabase = getSupabaseAdminClient();
      const articleSlug = `edicao-${todayStr}`;
      const primaryCoverImage = coverImages[0] || fallbackImages[0];

      const { data: articleData, error: articleErr } = await supabase
        .from("articles")
        .upsert(
          {
            project_id: project.id,
            slug: articleSlug,
            title: pipelineResult.edition.headline,
            excerpt: pipelineResult.edition.preheader,
            description: pipelineResult.edition.intro,
            cover_image: primaryCoverImage,
            content_html: htmlParaPortal,
            content: pipelineResult.edition.stories,
            status: "published",
            category: "Edição Diária",
            author: MARCA.nome,
            reading_minutes: Math.ceil(wordCount / 200),
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,slug" }
        )
        .select("id, slug")
        .single();

      if (!articleErr && articleData) {
        createdArticleSlug = articleData.slug;
        console.log(`[NEWSROOM PORTAL] Edição publicada no portal com sucesso em /artigos/${createdArticleSlug}`);

        await supabase.from("article_revisions").insert({
          project_id: project.id,
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
      const campaignName = `${MARCA.nome} — Edição ${todayStr}`;
      // O portão olha `hallucination_risk`, não `passed`.
      //
      // `passed` é o veredito genérico que o checador autodeclara, e ele
      // reprova por tom, gramática ou qualquer implicância — custando a
      // newsletter inteira do dia. O dano que justifica não enviar é um só:
      // fato inventado chegando à lista. Isso não se desfaz com errata.
      //
      // Vírgula errada é recuperável e não vale um dia sem edição. Número de
      // benchmark que não estava na fonte, não.
      const retidoPorAlucinacao = pipelineResult.qaResult.hallucination_risk;
      const campaignResult = await listmonk.createCampaign({
        name: campaignName,
        subject: pipelineResult.edition.subject,
        body: htmlContent,
        autoSend: autoSend && !retidoPorAlucinacao,
      });

      if (campaignResult.ok && campaignResult.id) {
        createdCampaignId = campaignResult.id;
        campaignStatus = campaignResult.status || (autoSend && !retidoPorAlucinacao ? "running" : "draft");
        console.log(`[NEWSROOM LISTMONK] Campanha criada no Listmonk ID #${createdCampaignId} (status: ${campaignStatus})`);
      }

      if (retidoPorAlucinacao) {
        // Campanha retida sem aviso é indistinguível de campanha que não foi
        // criada. Quem precisa revisar tem que saber no mesmo minuto.
        await sendAlert(
          "warning",
          "Newsletter retida: risco de alucinação",
          `Edição ${todayStr} ficou em rascunho no Listmonk (campanha #${createdCampaignId ?? "?"}). ` +
            `QA ${pipelineResult.qaResult.score}/100. Apontamentos: ` +
            (pipelineResult.qaResult.issues.join(" · ") || "nenhum detalhado"),
        );
      }
    } catch (lmErr) {
      console.error("[NEWSROOM LISTMONK ERROR] Falha ao criar campanha no Listmonk:", lmErr);
    }
  }

  // Os posts do dia são agendados aqui, não gerados. A edição vira várias
  // vagas — uma pauta por post, espalhadas ao longo do dia — e o worker de
  // renderização processa cada uma no horário. A geração exige Chromium, que
  // não roda na hospedagem que serve o site.
  let scheduledPosts: ScheduledPostSlot[] = [];

  if (!dryRun) {
    try {
      scheduledPosts = await scheduleEditionPosts({
        project,
        editionId,
        editionDate: todayStr,
        articleSlug: createdArticleSlug || `edicao-${todayStr}`,
        stories: pipelineResult.edition.stories,
      });
    } catch (agErr) {
      // Falhar no agendamento não pode desfazer a newsletter que já saiu.
      console.error("[NEWSROOM INSTAGRAM] Falha ao agendar os posts do dia:", agErr);
    }
  }

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("newsroom_runs")
        .insert({
          project_id: project.id,
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
          edition_id: editionId,
          idempotency_key: idempotencyKey,
        });
    } catch (dbErr) {
      console.error("[NEWSROOM DB] Erro ao gravar histórico no Supabase:", dbErr);
    }
  }

  return {
    ok: true,
    projectId: project.id,
    projectSlug: project.slug,
    dryRun,
    publishedToPortal: Boolean(createdArticleSlug),
    articleSlug: createdArticleSlug,
    listmonkCampaignId: createdCampaignId,
    campaignStatus,
    idempotencyKey,
    editionId,
    scheduledPosts,
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
