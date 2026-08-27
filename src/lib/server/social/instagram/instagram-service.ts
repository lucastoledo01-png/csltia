import { DEFAULT_PROJECT_ID, projectToday, requireActiveProject } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { loadEdition } from "./edition-loader";

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

/**
 * Cria uma vaga com horário imediato para o worker processar no próximo giro.
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
