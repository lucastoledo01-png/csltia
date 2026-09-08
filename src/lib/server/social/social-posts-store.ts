import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistroHistorico } from "../editorial/history";
import type { PostGerado } from "./gerador";
import type { Vaga } from "./agenda";
import type { ResultadoVisual } from "../visual/tipos";

/**
 * Onde um post do social V2 vira linha.
 *
 * Três coisas que a tabela já resolve e não precisam de coluna nova: a
 * manchete da arte mora em `title`, a legenda em `caption`, e o resultado da
 * guarda em `social_guard_reasons`, que é jsonb e cabe o objeto inteiro.
 * Inventar `headline`, `full_caption` e `social_guard_result` ao lado delas
 * criaria três pares de colunas dizendo a mesma coisa.
 */

export type OrigemDoPost = {
  originChannel: "newsletter" | "social";
  originStoryId: string | null;
  motivo: string;
};

/**
 * De onde este post veio, e a distinção que importa.
 *
 * Classificação compartilhada NÃO é publicação na newsletter. Desde que o
 * newsroom passou a gravar em `news_candidates`, toda pauta do dia foi
 * classificada pelo mesmo processo que serve o e-mail, e marcar todas como
 * `origin_channel=newsletter` por causa disso apagaria justamente o que o
 * campo existe para dizer: se o leitor já viu aquilo no e-mail de manhã.
 *
 * A prova de publicação é o `editorial_history` com canal newsletter. Sem
 * linha lá, o post é social-only, por mais que a classificação tenha vindo do
 * mesmo lugar.
 */
export function resolverOrigem(storyId: string, historico: RegistroHistorico[]): OrigemDoPost {
  const naNewsletter = historico.find((h) => h.storyId === storyId && h.canal === "newsletter");

  if (naNewsletter) {
    return {
      originChannel: "newsletter",
      originStoryId: naNewsletter.storyId,
      motivo: "a pauta saiu na newsletter e está sendo reaproveitada, que é o fluxo desejado",
    };
  }

  return {
    originChannel: "social",
    originStoryId: null,
    motivo: "aprovada e verificada, e não entrou na composição do e-mail",
  };
}

/** A chave que impede a mesma pauta virar duas linhas no mesmo dia. */
export function chaveDeIdempotencia(editionDate: string, storyId: string): string {
  return `social-v2-${editionDate}-${storyId}`;
}

export type PostParaGravar = {
  projectId: string;
  editionDate: string;
  post: PostGerado;
  vaga: Vaga;
  visual: ResultadoVisual | null;
  candidateId: string | null;
  topicId: string | null;
  eventFingerprint: string | null;
  origem: OrigemDoPost;
};

export type ResultadoDaGravacaoSocial = {
  gravados: number;
  bloqueadosPorIdempotencia: Array<{ storyId: string; motivo: string }>;
  erros: string[];
  ids: string[];
};

type LinhaExistente = {
  id: string;
  story_id: string | null;
  event_fingerprint: string | null;
  idempotency_key: string | null;
};

export type SocialPostsStore = {
  /** O que já existe para este projeto nesta data. Base da idempotência. */
  doDia(projectId: string, editionDate: string): Promise<LinhaExistente[]>;
  gravar(posts: PostParaGravar[]): Promise<ResultadoDaGravacaoSocial>;
};

export function criarSocialPostsStore(client: SupabaseClient): SocialPostsStore {
  return {
    async doDia(projectId, editionDate) {
      const { data, error } = await client
        .from("social_posts")
        .select("id, story_id, event_fingerprint, idempotency_key")
        .eq("project_id", projectId)
        .eq("edition_date", editionDate)
        .eq("platform", "instagram");

      if (error) throw new Error(`social_posts, leitura do dia falhou: ${error.message}`);
      return (data ?? []) as unknown as LinhaExistente[];
    },

    async gravar(posts) {
      const resultado: ResultadoDaGravacaoSocial = {
        gravados: 0,
        bloqueadosPorIdempotencia: [],
        erros: [],
        ids: [],
      };
      if (posts.length === 0) return resultado;

      const projectId = posts[0].projectId;
      const editionDate = posts[0].editionDate;
      const existentes = await this.doDia(projectId, editionDate);

      const chavesUsadas = new Set(existentes.map((l) => l.idempotency_key).filter(Boolean) as string[]);
      const storiesUsados = new Set(existentes.map((l) => l.story_id).filter(Boolean) as string[]);
      const eventosUsados = new Set(existentes.map((l) => l.event_fingerprint).filter(Boolean) as string[]);

      const linhas: Record<string, unknown>[] = [];

      for (const p of posts) {
        const storyId = p.post.pauta.storyId;
        const chave = chaveDeIdempotencia(p.editionDate, storyId);

        /*
         * Duas barreiras diferentes, e a segunda é a que importa.
         *
         * A chave impede a mesma pauta duas vezes, que é reexecução do ciclo.
         * O fingerprint impede o mesmo ACONTECIMENTO chegando por outro
         * artigo, que é o caso real: duas fontes cobrem a mesma decisão
         * judicial, os story_id são diferentes, e para quem rola o feed é o
         * mesmo post duas vezes.
         */
        if (chavesUsadas.has(chave) || storiesUsados.has(storyId)) {
          resultado.bloqueadosPorIdempotencia.push({
            storyId,
            motivo: "esta pauta já tem post neste dia",
          });
          continue;
        }

        if (p.eventFingerprint && eventosUsados.has(p.eventFingerprint)) {
          resultado.bloqueadosPorIdempotencia.push({
            storyId,
            motivo: `DUPLICATE_EVENT: o mesmo acontecimento já tem post neste dia`,
          });
          continue;
        }

        chavesUsadas.add(chave);
        storiesUsados.add(storyId);
        if (p.eventFingerprint) eventosUsados.add(p.eventFingerprint);

        const asset = p.visual?.asset ?? null;

        linhas.push({
          project_id: p.projectId,
          edition_date: p.editionDate,
          platform: "instagram",
          post_type: "carousel",
          status: "scheduled",
          dry_run: false,
          idempotency_key: chave,

          // A manchete da arte e a legenda usam as colunas que já existem.
          title: p.post.copy.headline.slice(0, 300),
          caption: p.post.veredicto.legendaFinal,

          scheduled_at: p.vaga.quandoIso,
          scheduled_slot: p.vaga.slot,
          generation_version: "social-v2",

          story_id: storyId,
          candidate_id: p.candidateId,
          topic_id: p.topicId,
          event_fingerprint: p.eventFingerprint,
          origin_channel: p.origem.originChannel,
          origin_story_id: p.origem.originStoryId,
          editorial_score: p.post.pauta.pontuacao.total,
          visual_asset_id: asset?.id ?? null,

          social_guard_status: p.post.veredicto.passed ? "passed" : "failed",
          social_guard_reasons: {
            finalDecision: p.post.veredicto.finalDecision,
            attempts: p.post.veredicto.attempts,
            issues: p.post.veredicto.issues,
            reparosAplicados: p.post.reparosAplicados,
          },

          content_json: {
            format: "noticia",
            copy: p.post.copy,
            hashtags: p.post.veredicto.hashtagsFinais,
            origem: p.origem.motivo,
            /*
             * O contrato de render, para a arte ser reproduzível fora daqui.
             *
             * A arte do V2 não é gravada como arquivo: quem publica é o
             * worker, e ele renderiza de novo. Isso só é seguro se o render
             * for determinístico E se todo insumo dele estiver na linha —
             * senão o worker desenha uma peça parecida, não a peça aprovada.
             *
             * `title` já carrega a manchete e `visual` já carrega a foto e o
             * crédito. Faltava o eixo, que é a sobrancelha da capa de texto:
             * sem ele a peça sairia sem "PROCESSO" em cima do título, e
             * ninguém notaria comparando o banco.
             *
             * String vazia é um valor, não uma ausência: quer dizer que a
             * classificação não nomeou editoria, e a peça imprime sem
             * sobrancelha de propósito.
             */
            arte: {
              versao: "v2",
              variante: asset ? "fullbleed_portrait" : "noticia_sem_foto",
              eixo: p.post.pauta.classificacao.eixo ?? "",
            },
            /*
             * O registro do direito é completo mesmo quando a arte não imprime
             * nada.
             *
             * Public domain e CC0 dispensam crédito na peça, e por isso
             * `attribution` vem vazia e a tira não é desenhada. Isso não
             * dispensa saber, depois, de onde a foto veio: quem responde a uma
             * contestação de direito autoral seis meses depois olha esta linha,
             * não a imagem. Por isso autor, licença, URL da licença e o estado
             * da verificação ficam gravados nos dois casos, e `atribuicaoImpressa`
             * registra o que efetivamente foi para a arte.
             */
            visual: asset
              ? {
                  source: asset.source,
                  sourceAssetId: asset.sourceAssetId,
                  sourcePageUrl: asset.sourcePageUrl,
                  author: asset.author,
                  license: asset.license,
                  licenseUrl: asset.licenseUrl,
                  attribution: asset.attribution,
                  atribuicaoImpressa: Boolean(asset.attribution.trim()),
                  rightsStatement: asset.rightsStatement,
                  rightsStatus: asset.rightsStatus,
                  rightsCheckedAt: asset.rightsCheckedAt,
                  imageUrl: asset.imageUrl,
                  imageContextType: asset.imageContextType,
                  assetDate: asset.assetDate ?? null,
                  temporalRelevanceScore: asset.temporalRelevanceScore ?? null,
                  semanticContextFit: asset.semanticContextFit ?? null,
                }
              : {
                  // Sem foto não é falha registrada como falha: é a decisão de
                  // publicar com capa de texto, e o motivo de ter sido tomada.
                  motivo: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
                  capa: "texto",
                  entidadeVisual: p.visual?.entidade?.nome ?? null,
                  fontesConsultadas: (p.visual?.fontesConsultadas ?? []).map((f) => ({
                    fonte: f.fonte,
                    encontrados: f.encontrados,
                    nota: f.nota,
                  })),
                },
          },
          updated_at: new Date().toISOString(),
        });
      }

      if (linhas.length === 0) return resultado;

      const { data, error } = await client
        .from("social_posts")
        .upsert(linhas, { onConflict: "project_id,idempotency_key", ignoreDuplicates: true })
        .select("id");

      if (error) {
        resultado.erros.push(error.message);
        return resultado;
      }

      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      resultado.gravados = ids.length;
      resultado.ids = ids;

      return resultado;
    },
  };
}
