import { createHash } from "node:crypto";
import { LeituraFalhou, comRetentativa } from "../leitura";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entidades } from "./fingerprint";
import { impressaoDoAcontecimento } from "./fingerprint";
import { dominioDe, urlCanonica } from "./url-canonica";
import type { Vetor, VetorConhecido } from "./embeddings";

/**
 * Leitura e escrita do histórico editorial.
 *
 * A verificação de repetição só vale o que vale o histórico. Enquanto ele não
 * existiu, `rankAndFilterCandidates` recebia uma lista vazia de URLs já
 * publicadas e a comparação acontecia apenas entre as pautas coletadas no
 * mesmo dia, o que deixa passar a mesma notícia em dias diferentes.
 */

export type Canal = "newsletter" | "instagram" | "article";
export type SentimentoEditorial = "positive" | "neutral" | "negative";

export type RegistroHistorico = {
  id?: string;
  projectId: string;
  storyId: string;
  originStoryId?: string | null;
  canal: Canal;
  tipo?: string;
  titulo: string;
  resumo?: string;
  url?: string;
  urlCanonica?: string;
  dominio?: string;
  entidades?: Entidades | Record<string, unknown>;
  impressao?: string;
  categoria?: string;
  pais?: string;
  sentimento?: SentimentoEditorial;
  vetor?: Vetor | null;
  modeloDoVetor?: string | null;
  imagemUrl?: string | null;
  imagemFonte?: string | null;
  imagemLicenca?: string | null;
  imagemAutor?: string | null;
  imagemCredito?: string | null;
  imagemAssetId?: string | null;
  imagemUrlCanonica?: string | null;
  /** Qual arquivo da biblioteca visual ilustrou esta publicação. */
  visualAssetId?: string | null;
  newsletterId?: string | null;
  instagramPostId?: string | null;
  /** pipeline | backfill:<origem>. Distingue o reconstruído do coletado. */
  procedencia?: string;
  motivo?: string | null;
  publicadoEm?: string;
};

/**
 * Identidade do acontecimento.
 *
 * A URL canônica é a chave preferida porque duas coletas da mesma matéria
 * chegam com querystring diferente e apontam para o mesmo texto. Sem URL
 * utilizável, cai na impressão de entidades, e por último no título.
 *
 * O prefixo diz de onde a identidade veio. Sem ele, dois `story_id` iguais por
 * caminhos diferentes ficariam indistinguíveis num relatório de auditoria.
 */
export function gerarStoryId(entrada: {
  url?: string;
  entidades?: Entidades;
  titulo?: string;
}): string {
  const canonica = entrada.url ? urlCanonica(entrada.url) : "";
  if (canonica) return `u_${resumoCurto(canonica)}`;

  if (entrada.entidades) {
    const impressao = impressaoDoAcontecimento(entrada.entidades);
    if (impressao) return `e_${resumoCurto(impressao)}`;
  }

  const titulo = (entrada.titulo || "").trim().toLowerCase();
  if (titulo) return `t_${resumoCurto(titulo)}`;

  throw new Error("gerarStoryId precisa de url, entidades ou titulo.");
}

function resumoCurto(valor: string): string {
  return createHash("sha1").update(valor).digest("hex").slice(0, 20);
}

type LinhaDoBanco = {
  id: string;
  project_id: string;
  story_id: string;
  origin_story_id: string | null;
  channel: Canal;
  content_type: string;
  title: string;
  summary: string;
  url: string;
  canonical_url: string;
  domain: string;
  entities: Record<string, unknown>;
  event_fingerprint: string;
  category: string;
  country: string;
  editorial_sentiment: SentimentoEditorial;
  embedding: number[] | null;
  embedding_model: string | null;
  image_url: string | null;
  image_canonical_url: string | null;
  provenance: string;
  decision_code: string | null;
  published_at: string;
};

function paraBanco(r: RegistroHistorico) {
  const canonica = r.urlCanonica ?? (r.url ? urlCanonica(r.url) : "");
  const entidades = (r.entidades ?? {}) as Entidades;
  return {
    project_id: r.projectId,
    story_id: r.storyId,
    origin_story_id: r.originStoryId ?? null,
    channel: r.canal,
    content_type: r.tipo ?? "story",
    title: r.titulo,
    summary: r.resumo ?? "",
    url: r.url ?? "",
    canonical_url: canonica,
    domain: r.dominio ?? (canonica ? dominioDe(canonica) : ""),
    entities: r.entidades ?? {},
    event_fingerprint: r.impressao ?? (r.entidades ? impressaoDoAcontecimento(entidades) : ""),
    category: r.categoria ?? "",
    country: r.pais ?? "",
    editorial_sentiment: r.sentimento ?? "neutral",
    embedding: r.vetor ?? null,
    embedding_model: r.modeloDoVetor ?? null,
    image_url: r.imagemUrl ?? null,
    image_source: r.imagemFonte ?? null,
    image_license: r.imagemLicenca ?? null,
    image_author: r.imagemAutor ?? null,
    image_attribution: r.imagemCredito ?? null,
    image_asset_id: r.imagemAssetId ?? null,
    image_canonical_url: r.imagemUrlCanonica ?? null,
    visual_asset_id: r.visualAssetId ?? null,
    newsletter_id: r.newsletterId ?? null,
    instagram_post_id: r.instagramPostId ?? null,
    provenance: r.procedencia ?? "pipeline",
    decision_code: r.motivo ?? null,
    published_at: r.publicadoEm ?? new Date().toISOString(),
  };
}

function doBanco(linha: LinhaDoBanco): RegistroHistorico {
  return {
    id: linha.id,
    projectId: linha.project_id,
    storyId: linha.story_id,
    originStoryId: linha.origin_story_id,
    canal: linha.channel,
    tipo: linha.content_type,
    titulo: linha.title,
    resumo: linha.summary,
    url: linha.url,
    urlCanonica: linha.canonical_url,
    dominio: linha.domain,
    entidades: linha.entities,
    impressao: linha.event_fingerprint,
    categoria: linha.category,
    pais: linha.country,
    sentimento: linha.editorial_sentiment,
    vetor: linha.embedding,
    modeloDoVetor: linha.embedding_model,
    imagemUrl: linha.image_url,
    imagemUrlCanonica: linha.image_canonical_url,
    procedencia: linha.provenance,
    motivo: linha.decision_code,
    publicadoEm: linha.published_at,
  };
}

const COLUNAS =
  "id,project_id,story_id,origin_story_id,channel,content_type,title,summary,url," +
  "canonical_url,domain,entities,event_fingerprint,category,country,editorial_sentiment," +
  "embedding,embedding_model,image_url,image_canonical_url,provenance,decision_code,published_at";

export type HistoricoStore = {
  janela(projectId: string, dias: number): Promise<RegistroHistorico[]>;
  registrar(registros: RegistroHistorico[]): Promise<number>;
  contar(projectId: string): Promise<number>;
};

export function criarHistoricoStore(client: SupabaseClient): HistoricoStore {
  return {
    async janela(projectId: string, dias: number): Promise<RegistroHistorico[]> {
      const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      /*
       * A terceira leitura que derruba o dia sozinha, e a que falhou num
       * ensaio de 12/09. Mesma releitura das outras duas: são leituras puras,
       * reler não grava nem cobra, e o único custo é latência.
       */
      const data = await comRetentativa(`histórico editorial de ${projectId}`, async () => {
        const r = await client
          .from("editorial_history")
          .select(COLUNAS)
          .eq("project_id", projectId)
          .gte("published_at", corte)
          .order("published_at", { ascending: false });

        if (r.error) throw new LeituraFalhou(`Histórico editorial, leitura falhou: ${r.error.message}`);
        return r.data;
      });

      return (data as unknown as LinhaDoBanco[]).map(doBanco);
    },

    /**
     * Grava ignorando o que já está lá.
     *
     * `ignoreDuplicates` faz o backfill poder rodar de novo sem duplicar e sem
     * sobrescrever o que o pipeline já registrou com dado melhor.
     */
    async registrar(registros: RegistroHistorico[]): Promise<number> {
      if (registros.length === 0) return 0;
      const linhas = registros.map(paraBanco);
      const { data, error } = await client
        .from("editorial_history")
        .upsert(linhas, {
          onConflict: "project_id,story_id,channel",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) throw new Error(`Histórico editorial, escrita falhou: ${error.message}`);
      return data?.length ?? 0;
    },

    async contar(projectId: string): Promise<number> {
      const { count, error } = await client
        .from("editorial_history")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);

      if (error) throw new Error(`Histórico editorial, contagem falhou: ${error.message}`);
      return count ?? 0;
    },
  };
}

/** Só os registros que têm vetor viram candidatos a vizinho. */
export function vetoresDoHistorico(
  registros: RegistroHistorico[]
): Array<VetorConhecido<RegistroHistorico>> {
  const saida: Array<VetorConhecido<RegistroHistorico>> = [];
  for (const r of registros) {
    if (Array.isArray(r.vetor) && r.vetor.length > 0) {
      saida.push({ vetor: r.vetor, registro: r });
    }
  }
  return saida;
}
