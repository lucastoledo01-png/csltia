import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Por que a aba do Instagram está vazia, dito na própria aba (06/10/2026).
 *
 * Em 06/10/2026 a fila mostrava "Post: sem decisões nos últimos 30 dias" e
 * nenhum post, e a leitura natural era "os posts não estão entrando na fila".
 * Não era: nenhum post foi gravado em `social_posts` naquele dia. O ciclo do
 * Instagram rodou às 06:11, conferiu 7 pautas e terminou com
 * `selected: 0, scheduled: 0`, sem custo de redação de post. O único caminho
 * do ciclo que corta tudo depois da composição e antes da redação é o
 * bloqueio da composição (`SOCIAL_PERSISTENCE_UNAVAILABLE`, persistência de
 * candidatas degradada), e esse bloqueio não era gravado no diagnóstico.
 *
 * A fila em ensaio enfileira os posts (o store grava `scheduled` e chama
 * `aoGravar`, ver `escritores-de-post.test.ts`). Sem post gravado não há o que
 * enfileirar, e a tela precisa dizer isso com o motivo, em vez de parecer
 * defeito da fila. O diagnóstico passou a gravar o bloqueio
 * (`diagnostico-gravado.ts`), e esta função o lê.
 */

export type RegistroDoInstagram = {
  criadoEm: string;
  payload: Record<string, unknown>;
};

export type DiaDoInstagram = {
  /** Quantos posts o ciclo gravou nesse registro. */
  gravados: number;
  /** A frase principal, para o estado vazio da aba. */
  frase: string;
  /** Até cinco motivos concretos (pauta recusada, cortada, sem foto). */
  detalhes: string[];
  quando: string | null;
};

type Diag = {
  mode?: string;
  executed?: boolean;
  verified?: number;
  selected?: number;
  scheduled?: number;
  errors?: string[];
};

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function hora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

const MOTIVO_DE_CORTE: Record<string, string> = {
  ALEM_DO_MAXIMO: "o dia já tinha o máximo de posts",
  EIXO_OVERLOAD: "a editoria já tinha posts demais no dia",
  TOPIC_OVERLOAD: "o tema já tinha posts demais no dia",
  DUPLICATE_EVENT: "o mesmo acontecimento já tinha entrado",
  SAME_ENTITY_OVERLOAD: "a mesma pessoa ou empresa já aparecia demais",
  DOMINIO_OVERLOAD: "a mesma fonte já tinha posts demais",
  REJECT_NO_PHOTO: "não havia foto da pauta",
  POLITICA_BR_OVERLOAD: "o dia já tinha política brasileira demais",
};

function motivoLegivel(motivo: string): string {
  const codigo = motivo.split(":")[0].trim();
  return MOTIVO_DE_CORTE[codigo] ?? motivo;
}

export function explicarDiaDoInstagram(registro: RegistroDoInstagram | null): DiaDoInstagram {
  if (!registro) {
    return {
      gravados: 0,
      frase: "Não há registro do ciclo do Instagram nas últimas 36 horas: ele não rodou, ou caiu antes de gravar o diagnóstico.",
      detalhes: [],
      quando: null,
    };
  }
  const p = registro.payload;
  const d = (p.diagnostico ?? {}) as Diag;
  const quando = hora(registro.criadoEm);
  const gravados = n(d.scheduled);
  const escritos = n(d.selected);
  const conferidas = n(d.verified);
  const bloqueio = typeof p.bloqueio === "string" ? p.bloqueio : null;
  const escolhidas = typeof p.escolhidasNaComposicao === "number" ? p.escolhidasNaComposicao : null;

  const detalhes: string[] = [];
  for (const r of ((p.recusadas ?? []) as Array<{ titulo?: string; motivo?: string }>).slice(0, 3)) {
    detalhes.push(`Recusada na conferência: "${r.titulo ?? ""}".`);
  }
  for (const c of ((p.descartados ?? []) as Array<{ titulo?: string; motivo?: string }>).slice(0, 5 - detalhes.length)) {
    detalhes.push(`Ficou de fora: "${c.titulo ?? ""}", porque ${motivoLegivel(c.motivo ?? "")}.`);
  }
  for (const e of (d.errors ?? []).slice(0, 2)) detalhes.push(`Erro técnico: ${e}`);

  let frase: string;
  if (gravados > 0) {
    frase = `O ciclo do Instagram gravou ${gravados} ${gravados === 1 ? "post" : "posts"} às ${quando}.`;
  } else if (bloqueio === "SOCIAL_PERSISTENCE_UNAVAILABLE") {
    frase =
      /*
       * Desde 07/10/2026 só a LEITURA das candidatas fecha o feed; a gravação
       * que falha segue com os posts e manda aviso (`guarda.ts`,
       * `errosDeGravacao`). A frase não diz qual das duas porque o registro de
       * 06/10, gravado antes da separação, não sabe.
       */
      `O ciclo do Instagram rodou às ${quando} e não gravou nenhum post: a camada de pautas candidatas no banco falhou nessa execução, ` +
      "e sem ela a classificação das pautas seria refeita do zero. Por regra, o dia fica sem post de notícia" +
      (escolhidas ? ` (${escolhidas} ${escolhidas === 1 ? "post foi calculado" : "posts foram calculados"} e nenhum liberado).` : ".");
  } else if (bloqueio) {
    frase = `O ciclo do Instagram rodou às ${quando} e foi bloqueado antes de escrever: ${bloqueio}.`;
  } else if (d.mode && d.mode !== "enforce") {
    frase = `O Instagram está em ensaio (${d.mode}): ${escritos} ${escritos === 1 ? "post calculado" : "posts calculados"} às ${quando}, nada gravado.`;
  } else if (p.enforcePermitido === false && escritos > 0) {
    // Fora de `enforce` o campo nasce false por padrão; só diz algo quando houve post escrito e não gravado.
    frase = `O ciclo do Instagram escreveu ${escritos} ${escritos === 1 ? "post" : "posts"} às ${quando} e não gravou nenhum: a gravação está bloqueada (${String(p.motivoDoBloqueio || "sem motivo gravado")}).`;
  } else if (conferidas === 0) {
    frase = `O ciclo do Instagram rodou às ${quando} e nenhuma pauta passou na conferência do canal.`;
  } else {
    frase =
      `O ciclo do Instagram rodou às ${quando}, conferiu ${conferidas} ${conferidas === 1 ? "pauta" : "pautas"} e não gravou nenhum post. ` +
      "Nenhuma chegou a ser escrita, e o registro dessa execução não diz por quê: o motivo do bloqueio só passou a ser gravado em 06/10/2026.";
  }

  return { gravados, frase, detalhes, quando: registro.criadoEm };
}

/** O registro mais recente do ciclo do Instagram desde um instante, ou nada. */
export async function lerDiaDoInstagram(
  client: SupabaseClient,
  projectId: string,
  desdeIso: string,
): Promise<RegistroDoInstagram | null> {
  const { data, error } = await client
    .from("platform_events")
    .select("created_at, payload")
    .eq("project_id", projectId)
    .eq("event_type", "social_cycle_diagnostic")
    .gte("created_at", desdeIso)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`[FILA] não consegui ler o diagnóstico do Instagram: ${error.message}`);
  const linha = ((data ?? []) as Array<{ created_at?: string; payload?: Record<string, unknown> }>)[0];
  return linha ? { criadoEm: String(linha.created_at ?? ""), payload: linha.payload ?? {} } : null;
}
