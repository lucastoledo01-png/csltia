import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../capacidades";
import { ambientePelaCadencia, cadenciaDoProjeto, canalPublicaEm, type ProjetoComCadencia } from "../cadencia";
import type { PautaAvaliada } from "../editorial/guarda";
import type { Calor } from "../editorial/calor";
import { zonedTimeToUtc } from "../time";

/**
 * A notícia quente no MESMO dia (06/10/2026), decisão 7 do dono sobre a
 * auditoria da notícia quente.
 *
 * O problema medido: o nosso post sai em mediana 31 horas depois de a fonte
 * publicar, porque a coleta é das 06:03 (ou das 17:00 da véspera) e o post vai
 * para a grade do dia seguinte. O Not Journal publica no dia do fato em dois
 * de cada três posts. A história que estourou às 11h só chega ao nosso feed
 * amanhã, quando já é velha.
 *
 * A saída é um ciclo da tarde, SÓ do Instagram: coleta de novo, passa pela
 * mesma guarda, calcula o calor do que é novo, e preenche as vagas LIVRES de
 * hoje com o que está quente agora. Nada de newsletter nem de portal: a
 * newsletter já saiu e é uma por dia; o portal tem a régua dele.
 *
 * O que ele respeita, porque é o mesmo ciclo social de sempre por baixo
 * (`rodarSocialDoDia`):
 *
 *   o teto do dia          conta o que hoje já tem post, e só preenche o resto
 *   a cadência             só os horários do Instagram de hoje que ainda não
 *                          passaram e não têm post perto; dia que o Instagram
 *                          não publica, nada
 *   a repetição do feed    o histórico do feed é lido INCLUINDO hoje, para o
 *                          post da manhã não voltar à tarde com outra manchete
 *   a fila de aprovação    o store do ciclo social é o mesmo, então com a fila
 *                          em `enforce` o post entra como rascunho na fila
 *   a foto                 pauta sem foto não vira post, a regra de 05/10
 *
 * A capacidade é própria, `settings.capacidades.quente_da_tarde`, sem fallback
 * de ambiente: ausente vale `off`. Em `dry_run` roda tudo com o social forçado
 * em ensaio (nenhuma linha em `social_posts`) e grava em `platform_events`
 * (`quente_da_tarde`) o que publicaria; o único outro rastro no banco é o
 * cache de classificação das candidatas, que a coleta da manhã já grava.
 */

export const EVENTO_DA_TARDE = "quente_da_tarde";

export function modoDaQuenteDaTarde(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("quente_da_tarde", () => "off", projeto);
}

/** O que o projeto pode ajustar em `settings.quente_da_tarde`. */
export type ConfigDaTarde = {
  /** Hora local em que o relógio da rota roda o ciclo (`?relogio=1`). */
  horario: string;
  /** Só entra pauta publicada na fonte há no máximo estas horas. */
  janelaHoras: number;
  /** Calor mínimo, de 0 a 100, para a pauta contar como quente. */
  calorMinimo: number;
  /** Teto de posts deste ciclo, abaixo do que sobrar do teto do dia. */
  maximoDePosts: number;
};

/*
 * Os padrões, e por quê:
 *
 *   15:30   depois do horário das 14:45 e antes do das 18:07: a coleta pega a
 *           manhã inteira e ainda sobram duas vagas da grade do PRD
 *   10 h    o que a fonte publicou desde as 05:30; mais velho que isso já
 *           passou pela coleta da manhã e foi julgado lá
 *   35      três veículos (18) mais publicação de até 6 h (10) não chegam a
 *           35; é preciso um terceiro sinal (tendência, fama, número). Dia sem
 *           nada quente é dia sem post extra, e isso é o certo
 *   2       metade das vagas da tarde, para a grade não virar só calor
 */
export const CONFIG_DA_TARDE_PADRAO: ConfigDaTarde = {
  horario: "15:30",
  janelaHoras: 10,
  calorMinimo: 35,
  maximoDePosts: 2,
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Campo inválido cai no padrão daquele campo, a mesma regra da cadência. */
export function configDaTarde(projeto?: { settings?: Record<string, unknown> | null } | null): ConfigDaTarde {
  const s = projeto?.settings;
  const bruto = s && typeof s === "object" ? (s as Record<string, unknown>).quente_da_tarde : null;
  const o = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const numero = (v: unknown, padrao: number, min: number, max: number) => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : padrao;
  };
  const p = CONFIG_DA_TARDE_PADRAO;
  return {
    horario: typeof o.horario === "string" && HORA.test(o.horario) ? o.horario : p.horario,
    janelaHoras: numero(o.janela_horas, p.janelaHoras, 1, 24),
    calorMinimo: numero(o.calor_minimo, p.calorMinimo, 0, 100),
    maximoDePosts: Math.floor(numero(o.maximo_posts, p.maximoDePosts, 1, 5)),
  };
}

/** Janela do relógio da rota, a mesma da produção: o cron chama de 15 em 15. */
export const JANELA_DO_RELOGIO_DA_TARDE_MIN = 15;

export function horaLocal(agora: Date, timezone: string): { data: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  const hora = `${v("hour") === "24" ? "00" : v("hour")}:${v("minute")}`;
  return { data: `${v("year")}-${v("month")}-${v("day")}`, hora };
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function chegouAHoraDaTarde(config: ConfigDaTarde, agora: Date, timezone: string): { naJanela: boolean; agoraLocal: string; horario: string } {
  const { hora } = horaLocal(agora, timezone);
  const diferenca = minutos(hora) - minutos(config.horario);
  return { naJanela: diferenca >= 0 && diferenca < JANELA_DO_RELOGIO_DA_TARDE_MIN, agoraLocal: hora, horario: config.horario };
}

/** O que hoje já tem no feed, só o que a vaga precisa saber. */
export type PostDoDia = {
  status: string | null;
  scheduled_at: string | null;
  error_message?: string | null;
  dry_run?: boolean | null;
};

/**
 * Post que ocupa vaga: agendado, publicado, ou rascunho na fila. O rascunho
 * CANCELADO à mão não ocupa (o status `cancelled` não existe na tabela, e o
 * cancelamento vira `draft` com o motivo começando por CANCELADO; ver
 * `aprendizados-e-incidentes.md`), e o `failed` também não. Linha de ensaio
 * (`dry_run`) não vai ao ar e não ocupa.
 */
export function ocupaVaga(p: PostDoDia): boolean {
  if (p.dry_run === true) return false;
  if (p.status === "scheduled" || p.status === "published") return true;
  if (p.status === "draft") return !(p.error_message ?? "").trim().toUpperCase().startsWith("CANCELADO");
  return false;
}

export type VagasDaTarde = {
  /** Os horários de hoje, hora local, ainda livres e no futuro. */
  horarios: string[];
  /** Quantos posts este ciclo pode gravar. */
  teto: number;
  ocupadas: number;
  motivo: string;
};

/**
 * As vagas livres de hoje.
 *
 * Um horário está livre quando ainda não passou (mais a folga para o ciclo
 * terminar) e não há post do dia agendado a menos do espaçamento dele. O teto
 * é o menor entre: o que sobra do teto do dia, os horários livres e o máximo
 * do ciclo.
 */
export function vagasDaTarde(entrada: {
  horarios: string[];
  dataIso: string;
  timezone: string;
  agoraMs: number;
  postsDoDia: PostDoDia[];
  maximoDoDia: number;
  maximoDoCiclo: number;
  folgaMinutos?: number;
  espacamentoMinutos?: number;
}): VagasDaTarde {
  const folga = (entrada.folgaMinutos ?? 30) * 60_000;
  const espacamento = (entrada.espacamentoMinutos ?? 45) * 60_000;
  const ocupando = entrada.postsDoDia.filter(ocupaVaga);
  const instantesOcupados = ocupando
    .map((p) => Date.parse(p.scheduled_at ?? ""))
    .filter((t) => Number.isFinite(t));

  const livres = entrada.horarios.filter((h) => {
    const t = zonedTimeToUtc(entrada.dataIso, h, entrada.timezone).getTime();
    if (t < entrada.agoraMs + folga) return false;
    return !instantesOcupados.some((o) => Math.abs(o - t) < espacamento);
  });

  const sobraDoDia = Math.max(0, entrada.maximoDoDia - ocupando.length);
  const teto = Math.min(sobraDoDia, livres.length, entrada.maximoDoCiclo);
  const motivo =
    sobraDoDia === 0
      ? `o dia já tem ${ocupando.length} post(s), o teto é ${entrada.maximoDoDia}`
      : livres.length === 0
        ? "nenhum horário do Instagram de hoje está livre e no futuro"
        : `${teto} vaga(s): ${livres.slice(0, teto).join(", ")}`;
  return { horarios: livres, teto, ocupadas: ocupando.length, motivo };
}

export type QuenteEscolhida = { pauta: PautaAvaliada; calor: number; horas: number | null };

/**
 * As pautas quentes e novas, da mais quente para a menos.
 *
 * Nova é a publicada na fonte dentro da janela; quente é a que passa do calor
 * mínimo. As duas condições juntas, de propósito: a pauta quente de ontem já
 * teve a vez dela na grade de hoje, e a novidade fria não justifica um post
 * fora da produção.
 */
export function escolherQuentes(
  pool: PautaAvaliada[],
  porStory: Map<string, Calor>,
  opcoes: { janelaHoras: number; calorMinimo: number; agoraMs: number; limite: number },
): { escolhidas: QuenteEscolhida[]; descartadas: Array<{ titulo: string; motivo: string }> } {
  const escolhidas: QuenteEscolhida[] = [];
  const descartadas: Array<{ titulo: string; motivo: string }> = [];
  for (const p of pool) {
    const c = porStory.get(p.storyId);
    const t = Date.parse(p.grupo.primary.published_at ?? "");
    const horas = Number.isFinite(t) ? (opcoes.agoraMs - t) / 3_600_000 : null;
    const titulo = p.grupo.primary.title.slice(0, 100);
    if (horas === null || horas > opcoes.janelaHoras) {
      descartadas.push({ titulo, motivo: horas === null ? "sem data na fonte" : `publicada há ${horas.toFixed(1)} h` });
      continue;
    }
    if (!c || c.total < opcoes.calorMinimo) {
      descartadas.push({ titulo, motivo: `calor ${c?.total ?? 0} abaixo de ${opcoes.calorMinimo}` });
      continue;
    }
    escolhidas.push({ pauta: p, calor: c.total, horas });
  }
  escolhidas.sort((a, b) => b.calor - a.calor || b.pauta.pontuacao.total - a.pauta.pontuacao.total);
  return { escolhidas: escolhidas.slice(0, opcoes.limite), descartadas };
}

/**
 * O ambiente que o ciclo social lê, com a grade reduzida às vagas livres.
 *
 * O ciclo social lê horário e teto do ambiente (`agenda.ts`, `selecao.ts`), e
 * a cadência chega a ele por `ambientePelaCadencia`, como na produção da
 * véspera. Aqui a grade é só a das vagas livres, e o teto é o do ciclo.
 */
export function ambienteDaTarde(
  projeto: ProjetoComCadencia,
  env: Record<string, string | undefined>,
  vagas: VagasDaTarde,
): Record<string, string | undefined> {
  const base = ambientePelaCadencia(cadenciaDoProjeto(projeto), env);
  const horarios = vagas.horarios.slice(0, Math.max(1, vagas.teto));
  return {
    ...base,
    SOCIAL_HORARIOS: horarios.join(","),
    SOCIAL_JANELA_INICIO: horarios[0],
    SOCIAL_JANELA_FIM: horarios[horarios.length - 1],
    SOCIAL_POSTS_MAX_PER_DAY: String(vagas.teto),
    SOCIAL_POSTS_TARGET_PER_DAY: String(vagas.teto),
    SOCIAL_POSTS_MIN_PER_DAY: "0",
  };
}

/** O Instagram publica hoje, pela cadência do projeto? */
export function instagramPublicaHoje(projeto: ProjetoComCadencia, dataIso: string): boolean {
  return canalPublicaEm(cadenciaDoProjeto(projeto), "instagram", dataIso);
}

export type DesfechoDaTarde = {
  ok: boolean;
  modo: EstadoDaCapacidade;
  data: string;
  motivo:
    | "OFF"
    | "INSTAGRAM_NAO_PUBLICA_HOJE"
    | "SEM_VAGA"
    | "NADA_QUENTE"
    | "RODOU"
    | "FALHOU";
  explicacao: string;
  vagas?: VagasDaTarde;
  quentes?: Array<{ titulo: string; calor: number; horas: number | null }>;
  posts?: { selecionados: number; gravados: number; titulos: string[] };
  erro?: string;
};

export async function gravarDesfechoDaTarde(
  client: Pick<SupabaseClient, "from"> | null,
  projectId: string,
  desfecho: DesfechoDaTarde,
): Promise<string | null> {
  if (!client) return "sem cliente do banco";
  try {
    const { error } = await client
      .from("platform_events")
      .insert({ event_type: EVENTO_DA_TARDE, project_id: projectId, payload: desfecho });
    return error ? error.message : null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
