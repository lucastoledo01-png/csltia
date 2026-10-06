import type { SupabaseClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../editorial/guarda";
import type { ConfigEditorial } from "../editorial/config";
import type { Entidades } from "../editorial/fingerprint";
import type { RegistroHistorico } from "../editorial/history";
import { gerarStoryId } from "../editorial/history";
import { verificarRepeticao } from "../editorial/repeticao";
import { entidadesDaClassificacao } from "../editorial/classificador";
import { urlCanonica } from "../editorial/url-canonica";
import { LeituraFalhou, comRetentativa } from "../leitura";

/**
 * O que o feed do Instagram já levou, lido de onde o feed mora.
 *
 * Em 06/10/2026 uma leitura dos últimos 60 posts achou 21 deles contando 9
 * pautas em dias seguidos: a mesma candidata, com a mesma URL e o mesmo
 * `story_id`, voltando ao pool no dia seguinte e virando post outra vez, com a
 * manchete reescrita. A régua de repetição existia e rodava, mas sobre o
 * histórico da NEWSLETTER: o pool do Instagram é o `approvedEditorialPool`,
 * filtrado pela guarda com `canal: "newsletter"`, e o ciclo social nunca
 * perguntava ao próprio canal. A pergunta ao canal `instagram` do
 * `editorial_history` também não salvaria: nenhum caminho de produção gravou
 * uma linha ali, e as oito que existem são do backfill de 05/09.
 *
 * Por isso a fonte aqui é `social_posts`, e não `editorial_history`:
 *
 *   - é o registro de verdade do que foi ao feed, gravado pelo mesmo store que
 *     agenda o post, sem um segundo passo que possa falhar calado;
 *   - tem `edition_date` e `status`, que o histórico editorial não tem. Sem a
 *     data, a reexecução do dia (que é rotina) veria os posts que ela mesma
 *     agendou de manhã e trocaria a pauta por outra, e o dia ganharia posts.
 *     Sem o status, o post que o editor cancelou na fila contaria como
 *     publicado.
 *
 * O `editorial_history` continua recebendo a linha `instagram` (ver
 * `registrarNoHistoricoEditorial`), porque relatório e auditoria leem dali.
 * Mas a régua do feed não depende dela.
 */

/**
 * Status que contam como "o feed já tem isto".
 *
 * `draft` entra porque, com a fila de aprovação ligada, é assim que o post
 * espera o editor: ele vai ao ar se for aprovado, e a pauta dele não pode
 * nascer de novo amanhã enquanto isso. Ficam de fora `failed` (não foi ao ar)
 * e `cancelled` (o editor descartou).
 */
export const STATUS_QUE_CONTAM = new Set(["draft", "generated", "approved", "scheduled", "publishing", "published"]);

type CandidataDaLinha = {
  url?: string | null;
  canonical_url?: string | null;
  title?: string | null;
  summary?: string | null;
  embedding?: number[] | string | null;
  actors?: string[] | null;
  places?: string[] | null;
  event_terms?: string[] | null;
  source_domain?: string | null;
};

export type LinhaDoFeed = {
  id: string;
  platform?: string | null;
  edition_date: string | null;
  title: string | null;
  status: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  story_id: string | null;
  event_fingerprint?: string | null;
  candidate_id?: string | null;
  news_candidates?: CandidataDaLinha | CandidataDaLinha[] | null;
};

export const COLUNAS_DO_FEED =
  "id,platform,edition_date,title,status,scheduled_at,published_at,created_at,story_id,event_fingerprint,candidate_id," +
  "news_candidates(url,canonical_url,title,summary,embedding,actors,places,event_terms,source_domain)";

function vetorDe(v: CandidataDaLinha["embedding"]): number[] | null {
  if (Array.isArray(v)) return v.length > 0 ? v : null;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const lido = JSON.parse(v) as unknown;
      return Array.isArray(lido) && lido.length > 0 ? (lido as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Linhas de `social_posts` como registros do canal `instagram`.
 *
 * O título do registro é o da MATÉRIA de origem quando a candidata existe, e
 * não a manchete do post. A régua compara título com título da fonte: a
 * manchete em português, reescrita a cada dia, é justamente o que fazia o
 * mesmo fato parecer outro.
 */
export function registrosDoFeed(
  linhas: LinhaDoFeed[],
  projectId: string,
  opcoes: { excetoData?: string } = {},
): RegistroHistorico[] {
  const saida: RegistroHistorico[] = [];
  for (const l of linhas) {
    if (l.platform && l.platform !== "instagram") continue;
    if (!STATUS_QUE_CONTAM.has(String(l.status ?? ""))) continue;
    /*
     * O próprio dia fica de fora: a composição do dia e a chave de
     * idempotência já cuidam dele, e contá-lo aqui faria a reexecução trocar
     * as pautas que ela mesma agendou.
     */
    if (opcoes.excetoData && l.edition_date === opcoes.excetoData) continue;

    const c = Array.isArray(l.news_candidates) ? (l.news_candidates[0] ?? null) : (l.news_candidates ?? null);
    const url = c?.canonical_url || c?.url || "";
    const entidades: Entidades | undefined =
      c && ((c.actors?.length ?? 0) > 0 || (c.event_terms?.length ?? 0) > 0)
        ? { atores: c.actors ?? [], lugares: c.places ?? [], acontecimento: c.event_terms ?? [] }
        : undefined;

    saida.push({
      id: l.id,
      projectId,
      storyId: l.story_id || `social_${l.id}`,
      canal: "instagram",
      titulo: c?.title || l.title || "",
      resumo: c?.summary ?? "",
      url,
      urlCanonica: url ? urlCanonica(url) : "",
      dominio: c?.source_domain ?? undefined,
      entidades,
      impressao: l.event_fingerprint ?? undefined,
      vetor: vetorDe(c?.embedding ?? null),
      instagramPostId: l.id,
      procedencia: "social_posts",
      publicadoEm: l.published_at || l.scheduled_at || l.created_at || undefined,
    });
  }
  return saida;
}

/**
 * Lê o feed da janela de repetição.
 *
 * Só `select`, `eq` e `gte`, sem ordenação: a régua não depende de ordem, e a
 * cadeia curta é a que os dublês de banco dos testes já respondem.
 */
export async function lerHistoricoDoFeed(
  client: SupabaseClient,
  projectId: string,
  dias: number,
  opcoes: { excetoData?: string; agoraMs?: number } = {},
): Promise<RegistroHistorico[]> {
  const agora = opcoes.agoraMs ?? Date.now();
  const corte = new Date(agora - Math.max(1, dias) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const linhas = await comRetentativa(`feed do Instagram de ${projectId}`, async () => {
    const r = await client
      .from("social_posts")
      .select(COLUNAS_DO_FEED)
      .eq("project_id", projectId)
      .gte("edition_date", corte);
    if (r.error) throw new LeituraFalhou(`Feed do Instagram, leitura falhou: ${r.error.message}`);
    return (r.data ?? []) as unknown as LinhaDoFeed[];
  });
  return registrosDoFeed(linhas, projectId, opcoes);
}

/**
 * O histórico de sempre, com o canal `instagram` vindo do feed.
 *
 * As linhas `instagram` do `editorial_history` saem: são registro, não régua
 * (ver o comentário do topo), e não têm data de edição nem status para a
 * régua separar o dia corrente e o post cancelado.
 */
export function comHistoricoDoFeed(
  historico: RegistroHistorico[],
  doFeed: RegistroHistorico[],
): RegistroHistorico[] {
  return [...historico.filter((h) => h.canal !== "instagram"), ...doFeed];
}

export type RepetidaNoFeed = { storyId: string; titulo: string; motivo: string };

/**
 * A mesma pergunta que a newsletter e o portal fazem ao próprio canal, feita
 * ao feed.
 *
 * Antes de `verificarRepeticao`, o `story_id` igual: ele é a URL canônica
 * resumida, e é o sinal que os 21 posts repetidos tinham em comum. A régua
 * inteira vem depois, com os limiares de repetição histórica (0.85 certo, e a
 * faixa de 0.72 confirmada por entidade), e não com o 0.70 do agrupamento do
 * dia: são perguntas diferentes, como `decisoes.md` registra.
 */
export function repeticaoNoFeed(
  pauta: { storyId?: string; titulo: string; url?: string; resumo?: string; publicadoEm?: string; entidades?: Entidades; vetor?: number[] | null },
  historico: RegistroHistorico[],
  config: ConfigEditorial,
): string | null {
  const doFeed = historico.filter((h) => h.canal === "instagram");
  if (doFeed.length === 0) return null;
  if (pauta.storyId) {
    const mesma = doFeed.find((h) => h.storyId === pauta.storyId);
    if (mesma) return `mesma pauta de "${mesma.titulo.slice(0, 80)}", já no feed`;
  }
  const veredito = verificarRepeticao(
    {
      titulo: pauta.titulo,
      url: pauta.url,
      resumo: pauta.resumo,
      publicadoEm: pauta.publicadoEm,
      entidades: pauta.entidades,
      vetor: pauta.vetor ?? null,
    },
    doFeed,
    "instagram",
    config,
  );
  return veredito.repetida ? veredito.explicacao : null;
}

/** O pool do dia sem o que o feed já levou. */
export function foraDoFeed(
  pool: PautaAvaliada[],
  historico: RegistroHistorico[],
  config: ConfigEditorial,
): { pool: PautaAvaliada[]; repetidas: RepetidaNoFeed[] } {
  const repetidas: RepetidaNoFeed[] = [];
  const saida = pool.filter((p) => {
    const motivo = repeticaoNoFeed(
      {
        storyId: p.storyId,
        titulo: p.grupo.primary.title,
        url: p.grupo.primary.url,
        resumo: p.enriquecimento?.texto,
        publicadoEm: p.grupo.primary.published_at,
        entidades: p.classificacao ? entidadesDaClassificacao(p.classificacao) : undefined,
        vetor: p.vetor,
      },
      historico,
      config,
    );
    if (motivo) repetidas.push({ storyId: p.storyId, titulo: p.grupo.primary.title, motivo });
    return !motivo;
  });
  return { pool: saida, repetidas };
}

/**
 * As pautas da edição que o agendador legado ainda pode levar ao feed.
 *
 * O legado agenda um post por pauta da NEWSLETTER, e a edição passou pela
 * régua do e-mail. A história não tem vetor nem entidade aqui, então valem a
 * URL, o `story_id` que a URL gera e o título, que são as camadas que pegam a
 * mesma matéria voltando.
 */
export function foraDoFeedDaEdicao<T extends { title: string; source_url: string; summary?: string }>(
  historias: T[],
  historico: RegistroHistorico[],
  config: ConfigEditorial,
): { historias: T[]; repetidas: RepetidaNoFeed[] } {
  const repetidas: RepetidaNoFeed[] = [];
  const saida = historias.filter((h) => {
    const canonica = h.source_url ? urlCanonica(h.source_url) : "";
    const motivo = repeticaoNoFeed(
      {
        storyId: canonica ? gerarStoryId({ url: canonica }) : undefined,
        titulo: h.title,
        url: h.source_url || undefined,
        resumo: h.summary,
      },
      historico,
      config,
    );
    if (motivo) repetidas.push({ storyId: canonica, titulo: h.title, motivo });
    return !motivo;
  });
  return { historias: saida, repetidas };
}

/**
 * O registro `instagram` do `editorial_history` para um post agendado.
 *
 * Sem foto de propósito: a memória de foto do histórico é lida por todos os
 * canais (`imagemJaUsada`), e a mesma pauta leva a MESMA foto no portal, no
 * post e na newsletter. Gravar a foto do post aqui faria a newsletter de
 * amanhã recusar a foto que é dela.
 */
export function registroDoPost(
  pauta: PautaAvaliada,
  dados: { projectId: string; socialPostId: string; publicadoEm: string },
): RegistroHistorico {
  const c = pauta.classificacao;
  return {
    projectId: dados.projectId,
    storyId: pauta.storyId,
    canal: "instagram",
    tipo: "post",
    titulo: pauta.grupo.primary.title,
    resumo: pauta.grupo.primary.description ?? "",
    url: pauta.grupo.primary.url,
    entidades: c ? entidadesDaClassificacao(c) : undefined,
    categoria: c?.eixo,
    pais: c?.pais,
    sentimento: c?.leitura === "oportunidade" ? "positive" : c?.leitura === "desfavoravel" ? "negative" : "neutral",
    vetor: pauta.vetor,
    instagramPostId: dados.socialPostId,
    procedencia: "pipeline",
    motivo: pauta.motivoDaAprovacao ?? null,
    publicadoEm: dados.publicadoEm,
  };
}
