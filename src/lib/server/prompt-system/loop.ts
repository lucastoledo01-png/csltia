import { DEFAULT_PROJECT_ID, projectToday, requireActiveProject } from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { fetchMediaInsights } from "../social/instagram/meta-client";

/**
 * Etapas 13 e 14 — analytics de funil e loop editorial.
 *
 * O retrato diário de cada campanha publicada: alcance, saves e shares vêm do
 * Meta Graph; comentário, Direct, clique, visita, lead e entrega vêm de
 * `prompt_funnel_events`.
 *
 * O ponto do loop, e o que o distingue de um dashboard: **não otimiza para
 * alcance**. Um conteúdo com poucas views e muitos leads vale mais que um
 * viral que não converte, e é isso que a pontuação abaixo precisa expressar.
 * Ordenar por alcance produziria exatamente a decisão errada.
 *
 * O que falta e não depende deste arquivo: `comment`, `dm` e `click` chegam por
 * pull do OpenReply, que ainda não tem a rota de serviço (decisão D1). Até lá
 * esses três estágios ficam em zero, e o `performance_score` mede o que existe.
 */

/**
 * Pontuação de desempenho de um retrato.
 *
 * A fórmula é explícita e vive num só lugar porque ela **decide a próxima
 * pauta**: qualquer combinação de pesos escondida em duas consultas diferentes
 * acabaria divergindo, e a divergência apareceria como decisão editorial
 * errada, não como bug.
 *
 * Lead pesa mais que alcance de propósito, e por muito: alcance é o que o
 * Instagram entrega, lead é o que o funil produz. `numeric(10,4)` cabe até
 * 999999,9999, e a escala abaixo fica muito abaixo disso.
 */
export function calcularPerformanceScore(m: {
  reach: number;
  saves: number;
  shares: number;
  leads: number;
  clicks: number;
}): number {
  const alcance = Math.max(0, m.reach);

  // Piso no denominador. Sem ele, alcance minúsculo — que acontece de verdade
  // nos minutos após publicar, enquanto os insights da Meta não chegam —
  // explodia a normalização: 100 leads sobre alcance 1 dava 9.500.000, acima do
  // que `numeric(10,4)` aceita, e a gravação do retrato falhava.
  //
  // "Por mil de um público de ao menos 100 pessoas" é a leitura honesta: abaixo
  // disso a taxa não significa nada.
  const ALCANCE_MINIMO = 100;
  const porMil = alcance > 0 ? 1000 / Math.max(alcance, ALCANCE_MINIMO) : 0;

  const leadsPorMil = m.leads * porMil;
  const cliquesPorMil = m.clicks * porMil;
  const salvosPorMil = m.saves * porMil;
  const compartilhadosPorMil = m.shares * porMil;

  const bruto =
    leadsPorMil * 60 + cliquesPorMil * 15 + salvosPorMil * 8 + compartilhadosPorMil * 12;

  // Teto de segurança na largura da coluna. O piso acima já impede o caso
  // patológico; isto é a rede caso a fórmula mude e alguém esqueça a coluna.
  const TETO = 999_999;

  // Duas casas bastam para ordenar e evitam ruído de ponto flutuante no banco.
  return Math.round(Math.min(bruto, TETO) * 100) / 100;
}

type ContagemDeFunil = Record<string, number>;

async function contarEventos(campaignId: string): Promise<ContagemDeFunil> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("prompt_funnel_events")
    .select("stage")
    .eq("campaign_id", campaignId);

  const contagem: ContagemDeFunil = {};
  for (const row of data ?? []) {
    const stage = String((row as { stage?: unknown }).stage ?? "");
    if (stage) contagem[stage] = (contagem[stage] ?? 0) + 1;
  }
  return contagem;
}

/**
 * Grava o retrato do dia de cada campanha publicada.
 *
 * `snapshot_date` sai de `projectToday(project)`, nunca de `current_date`: o
 * servidor é UTC e toda execução depois das 21h no Brasil cairia no dia
 * seguinte. É a armadilha que a migração multi-projeto já corrigiu uma vez.
 *
 * `conversion_rate` **não** é escrito — é coluna gerada a partir de `leads` e
 * `reach`, e tentar escrevê-la é recusado pelo Postgres.
 *
 * Uma campanha que falha não derruba as outras: o relatório de hoje com uma
 * linha faltando é melhor que nenhum.
 */
export async function gravarRetratosDoDia(
  options: { projectId?: string; env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<{ campanhas: number; gravados: number; falhas: number }> {
  const { projectId = DEFAULT_PROJECT_ID, env = process.env, fetcher = fetch } = options;

  const project = await requireActiveProject(projectId);
  const hoje = projectToday(project);
  const supabase = getSupabaseAdminClient();

  const { data: campanhas } = await supabase
    .from("prompt_campaigns")
    .select("id, keyword, ig_media_id")
    .eq("project_id", projectId)
    .eq("status", "published");

  let gravados = 0;
  let falhas = 0;

  for (const c of campanhas ?? []) {
    const campaignId = String(c.id);

    try {
      const mediaId = String(c.ig_media_id ?? "");
      const [insights, funil] = await Promise.all([
        mediaId
          ? fetchMediaInsights(mediaId, env, fetcher)
          : Promise.resolve({ reach: 0, saved: 0, shares: 0, comments: 0, likes: 0 }),
        contarEventos(campaignId),
      ]);

      const metricas = {
        reach: insights.reach,
        saves: insights.saved,
        shares: insights.shares,
        comments: Math.max(insights.comments, funil.comment ?? 0),
        dms_started: funil.dm ?? 0,
        clicks: funil.click ?? 0,
        leads: funil.lead ?? 0,
      };

      const { error } = await supabase.from("prompt_concept_results").upsert(
        {
          project_id: projectId,
          campaign_id: campaignId,
          snapshot_date: hoje,
          ...metricas,
          performance_score: calcularPerformanceScore({
            reach: metricas.reach,
            saves: metricas.saves,
            shares: metricas.shares,
            leads: metricas.leads,
            clicks: metricas.clicks,
          }),
        },
        // Um retrato por campanha por dia: rodar duas vezes atualiza a foto em
        // vez de criar uma segunda.
        { onConflict: "campaign_id,snapshot_date" },
      );

      if (error) throw new Error(error.message);
      gravados += 1;
    } catch (err) {
      falhas += 1;
      console.warn(`[LOOP] Falha no retrato da campanha ${campaignId}:`, err);
    }
  }

  return { campanhas: (campanhas ?? []).length, gravados, falhas };
}

export type Aprendizado = {
  periodoInicio: string;
  periodoFim: string;
  melhores: Array<{ keyword: string; performanceScore: number; leads: number; reach: number }>;
  piores: Array<{ keyword: string; performanceScore: number; leads: number; reach: number }>;
  resumo: string;
};

/**
 * Agrega o período e grava em `prompt_learnings`.
 *
 * O retrato mais recente de cada campanha é o que conta — não a média: os
 * números do Instagram são cumulativos, então somar retratos do mesmo post
 * contaria o mesmo alcance várias vezes.
 *
 * `applied_to_prompt` fica `false`: o aprendizado existir não significa que
 * ele já mudou a pauta. Marcar como aplicado sem ter aplicado transformaria o
 * loop numa coleção de relatórios que ninguém usa e que se declara usada.
 */
export async function agregarAprendizados(
  options: { projectId?: string; dias?: number } = {},
): Promise<Aprendizado | null> {
  const { projectId = DEFAULT_PROJECT_ID, dias = 7 } = options;

  const project = await requireActiveProject(projectId);
  const fim = projectToday(project);
  const inicio = new Date(new Date(`${fim}T00:00:00Z`).getTime() - (dias - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("prompt_concept_results")
    .select("campaign_id, snapshot_date, reach, leads, performance_score, prompt_campaigns(keyword)")
    .eq("project_id", projectId)
    .gte("snapshot_date", inicio)
    .lte("snapshot_date", fim)
    .order("snapshot_date", { ascending: false });

  if (!data || data.length === 0) return null;

  // Um por campanha, o mais recente — os números da Meta são cumulativos.
  const ultimoPorCampanha = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    const id = String(row.campaign_id);
    if (!ultimoPorCampanha.has(id)) ultimoPorCampanha.set(id, row);
  }

  const linhas = [...ultimoPorCampanha.values()]
    .map((r) => {
      const rel = r as unknown as { prompt_campaigns?: { keyword?: string } | null };
      return {
        keyword: String(rel.prompt_campaigns?.keyword ?? "?"),
        performanceScore: Number(r.performance_score ?? 0),
        leads: Number(r.leads ?? 0),
        reach: Number(r.reach ?? 0),
      };
    })
    .sort((a, b) => b.performanceScore - a.performanceScore);

  const melhores = linhas.slice(0, 3);
  const piores = linhas.slice(-3).reverse();

  const resumo =
    `Período ${inicio} a ${fim}: ${linhas.length} campanha(s) com retrato. ` +
    (melhores[0]
      ? `Melhor: ${melhores[0].keyword} (${melhores[0].leads} lead(s) em ` +
        `${melhores[0].reach} de alcance, score ${melhores[0].performanceScore}). `
      : "") +
    (piores[0] && piores[0].keyword !== melhores[0]?.keyword
      ? `Pior: ${piores[0].keyword} (score ${piores[0].performanceScore}).`
      : "");

  const { error } = await supabase.from("prompt_learnings").insert({
    project_id: projectId,
    period_start: inicio,
    period_end: fim,
    top_combo: melhores,
    bottom_combo: piores,
    summary_text: resumo,
    applied_to_prompt: false,
  });

  if (error) throw new Error(`Falha ao gravar o aprendizado: ${error.message}`);

  return { periodoInicio: inicio, periodoFim: fim, melhores, piores, resumo };
}
