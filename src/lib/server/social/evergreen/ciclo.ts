import type { SupabaseClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../../editorial/guarda";
import type { CandidataPersistida } from "../../editorial/candidatos-store";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { CATALOGO_EVERGREEN } from "./catalogo";
import { candidataDoEvergreen, pautaDoEvergreen } from "./adaptador";
import { montarLastro } from "./grounding";
import type { LastroDoItem } from "./grounding";
import { modoDoEvergreen } from "./modo";
import type { ModoEvergreen } from "./modo";
import { carregarConfigDoEvergreen, selecionarEvergreen } from "./selecao";
import type { CortadoDoEvergreen } from "./selecao";
import { calcularVagas } from "./compositor";
import { identidadeDoItem } from "./tipos";
import type { TopicoEvergreen, UsoAnterior } from "./tipos";

/**
 * O que o evergreen entrega ao ciclo social do dia.
 *
 * Ele não publica, não agenda e não grava: devolve pautas prontas para entrar
 * no MESMO caminho que a notícia percorre. Copy, Social Guard, reparo, imagem,
 * agenda, congelamento, hash e publicação continuam sendo os do News V2, sem
 * uma linha de bifurcação.
 */

export type DiagnosticoDoEvergreen = {
  mode: ModoEvergreen;
  executed: boolean;
  /** Vagas que a notícia deixou. */
  vagas: number;
  /** Itens do catálogo que passaram pelas réguas de repetição. */
  elegiveis: number;
  /** Escolhidos para o dia, antes do lastro. */
  selecionados: number;
  /** Com pacote factual, e portanto publicáveis. */
  comLastro: number;
  /** Perderam por cooldown, janela, teto ou falta de vaga. */
  cortados: number;
  cortadosPorMotivo: Record<string, number>;
  /** Selecionados que a fonte oficial não sustentou. */
  semLastro: Array<{ item: string; motivo: string }>;
  custoUsd: number;
};

export function diagnosticoEvergreenAusente(mode: ModoEvergreen = "off"): DiagnosticoDoEvergreen {
  return {
    mode,
    executed: false,
    vagas: 0,
    elegiveis: 0,
    selecionados: 0,
    comLastro: 0,
    cortados: 0,
    cortadosPorMotivo: {},
    semLastro: [],
    custoUsd: 0,
  };
}

export type ResultadoDoEvergreen = {
  diagnostico: DiagnosticoDoEvergreen;
  /** Pautas para entrar como `extras` no ciclo social. */
  extras: PautaAvaliada[];
  /** As candidatas que o Social Guard exige, uma por pauta. */
  candidatas: Map<string, CandidataPersistida>;
  cortados: CortadoDoEvergreen[];
  lastros: LastroDoItem[];
};

/**
 * O histórico de uso, lido das próprias linhas já publicadas.
 *
 * Não há tabela nova: `social_posts` guarda `story_id` e `topic_id`, e o
 * evergreen grava neles a identidade do par e do tópico. A régua de repetição
 * então pergunta ao mesmo lugar que registra a publicação, o que evita o
 * problema clássico de um histórico paralelo divergir do que foi ao ar.
 */
export async function historicoDoEvergreen(
  client: SupabaseClient,
  projectId: string,
  desdeIso: string,
): Promise<UsoAnterior[]> {
  const { data, error } = await client
    .from("social_posts")
    .select("story_id, topic_id, scheduled_at, created_at")
    .eq("project_id", projectId)
    .eq("origin_channel", "evergreen")
    .gte("created_at", desdeIso);

  if (error || !data) return [];

  return data
    .filter((r) => typeof r.story_id === "string" && String(r.story_id).startsWith("evg:"))
    .map((r) => ({
      storyId: r.story_id as string,
      topicId: (r.topic_id as string) ?? "",
      quandoIso: (r.scheduled_at as string) ?? (r.created_at as string) ?? desdeIso,
    }));
}

export type OpcoesDoEvergreen = {
  projectId: string;
  /** Quantas pautas de notícia o dia já tem. */
  noticiasNoDia: number;
  /** Teto global do dia. `SOCIAL_POSTS_MAX_PER_DAY`. */
  maximoPorDia: number;
  /** Programas que a notícia trouxe hoje, para a diversidade do feed. */
  programasDaNoticia?: string[];
  historico: UsoAnterior[];
  agoraMs: number;
  catalogo?: TopicoEvergreen[];
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  modoForcado?: ModoEvergreen;
  /** Trocado em teste, para não buscar fonte oficial na rede. */
  montarLastroDosItens?: typeof montarLastro;
};

export async function prepararEvergreen(opcoes: OpcoesDoEvergreen): Promise<ResultadoDoEvergreen> {
  const env = opcoes.env ?? process.env;
  const modo = opcoes.modoForcado ?? modoDoEvergreen(env);
  const diagnostico = diagnosticoEvergreenAusente(modo);
  const vazio: ResultadoDoEvergreen = {
    diagnostico,
    extras: [],
    candidatas: new Map(),
    cortados: [],
    lastros: [],
  };

  if (modo === "off") return vazio;

  const vagas = calcularVagas(opcoes.noticiasNoDia, opcoes.maximoPorDia);
  diagnostico.vagas = vagas.restantes;
  diagnostico.executed = true;

  if (vagas.restantes === 0) return vazio;

  const selecao = selecionarEvergreen(
    opcoes.catalogo ?? CATALOGO_EVERGREEN,
    opcoes.historico,
    vagas.restantes,
    {
      agoraMs: opcoes.agoraMs,
      config: carregarConfigDoEvergreen(env),
      ocupacaoDoDia: { programas: opcoes.programasDaNoticia ?? [] },
    },
  );

  diagnostico.elegiveis = selecao.elegiveis;
  diagnostico.selecionados = selecao.escolhidos.length;
  diagnostico.cortados = selecao.cortados.length;
  for (const c of selecao.cortados) {
    diagnostico.cortadosPorMotivo[c.motivo] = (diagnostico.cortadosPorMotivo[c.motivo] ?? 0) + 1;
  }

  if (selecao.escolhidos.length === 0) {
    return { ...vazio, diagnostico, cortados: selecao.cortados };
  }

  /*
   * O lastro vem antes da copy, e item sem lastro não vira post.
   *
   * A tentação do evergreen é o modelo escrever de memória: ele "sabe" o que é
   * um EB-2 NIW. É assim que sai um post afirmando requisito que não existe
   * mais, com a confiança de quem está lendo a lei.
   */
  const montar = opcoes.montarLastroDosItens ?? montarLastro;
  const r = await montar(selecao.escolhidos, { env, fetcher: opcoes.fetcher });
  diagnostico.custoUsd = r.custoUsd;

  const extras: PautaAvaliada[] = [];
  const candidatas = new Map<string, CandidataPersistida>();

  for (const lastro of r.lastros) {
    if (!lastro.pacote) {
      diagnostico.semLastro.push({
        item: lastro.storyId,
        motivo: lastro.motivo ?? "sem pacote factual",
      });
      continue;
    }

    extras.push(pautaDoEvergreen(lastro.item, lastro.pacote));
    candidatas.set(
      identidadeDoItem(lastro.item),
      candidataDoEvergreen(lastro.item) as unknown as CandidataPersistida,
    );
  }

  diagnostico.comLastro = extras.length;

  return { diagnostico, extras, candidatas, cortados: selecao.cortados, lastros: r.lastros };
}

/** Os pacotes factuais, na chave que o gerador espera. */
export function pacotesDoEvergreen(lastros: LastroDoItem[]): Map<string, PacoteFactual> {
  const mapa = new Map<string, PacoteFactual>();
  for (const l of lastros) if (l.pacote) mapa.set(l.storyId, l.pacote);
  return mapa;
}
