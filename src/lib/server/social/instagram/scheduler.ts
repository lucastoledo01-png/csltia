import type { EditionStory } from "../../newsroom/schemas";
import type { Project } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { zonedTimeToUtc } from "../../time";

/**
 * Agendamento dos posts do dia.
 *
 * A edição vira vários posts: uma pauta por post, espalhados ao longo do dia.
 * O e-mail leva o resumo de tudo; cada post aprofunda uma notícia.
 *
 * Aqui só as vagas são criadas, com status `scheduled`. A geração do roteiro,
 * a renderização das imagens e a publicação ficam com o worker, que roda em
 * máquina com Chromium disponível.
 */

export const DEFAULT_POST_TIMES = ["09:30", "12:30", "16:00", "19:00"];

export type ScheduledPostSlot = {
  socialPostId: string;
  storyIndex: number;
  title: string;
  scheduledAt: string;
};

function resolvePostTimes(project: Project): string[] {
  const configurado = project.settings?.instagram_post_times;

  if (Array.isArray(configurado) && configurado.length > 0) {
    const validos = configurado.filter(
      (valor): valor is string => typeof valor === "string" && /^\d{2}:\d{2}$/.test(valor),
    );
    if (validos.length > 0) return validos;
  }

  return DEFAULT_POST_TIMES;
}

export async function scheduleEditionPosts(options: {
  project: Project;
  editionId?: string;
  editionDate: string;
  articleSlug: string;
  stories: EditionStory[];
  maxPosts?: number;
}): Promise<ScheduledPostSlot[]> {
  const { project, editionId, editionDate, articleSlug, stories } = options;

  const horarios = resolvePostTimes(project);
  const total = Math.min(options.maxPosts ?? horarios.length, horarios.length, stories.length);

  if (total === 0) {
    console.warn(`[INSTAGRAM SCHEDULER] Nada a agendar para ${project.slug} em ${editionDate}.`);
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const agendados: ScheduledPostSlot[] = [];

  /**
   * Espaçamento mínimo entre posts, em minutos.
   *
   * Os horários configurados já são espaçados, mas eles valem para uma edição
   * que roda de manhã. Numa execução tardia — refazer o dia às 18h, por
   * exemplo — todos os horários anteriores já passaram, o worker encontra três
   * vagas vencidas de uma vez e despeja os posts em sequência no perfil.
   *
   * Foi o que aconteceu ao trocar a vertical: a edição rodou às 18h44 e
   * 09:30, 12:30 e 16:00 venceram juntos.
   */
  const ESPACAMENTO_MINUTOS = 90;

  const agora = Date.now();
  // Cinco minutos de folga: a vaga é criada aqui e o roteiro ainda precisa ser
  // gerado. Vencer no mesmo instante faria o worker pegá-la antes disso.
  let proximoPermitido = agora + 5 * 60_000;

  for (let i = 0; i < total; i++) {
    const story = stories[i];

    const doHorario = zonedTimeToUtc(editionDate, horarios[i], project.timezone).getTime();
    // O horário configurado quando ele ainda está por vir; senão, a próxima
    // janela livre. Assim uma execução tardia continua escalonando em vez de
    // publicar tudo de uma vez.
    const quando = Math.max(doHorario, proximoPermitido);
    proximoPermitido = quando + ESPACAMENTO_MINUTOS * 60_000;

    const scheduledAt = new Date(quando).toISOString();

    // A chave de idempotência inclui a posição da pauta, senão o segundo post
    // do dia colidiria com o primeiro.
    const idempotencyKey = `instagram-${editionDate}-${String(i + 1).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("social_posts")
      .upsert(
        {
          project_id: project.id,
          edition_id: editionId ?? null,
          edition_date: editionDate,
          article_slug: articleSlug,
          platform: "instagram",
          post_type: "carousel",
          title: story.title,
          status: "scheduled",
          scheduled_at: scheduledAt,
          idempotency_key: idempotencyKey,
          // O worker preenche o roteiro; aqui fica só a pauta escolhida.
          content_json: { story_index: i, story_title: story.title },
          dry_run: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,idempotency_key" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(`[INSTAGRAM SCHEDULER] Falha ao agendar post ${i + 1}:`, error.message);
      continue;
    }

    agendados.push({
      socialPostId: data.id,
      storyIndex: i,
      title: story.title,
      scheduledAt,
    });
  }

  console.log(
    `[INSTAGRAM SCHEDULER] ${agendados.length} posts agendados para ${project.slug} em ${editionDate}: ` +
      agendados.map((p) => `${p.scheduledAt} (${horarios[p.storyIndex]} local)`).join(", "),
  );

  return agendados;
}

/** Posts que já venceram o horário e ainda não foram processados. */
export async function findDuePosts(limit = 5): Promise<
  Array<{ id: string; projectId: string; editionDate: string; storyIndex: number; articleSlug: string | null }>
> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("social_posts")
    .select("id, project_id, edition_date, content_json, article_slug")
    .eq("platform", "instagram")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao buscar posts pendentes: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    editionDate: row.edition_date as string,
    storyIndex: Number((row.content_json as { story_index?: number })?.story_index ?? 0),
    articleSlug: (row.article_slug as string | null) ?? null,
  }));
}

/**
 * Marca o post como falho preservando o motivo, para o painel de logs.
 *
 * Esta era a única escrita da cadeia de publicação que descartava o erro do
 * Supabase. O efeito prático aparecia no pior momento: quando
 * `publicarComRegistro` devolve "revisar" — publicação de desfecho incerto —
 * é esta função que registra o caso, e se a gravação falhasse em silêncio o
 * post ficaria eternamente em `scheduled`, elegível para o worker pegar de
 * novo, sem nenhum rastro de que já houve uma tentativa ambígua.
 *
 * Ela não lança: quem chama já está tratando uma falha, e uma exceção aqui
 * trocaria o motivo verdadeiro por "não consegui gravar o motivo". O erro vai
 * para o log e para o valor de retorno, que o chamador pode usar para decidir
 * se escala.
 */
export async function markPostFailed(
  socialPostId: string,
  message: string,
): Promise<{ gravado: boolean; erro: string | null }> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("social_posts")
    .update({
      status: "failed",
      error_message: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", socialPostId);

  if (error) {
    console.error(
      `[SCHEDULER] Não consegui marcar o post ${socialPostId} como falho: ${error.message}. ` +
        `O motivo original era: ${message.slice(0, 200)}`,
    );
    return { gravado: false, erro: error.message };
  }

  return { gravado: true, erro: null };
}
