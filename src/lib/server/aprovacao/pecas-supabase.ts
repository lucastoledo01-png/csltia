import type { SupabaseClient } from "@supabase/supabase-js";
import { MARCA } from "@/lib/marca";
import { envDoListmonk } from "../credenciais-do-projeto";
import { createListmonkClient } from "../listmonk";
import type { Ramo } from "./contrato";
import type { AdaptadorDePecas, PecaLida, ProjetoDaFila, ResultadoDoDespacho } from "./fila";
import { hashDaNewsletter, hashDoArtigo, hashDoPostDaLinha } from "./hash";

/**
 * As peças de verdade, nas tabelas de verdade.
 *
 * Cada ramo mora numa tabela: o post em `social_posts`, a newsletter em
 * `news_editions` (e no Listmonk, só na hora de sair), o artigo em `articles`.
 * O hash é sempre recalculado do que está na linha AGORA, nunca do que a fila
 * guardou: comparar a fila com ela mesma não confere nada.
 */

type Linha = Record<string, unknown>;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** As frases da copy que servem de lastro para um número editado à mão. */
function materialDoPost(conteudo: Linha | null): string[] {
  const copy = (conteudo?.copy ?? {}) as Linha;
  return ["headline", "gancho", "fato_principal", "contexto", "informacao_util", "ressalva", "destaque"]
    .map((k) => s(copy[k]))
    .filter(Boolean);
}

function materialDaEdicao(stories: unknown): string[] {
  if (!Array.isArray(stories)) return [];
  return (stories as Linha[]).flatMap((st) =>
    ["title", "summary", "why_it_matters", "practical_impact", "body"].map((k) => s(st?.[k])).filter(Boolean),
  );
}

/**
 * Status de post cancelado, com a rede de quando a migration ainda não rodou.
 *
 * `cancelled` entra no CHECK de `social_posts` pela migration de 05/10/2026.
 * Sem ela, o Postgres recusa com 23514, e aí vale o que o incidente de 16/09
 * mandou fazer: `draft` com o motivo em `error_message` começando por
 * CANCELADO, que é o que permite separar depois.
 */
async function retirarPost(client: SupabaseClient, id: string, tipo: "cancelada" | "descartada", motivo: string) {
  const rotulo = tipo === "cancelada" ? "CANCELADO" : "DESCARTADO";
  const mensagem = `${rotulo}: ${motivo}`.slice(0, 1000);
  const base = () =>
    client
      .from("social_posts")
      .update({ status: "cancelled", error_message: mensagem, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "published");
  const { error } = await base();
  if (!error) return;
  if (error.code === "23514" || /social_posts_status_check/.test(error.message)) {
    const { error: e2 } = await client
      .from("social_posts")
      .update({ status: "draft", error_message: mensagem, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "published");
    if (e2) throw new Error(`[FILA] não consegui retirar o post ${id}: ${e2.message}`);
    return;
  }
  throw new Error(`[FILA] não consegui retirar o post ${id}: ${error.message}`);
}

export function criarAdaptadorSupabase(
  client: SupabaseClient,
  projeto: ProjetoDaFila,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): AdaptadorDePecas {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const keyword = s((projeto.settings ?? {}).instagram_keyword);

  async function lerLinha(tabela: string, colunas: string, id: string): Promise<Linha | null> {
    const { data, error } = await client.from(tabela).select(colunas).eq("id", id).eq("project_id", projeto.id).maybeSingle();
    if (error) throw new Error(`[FILA] não consegui ler ${tabela} ${id}: ${error.message}`);
    return (data as Linha | null) ?? null;
  }

  const adaptador: AdaptadorDePecas = {
    async ler(ramo, pecaId): Promise<PecaLida | null> {
      if (ramo === "post") {
        const l = await lerLinha("social_posts", "id, title, caption, slides_manifest, content_json", pecaId);
        if (!l) return null;
        return {
          hashAtual: hashDoPostDaLinha(l),
          texto: s(l.caption),
          titulo: s(l.title),
          material: materialDoPost((l.content_json as Linha) ?? null),
          keyword,
        };
      }
      if (ramo === "newsletter") {
        const l = await lerLinha("news_editions", "id, subject, headline, content_html, stories", pecaId);
        if (!l) return null;
        return {
          hashAtual: hashDaNewsletter(s(l.subject), s(l.content_html)),
          texto: s(l.subject),
          titulo: s(l.headline) || s(l.subject),
          material: [s(l.headline), ...materialDaEdicao(l.stories)],
        };
      }
      const l = await lerLinha("articles", "id, title, content_html, excerpt, description", pecaId);
      if (!l) return null;
      return {
        hashAtual: hashDoArtigo(s(l.title), s(l.content_html)),
        texto: s(l.title),
        titulo: s(l.title),
        material: [s(l.excerpt), s(l.description), s(l.content_html)],
      };
    },

    async gravarTexto(ramo: Ramo, pecaId, novoTexto) {
      const agora = new Date().toISOString();
      if (ramo === "post") {
        const { error } = await client
          .from("social_posts")
          .update({ caption: novoTexto, updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar a legenda: ${error.message}`);
      } else if (ramo === "newsletter") {
        const { error } = await client
          .from("news_editions")
          .update({ subject: novoTexto, updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar o assunto: ${error.message}`);
      } else {
        const { error } = await client
          .from("articles")
          .update({ title: novoTexto, seo_title: novoTexto, updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar o título: ${error.message}`);
      }
      const relida = await adaptador.ler(ramo, pecaId);
      if (!relida) throw new Error("[FILA] a peça sumiu depois da edição");
      return { hashNovo: relida.hashAtual };
    },

    async despachar(ramo, pecaId, aprovacao): Promise<ResultadoDoDespacho> {
      const agora = new Date();

      if (ramo === "post") {
        /*
         * A promoção para `scheduled` é a ÚNICA escrita desse status quando a
         * fila está em `enforce`. O horário fica o planejado, ou agora se ele
         * já passou: aprovar às 15h um post planejado para as 12h o publica no
         * próximo giro do worker, e não amanhã.
         */
        const planejado = aprovacao.publicarEm ? Date.parse(aprovacao.publicarEm) : NaN;
        const quando = new Date(Number.isFinite(planejado) ? Math.max(planejado, agora.getTime()) : agora.getTime());
        const { data, error } = await client
          .from("social_posts")
          .update({ status: "scheduled", scheduled_at: quando.toISOString(), error_message: null, updated_at: agora.toISOString() })
          .eq("id", pecaId)
          .eq("project_id", projeto.id)
          .in("status", ["draft", "scheduled"])
          .select("id");
        if (error) return { ok: false, motivo: error.message };
        if (!data || data.length === 0) return { ok: false, motivo: "o post não estava em rascunho nem agendado" };
        return { ok: true, detalhe: `post na vaga do worker para ${quando.toISOString()}` };
      }

      if (ramo === "artigo") {
        const { data, error } = await client
          .from("articles")
          .update({ status: "published", published_at: agora.toISOString(), updated_at: agora.toISOString() })
          .eq("id", pecaId)
          .eq("project_id", projeto.id)
          .in("status", ["draft", "scheduled"])
          .select("id");
        if (error) return { ok: false, motivo: error.message };
        if (!data || data.length === 0) return { ok: false, motivo: "o artigo não estava em rascunho" };
        return { ok: true, detalhe: "artigo publicado no portal" };
      }

      /*
       * Newsletter: a campanha nasce AQUI, com o assunto e o HTML que estão na
       * linha agora, e não na hora da redação. Assim o que sai é, por
       * construção, a versão cujo hash foi aprovado, e uma edição de assunto
       * feita na fila não precisa de PUT em campanha já criada.
       */
      const l = await lerLinha("news_editions", "id, subject, content_html, edition_date", pecaId);
      if (!l) return { ok: false, motivo: "a edição não existe mais" };
      const listmonk = createListmonkClient(await envDoListmonk(projeto.id, env), fetcher);
      const r = await listmonk.createCampaign({
        name: `${MARCA.nome}, edição ${s(l.edition_date)}`,
        subject: s(l.subject),
        body: s(l.content_html),
        autoSend: true,
      });
      if (!r.ok || !r.id) return { ok: false, motivo: `Listmonk: ${"reason" in r ? r.reason : "sem id de campanha"}` };
      return { ok: true, detalhe: `campanha #${r.id} disparada no Listmonk` };
    },

    async retirar(ramo, pecaId, tipo, motivo) {
      if (ramo === "post") return retirarPost(client, pecaId, tipo, motivo);
      /*
       * Newsletter não tem o que retirar: a campanha só nasce no despacho, e a
       * linha de `news_editions` continua sendo o registro da edição, que o
       * Instagram lê. O que impede o envio é o estado da aprovação.
       */
      if (ramo === "newsletter") return;
      const { error } = await client
        .from("articles")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", pecaId)
        .eq("project_id", projeto.id)
        .neq("status", "published");
      if (error) throw new Error(`[FILA] não consegui retirar o artigo ${pecaId}: ${error.message} (${tipo}: ${motivo})`);
    },
  };

  return adaptador;
}
