import { zonedTimeToUtc } from "./time";
import { somarDiasIso } from "./cadencia";
import type { getSupabaseAdminClient } from "./supabase-admin";

/**
 * O que o painel mostra de um dia, para "toda recusa é explicável" ser visível
 * sem SQL (PRD de 05/10/2026).
 *
 * Os motivos já estavam no banco, em três lugares que ninguém lia junto:
 *
 *   newsroom_runs.error_message        por que o dia não fechou (ou falhou)
 *   news_candidates.decision_reason    por que cada pauta foi recusada
 *   platform_events                    por que o Instagram recusou ou descartou
 *   social_posts.social_guard_reasons  o que a guarda do post apontou
 *
 * Este módulo lê os quatro para um dia do PROJETO (no fuso dele, nunca em UTC,
 * pela lição de "Data em UTC gravava o dia seguinte") e agrupa os motivos pelo
 * código, que é a parte do texto antes dos dois-pontos.
 */

/**
 * O código de um motivo gravado em texto livre.
 *
 * Os motivos do projeto seguem a forma `CODIGO: explicação` desde setembro
 * (`REJECT_LOW_RELEVANCE`, `RUN_FAILED: ...`, `EIXO_OVERLOAD: eixo politica
 * já tem 3`). Texto sem código vira `SEM_CODIGO`, e não some: motivo que não
 * se encaixa é justamente o que precisa aparecer.
 */
export function codigoDoMotivo(motivo: string | null | undefined): string {
  const texto = (motivo ?? "").trim();
  if (!texto) return "SEM_CODIGO";
  const m = /^([A-Z][A-Z0-9_]{2,})\b/.exec(texto);
  return m ? m[1] : "SEM_CODIGO";
}

export function contarPorCodigo(motivos: Array<string | null | undefined>): Array<{ codigo: string; total: number }> {
  const contagem = new Map<string, number>();
  for (const m of motivos) {
    const c = codigoDoMotivo(m);
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  return [...contagem]
    .map(([codigo, total]) => ({ codigo, total }))
    .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo));
}

/** Os limites do dia local do projeto, em UTC. */
export function limitesDoDia(dia: string, timezone: string): { deIso: string; ateIso: string } {
  return {
    deIso: zonedTimeToUtc(dia, "00:00", timezone).toISOString(),
    ateIso: zonedTimeToUtc(somarDiasIso(dia, 1), "00:00", timezone).toISOString(),
  };
}

type Cliente = ReturnType<typeof getSupabaseAdminClient>;

export type RecusaDoSocial = { etapa: string; motivo: string; titulo: string; codigo: string };

/** As recusas que o diagnóstico do social grava em `platform_events`. */
export function recusasDoDiagnostico(payload: unknown): RecusaDoSocial[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const saida: RecusaDoSocial[] = [];
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
  for (const r of lista(p.recusadas)) {
    const motivo = String(r.motivo ?? "");
    saida.push({ etapa: "verificacao", motivo, titulo: String(r.titulo ?? ""), codigo: codigoDoMotivo(motivo) });
  }
  for (const r of lista(p.emConflito)) {
    const motivo = String(r.motivo ?? "");
    saida.push({ etapa: "conflito", motivo, titulo: String(r.titulo ?? ""), codigo: codigoDoMotivo(motivo) });
  }
  for (const r of lista(p.descartados)) {
    const motivo = String(r.motivo ?? "");
    saida.push({
      etapa: String(r.etapa ?? "descarte"),
      motivo,
      titulo: String(r.titulo ?? ""),
      codigo: codigoDoMotivo(motivo),
    });
  }
  return saida;
}

export async function logsDoDia(cliente: Cliente, projeto: { id: string; timezone: string }, dia: string) {
  const { deIso, ateIso } = limitesDoDia(dia, projeto.timezone);

  const [runs, candidatas, eventos, posts] = await Promise.all([
    cliente
      .from("newsroom_runs")
      .select(
        "id, started_at, finished_at, status, dry_run, idempotency_key, error_message, sources_count, candidates_found, duplicates_count, stories_selected, cost_estimate_usd",
      )
      .eq("project_id", projeto.id)
      .gte("started_at", deIso)
      .lt("started_at", ateIso)
      .order("started_at", { ascending: true }),
    cliente
      .from("news_candidates")
      .select("id, title, source_name, status, decision_reason, editorial_axis, country, relevance, url")
      .eq("project_id", projeto.id)
      .gte("created_at", deIso)
      .lt("created_at", ateIso)
      .order("created_at", { ascending: true })
      .limit(1500),
    cliente
      .from("platform_events")
      .select("id, event_type, created_at, payload")
      .eq("project_id", projeto.id)
      .gte("created_at", deIso)
      .lt("created_at", ateIso)
      .order("created_at", { ascending: true })
      .limit(200),
    cliente
      .from("social_posts")
      .select("id, title, status, scheduled_at, published_at, social_guard_status, social_guard_reasons, error_message")
      .eq("project_id", projeto.id)
      .eq("edition_date", dia)
      .order("scheduled_at", { ascending: true }),
  ]);

  const erros = [runs.error, candidatas.error, eventos.error, posts.error]
    .filter(Boolean)
    .map((e) => (e as { message: string }).message);

  const listaDeCandidatas = (candidatas.data ?? []) as Array<{ status: string; decision_reason: string | null }>;
  const recusadas = listaDeCandidatas.filter((c) => c.status === "rejected" || c.status === "capped");
  const recusasDoSocial = ((eventos.data ?? []) as Array<{ event_type: string; payload: unknown }>)
    /*
     * `pauta_sem_foto` (05/10/2026) grava as quedas da newsletter e do portal
     * no mesmo formato de `descartados` do social, e entra na mesma lista.
     */
    .filter((e) => e.event_type === "social_cycle_diagnostic" || e.event_type === "pauta_sem_foto")
    .flatMap((e) => recusasDoDiagnostico(e.payload));

  const porStatus: Record<string, number> = {};
  for (const c of listaDeCandidatas) porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;

  return {
    dia,
    limites: { deIso, ateIso },
    erros,
    runs: runs.data ?? [],
    candidatas: {
      total: listaDeCandidatas.length,
      porStatus,
      motivosDaRecusa: contarPorCodigo(recusadas.map((c) => c.decision_reason)),
      lista: candidatas.data ?? [],
    },
    social: {
      recusas: recusasDoSocial,
      motivos: contarPorCodigo(recusasDoSocial.map((r) => r.motivo)),
      posts: posts.data ?? [],
    },
    eventos: eventos.data ?? [],
  };
}
