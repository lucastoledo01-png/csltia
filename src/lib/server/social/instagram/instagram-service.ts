import { DEFAULT_PROJECT_ID, projectToday, requireActiveProject } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { getArticleBySlug } from "../../articles-service";
import { loadEdition } from "./edition-loader";
import type { CarouselFormat } from "./schemas";

/**
 * Parte do Instagram que a aplicação web pode executar.
 *
 * Este módulo NÃO pode alcançar o renderizador, nem por import dinâmico: o
 * empacotador resolve `await import()` em tempo de build e falharia ao não
 * encontrar o Playwright, que é devDependency e não existe em produção. Foi
 * exatamente o que quebrou o build do deploy.
 *
 * Gerar, renderizar e publicar mora em `worker-service.ts`, carregado apenas
 * pelo worker.
 */

export type RequestInstagramPostOptions = {
  projectId?: string;
  editionDateStr?: string;
  /** Formato do carrossel. Default "noticia" (fluxo da edição diária). */
  format?: CarouselFormat;
  /** Formato "noticia": índice da pauta na edição do dia. */
  storyIndex?: number;
  /** Formato "tutorial": slug do artigo (categoria Tutorial) a adaptar. */
  articleSlug?: string;
  /** Formato "tutorial": palavra exclusiva pro CTA (comentar pra receber). */
  keyword?: string;
};

/**
 * Cria uma vaga com horário imediato para o worker processar no próximo giro.
 * É o que o painel aciona: a aplicação web não renderiza imagem.
 */
export async function requestInstagramPost(
  options: RequestInstagramPostOptions,
): Promise<{ socialPostId: string; scheduledAt: string; format: CarouselFormat }> {
  const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);
  const editionDate = options.editionDateStr || projectToday(project);
  const format: CarouselFormat = options.format ?? "noticia";
  const supabase = getSupabaseAdminClient();
  const agora = new Date().toISOString();

  let title: string;
  let idempotencyKey: string;
  let contentJson: Record<string, unknown>;

  if (format === "tutorial") {
    const slug = options.articleSlug?.trim();
    if (!slug) throw new Error("Carrossel de tutorial exige articleSlug.");

    const article = await getArticleBySlug(slug);
    if (!article) throw new Error(`Artigo "${slug}" não encontrado.`);

    const keyword = normalizeKeyword(options.keyword) || autoKeyword(article.slug);

    title = article.title;
    idempotencyKey = `instagram-${editionDate}-tutorial-${slug}`;
    contentJson = { format, article_slug: slug, keyword, article_title: article.title };
  } else {
    const storyIndex = options.storyIndex ?? 0;
    const edition = await loadEdition(project, editionDate);
    const story = edition.stories[storyIndex];
    if (!story) {
      throw new Error(`A edição de ${editionDate} não tem pauta na posição ${storyIndex}.`);
    }

    title = story.title;
    idempotencyKey = `instagram-${editionDate}-manual-${String(storyIndex + 1).padStart(2, "0")}`;
    contentJson = { format: "noticia", story_index: storyIndex, story_title: story.title };
  }

  const { data, error } = await supabase
    .from("social_posts")
    .upsert(
      {
        project_id: project.id,
        edition_date: editionDate,
        article_slug: format === "tutorial" ? options.articleSlug : `edicao-${editionDate}`,
        platform: "instagram",
        post_type: "carousel",
        title,
        status: "scheduled",
        scheduled_at: agora,
        idempotency_key: idempotencyKey,
        content_json: contentJson,
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

  return { socialPostId: data.id, scheduledAt: agora, format };
}

/** Sem acento, maiúsculas, só letras e números — pronta pra virar keyword de campanha. */
function normalizeKeyword(raw?: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas de acento
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 20);
}

function autoKeyword(slug: string): string {
  const base = normalizeKeyword(slug.split("-")[0]) || "TUTORIAL";
  return `${base}${new Date().getFullYear().toString().slice(2)}`;
}
