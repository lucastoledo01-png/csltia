import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import type { ConfigEditorial } from "../editorial/config";
import { cosseno } from "../editorial/embeddings";
import { MOTIVOS } from "../editorial/config";
import { verificarRepeticao } from "../editorial/repeticao";
import { entidadesDaClassificacao } from "../editorial/classificador";
import type { OrigemDoArtigo } from "../ramos/portal";
import type { ContextoDeProducao, PautaDoContexto } from "./contrato";

/**
 * O contexto de produção de uma peça: gravar na entrada da fila e remontar
 * quando a peça é antiga (06/10/2026).
 *
 * A refação de cada etapa precisa da pauta, do pacote factual e, na seleção,
 * do pool do dia. Nada disso sobrevivia ao ciclo. As peças novas levam o
 * contexto em `resumo.contexto`; as anteriores a esta data são remontadas das
 * tabelas dos canais e de `news_candidates`, e quando nem isso dá, a refação
 * diz no painel o que faltou, em vez de ficar em `refazendo` sem desfecho.
 */

/** O texto que sustenta a pauta tem o mesmo teto de `news_candidates.summary`. */
export const TETO_DO_RESUMO = 4000;

export function pautaDoContexto(p: PautaAvaliada): PautaDoContexto {
  return {
    storyId: p.storyId,
    titulo: p.grupo.primary.title,
    url: p.grupo.primary.url,
    fonteNome: p.grupo.primary.source_name,
    publicadoEm: p.grupo.primary.published_at,
    resumo: (p.enriquecimento?.texto ?? "").slice(0, TETO_DO_RESUMO),
    categoria: p.grupo.primary.category ?? "",
    eixo: String(p.classificacao.eixo ?? ""),
    pais: String(p.classificacao.pais ?? ""),
    atores: p.classificacao.atores ?? [],
    lugares: p.classificacao.lugares ?? [],
    acontecimento: p.classificacao.acontecimento ?? [],
    urlsSecundarias: p.grupo.secondary_urls ?? [],
    fontesSecundarias: p.grupo.secondary_sources ?? [],
  };
}

export function pautaDaOrigemDoArtigo(o: OrigemDoArtigo): PautaDoContexto {
  return {
    storyId: o.storyId,
    titulo: o.titulo,
    url: o.fonteUrl,
    fonteNome: o.fonteNome,
    publicadoEm: "",
    resumo: o.resumo.slice(0, TETO_DO_RESUMO),
    categoria: o.eixo,
    eixo: o.eixo,
    pais: o.pais,
    atores: o.atores,
    lugares: o.lugares,
    acontecimento: o.acontecimento,
  };
}

/** A pauta a partir da candidata gravada: o caminho das peças antigas e da seleção refeita. */
export function pautaDaCandidata(c: CandidataPersistida): PautaDoContexto {
  const k = c.classificacao;
  return {
    storyId: c.storyId,
    titulo: c.title,
    url: c.canonicalUrl || c.url,
    fonteNome: c.sourceDomain ?? "",
    publicadoEm: "",
    resumo: c.summary.slice(0, TETO_DO_RESUMO),
    categoria: String(k?.eixo ?? ""),
    eixo: String(k?.eixo ?? ""),
    pais: String(k?.pais ?? ""),
    atores: k?.atores ?? [],
    lugares: k?.lugares ?? [],
    acontecimento: k?.acontecimento ?? [],
  };
}

/**
 * A pauta avaliada de volta, para as funções do ciclo que a pedem inteira.
 *
 * O que não foi gravado (o veredito de repetição, as partes da nota) volta
 * neutro, e isso é seguro porque quem chama já conferiu repetição e linha
 * editorial antes (`elegivelNoCanal`). A classificação e o vetor vêm da
 * candidata quando ela existe, que é a leitura que a guarda fez naquele dia.
 */
export function pautaAvaliadaDoContexto(pc: PautaDoContexto, candidata?: CandidataPersistida | null): PautaAvaliada {
  const k = candidata?.classificacao;
  const classificacao = {
    pais: (k?.pais ?? pc.pais) || "EUA",
    imigracao: k?.imigracao ?? false,
    leitura: k?.leitura ?? "oportunidade",
    eixo: (k?.eixo ?? pc.eixo) || "outro",
    natureza: k?.natureza ?? "outro",
    relevancia: k?.relevancia ?? 5,
    atores: k?.atores ?? pc.atores,
    lugares: k?.lugares ?? pc.lugares,
    acontecimento: k?.acontecimento ?? pc.acontecimento,
    justificativa: k?.justificativa ?? "",
  } as unknown as PautaAvaliada["classificacao"];
  const total = candidata?.editorialScore ?? 50;
  return {
    storyId: pc.storyId,
    grupo: {
      primary: {
        id: candidata?.id ?? pc.storyId,
        url: pc.url,
        title: pc.titulo,
        source_name: pc.fonteNome,
        priority: 1,
        published_at: pc.publicadoEm || new Date().toISOString(),
        description: pc.resumo.slice(0, 500),
        content: pc.resumo,
        category: pc.categoria,
        score: total,
        dedupe_key: pc.storyId,
        window_hours: 48,
      },
      secondary_sources: pc.fontesSecundarias ?? [],
      secondary_urls: pc.urlsSecundarias ?? [],
    },
    classificacao,
    enriquecimento: {
      texto: pc.resumo,
      contentSource: "feed",
      contentLength: pc.resumo.length,
      enrichmentStatus: "reaproveitado",
      enrichmentSources: [pc.url],
      notas: ["remontada da fila de aprovação para a refação"],
    } as unknown as PautaAvaliada["enriquecimento"],
    motivoDaAprovacao: MOTIVOS.APROVADO_OPORTUNIDADE_EUA,
    veredito: {
      repetida: false,
      motivo: null,
      conflito: null,
      camada: "nenhuma",
      score: 0,
      confianca: "alta",
      sinais: null,
    } as unknown as PautaAvaliada["veredito"],
    pontuacao: {
      total,
      partes: { relevancia: classificacao.relevancia, ineditismo: 0, credibilidade: 0, frescor: 0, corpo: 0 },
      explicacao: "remontada da candidata gravada",
    },
    vetor: candidata?.embedding ?? null,
  };
}

/** O contexto das peças novas, montado onde a pauta avaliada ainda existe. */
export function montarContexto(entrada: {
  data: string;
  pautas: PautaAvaliada[];
  pacotes?: Map<string, PacoteFactual> | Record<string, PacoteFactual>;
  /** As pacotes vêm por URL (o cache da redação) ou por storyId. */
  pacotesPorUrl?: boolean;
  pool?: PautaAvaliada[] | string[];
  imagens?: Map<string, string>;
  legendas?: Map<string, string>;
}): ContextoDeProducao {
  const pacotes: Record<string, PacoteFactual> = {};
  const fonte = entrada.pacotes instanceof Map ? entrada.pacotes : new Map(Object.entries(entrada.pacotes ?? {}));
  for (const p of entrada.pautas) {
    const pacote = fonte.get(entrada.pacotesPorUrl ? p.grupo.primary.url : p.storyId);
    if (pacote) pacotes[p.storyId] = pacote;
  }
  return {
    versao: 1,
    data: entrada.data,
    pautas: entrada.pautas.map(pautaDoContexto),
    ...(Object.keys(pacotes).length ? { pacotes } : {}),
    ...(entrada.pool
      ? { pool: entrada.pool.map((p) => (typeof p === "string" ? p : p.storyId)).filter(Boolean) }
      : {}),
    ...(entrada.imagens ? { imagens: Object.fromEntries(entrada.imagens) } : {}),
    ...(entrada.legendas ? { legendas: Object.fromEntries(entrada.legendas) } : {}),
  };
}

// ---------------------------------------------------------------------------
// A régua do canal, para a seleção refeita
// ---------------------------------------------------------------------------

export type MotivoDeFora =
  | "JA_NO_CANAL"
  | "NAO_APROVADA"
  | "IMIGRACAO"
  | "SEM_CLASSIFICACAO"
  | "MESMO_ACONTECIMENTO"
  | "REPETIDA_NO_CANAL";

/**
 * Se uma candidata do pool pode entrar NESTE canal, hoje, no lugar da reprovada.
 *
 * As mesmas réguas do ramo, na ordem do ramo: aprovada pela linha editorial
 * (o que já inclui fonte, enriquecimento e negatividade), imigração fora
 * (decisão de 05/10/2026, pelo booleano OU pelo eixo), nenhuma peça do canal
 * com a mesma pauta, nenhum acontecimento repetido no canal no dia (o cosseno
 * de `limiarDeAgrupamento`, 0.70, contra as pautas que o canal já tem) e nada
 * que o canal já publicou nos dias anteriores (`verificarRepeticao`). A foto e
 * o pacote factual são conferidos depois, por quem chama, porque custam
 * chamada: só a candidata que passou aqui paga por eles.
 */
export function motivoDeFora(
  c: CandidataPersistida,
  canal: { storyIds: Set<string>; vetores: Array<number[] | null>; impressoes?: Set<string> },
  historico: { registros: RegistroHistorico[]; canal: RegistroHistorico["canal"]; config: ConfigEditorial } | null,
  limiar: number,
): MotivoDeFora | null {
  if (canal.storyIds.has(c.storyId)) return "JA_NO_CANAL";
  if (c.status !== "approved") return "NAO_APROVADA";
  const k = c.classificacao;
  if (!k) return "SEM_CLASSIFICACAO";
  if (k.imigracao === true || k.eixo === "imigracao") return "IMIGRACAO";
  if (c.eventFingerprint && canal.impressoes?.has(c.eventFingerprint)) return "MESMO_ACONTECIMENTO";
  if (c.embedding?.length && limiar > 0) {
    for (const v of canal.vetores) {
      if (v?.length && cosseno(c.embedding, v) >= limiar) return "MESMO_ACONTECIMENTO";
    }
  }
  if (historico && historico.registros.length > 0) {
    const veredito = verificarRepeticao(
      {
        titulo: c.title,
        url: c.canonicalUrl || c.url,
        resumo: c.summary,
        publicadoEm: undefined,
        entidades: entidadesDaClassificacao(k),
        vetor: c.embedding,
      },
      historico.registros,
      historico.canal,
      historico.config,
    );
    if (veredito.repetida) return "REPETIDA_NO_CANAL";
  }
  return null;
}

/** O pool na ordem gravada; as candidatas que não estão mais no banco somem. */
export function ordenarPeloPool(
  pool: string[] | undefined,
  candidatas: Map<string, CandidataPersistida>,
): CandidataPersistida[] {
  if (pool && pool.length > 0) {
    return pool.map((id) => candidatas.get(id)).filter((c): c is CandidataPersistida => Boolean(c));
  }
  // Pool remontado (peça antiga): pela nota da linha editorial, a maior primeiro.
  return [...candidatas.values()].sort((a, b) => (b.editorialScore ?? 0) - (a.editorialScore ?? 0));
}

/** A pauta da edição que o motivo do editor cita, pelo título, quando ele não apontou. */
export function pautaCitadaNoMotivo(pautas: PautaDoContexto[], motivo: string): PautaDoContexto | null {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
  const doMotivo = new Set(norm(motivo));
  let melhor: { p: PautaDoContexto; n: number } | null = null;
  for (const p of pautas) {
    const n = norm(p.titulo).filter((w) => doMotivo.has(w)).length;
    if (n >= 2 && (!melhor || n > melhor.n)) melhor = { p, n };
  }
  return melhor?.p ?? null;
}
