import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { gerarStoryId } from "@/lib/server/editorial/history";
import { dominioDe, urlCanonica } from "@/lib/server/editorial/url-canonica";
import { FORMATOS_DO_POST, postsDoPlano, type FormatoDoPostDoClaude, type ItensDoPlano, type PlanoDoDia, type PlanosStore } from "./plano-store";

/**
 * A pauta que o dono mandou (10/11/2026). Até aqui o Claude só produzia o que
 * o plano do dia trazia: a notícia que a Bruna achou, ou pediu para o Claude
 * achar na web, não tinha como entrar. Agora o link vira candidata aprovada do
 * projeto e entra no dia como extra: post, matéria e, se couber, newsletter,
 * com a mesma foto, os mesmos fatos e as mesmas guardas de qualquer pauta.
 *
 * Não depende do plano: o link é produzido mesmo num dia que não começou, e
 * mesmo com o plano fechado. Cada peça espera a aprovação no painel.
 */

export const EIXOS_DO_LINK = ["economia", "trabalho", "custo_de_vida", "politica", "tecnologia", "cultura", "seguranca", "brasil", "outro"] as const;

export type PedidoDoLink = {
  url: string;
  titulo: string;
  resumo: string;
  eixo: (typeof EIXOS_DO_LINK)[number];
  pais: "EUA" | "Brasil" | "outro";
  atores: string[];
  formato: FormatoDoPostDoClaude;
  cena: string;
};

/** Pura: os argumentos da ferramenta, conferidos. */
export function lerPedidoDoLink(args: Record<string, unknown>): PedidoDoLink | { erro: string } {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) return { erro: "informe url: o link da notícia, começando com http" };
  const titulo = typeof args.titulo === "string" ? args.titulo.trim() : "";
  if (titulo.length < 8) return { erro: "informe titulo: o título da notícia como está na página (leia a página antes)" };
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const eixo = (EIXOS_DO_LINK as readonly string[]).includes(texto(args.eixo)) ? (texto(args.eixo) as PedidoDoLink["eixo"]) : "outro";
  const pais = args.pais === "Brasil" || args.pais === "outro" ? args.pais : "EUA";
  const atores = Array.isArray(args.atores) ? args.atores.filter((a): a is string => typeof a === "string" && a.trim().length > 1).map((a) => a.trim()).slice(0, 8) : [];
  const formato = (FORMATOS_DO_POST as readonly string[]).includes(texto(args.formato)) ? (texto(args.formato) as FormatoDoPostDoClaude) : "reel";
  return { url, titulo: titulo.slice(0, 300), resumo: texto(args.resumo).slice(0, 2000), eixo, pais, atores, formato, cena: texto(args.cena) || titulo };
}

/** Pura: o dia com o link como extra. A pauta que já está nos posts do dia não entra duas vezes. */
export function itensComLink(itens: ItensDoPlano, storyId: string, p: Pick<PedidoDoLink, "formato" | "cena">): ItensDoPlano {
  if (postsDoPlano(itens).includes(storyId)) return itens;
  return {
    ...itens,
    extras: [...(itens.extras ?? []), storyId],
    formatos: { ...(itens.formatos ?? {}), [storyId]: p.formato },
    cenas: { ...itens.cenas, [storyId]: itens.cenas[storyId] ?? { consulta: p.cena, objeto: "" } },
    porque: { ...itens.porque, [storyId]: itens.porque[storyId] ?? "pedido do dono pelo link" },
  };
}

/** Pura: a etapa depois do link. O dia aprovado que já tinha passado do preparo volta a ele. */
export function etapaDepoisDoLink(plano: Pick<PlanoDoDia, "estado" | "etapa">): PlanoDoDia["etapa"] {
  return plano.estado === "aprovado" && (plano.etapa === "producao" || plano.etapa === "pronto") ? "preparo" : plano.etapa;
}

export type DepsDoLink = {
  planos: PlanosStore;
  /** Grava (ou acha) a candidata do link, aprovada; devolve o story_id. */
  candidataDoLink: (projeto: Project, pedido: PedidoDoLink) => Promise<string>;
};

export async function adicionarLinkAoDia(
  projeto: Project,
  data: string,
  pedido: PedidoDoLink,
  deps: DepsDoLink,
): Promise<{ storyId: string; jaEstava: boolean; plano: PlanoDoDia }> {
  const storyId = await deps.candidataDoLink(projeto, pedido);
  const plano = await deps.planos.doDia(projeto.id, data);
  if (postsDoPlano(plano.itens).includes(storyId)) return { storyId, jaEstava: true, plano };
  const atualizado = await deps.planos.atualizar(plano.id, { itens: itensComLink(plano.itens, storyId, pedido), etapa: etapaDepoisDoLink(plano) });
  return { storyId, jaEstava: false, plano: atualizado };
}

/** A candidata do link no banco: a coleta que já existe é aproveitada e aprovada; a que não existe nasce aprovada. */
export function candidataDoLinkSupabase(client: SupabaseClient): DepsDoLink["candidataDoLink"] {
  return async (projeto, p) => {
    const classificacao = {
      country: p.pais,
      is_immigration: false,
      editorial_reading: "neutra",
      editorial_axis: p.eixo,
      event_nature: "outro",
      relevance: 8,
      actors: p.atores,
      places: [],
      organizations: [],
      event_terms: [],
      classification_status: "done",
      classified_at: new Date().toISOString(),
    };
    const canonica = urlCanonica(p.url) || p.url;
    const { data: achadas, error } = await client
      .from("news_candidates")
      .select("id, story_id, classification_status")
      .eq("project_id", projeto.id)
      .in("url", [...new Set([p.url, canonica])])
      .limit(1);
    if (error) throw new Error(`a candidata do link não pôde ser lida: ${error.message}`);
    const achada = (achadas ?? [])[0] as { id: string; story_id: string; classification_status: string } | undefined;
    const agora = new Date().toISOString();
    if (achada) {
      const { error: e } = await client
        .from("news_candidates")
        .update({
          status: "approved",
          decision_reason: "APPROVED_BY_OWNER_LINK",
          ...(achada.classification_status === "done" ? {} : classificacao),
          updated_at: agora,
        })
        .eq("id", achada.id);
      if (e) throw new Error(`a candidata do link não foi aprovada: ${e.message}`);
      return achada.story_id;
    }
    const storyId = gerarStoryId({ url: p.url });
    const dominio = dominioDe(p.url) || null;
    const { error: e } = await client.from("news_candidates").upsert(
      {
        project_id: projeto.id,
        story_id: storyId,
        url: p.url,
        canonical_url: canonica,
        source_domain: dominio,
        source_name: dominio ?? "link do dono",
        title: p.titulo,
        summary: p.resumo,
        published_at: agora,
        status: "approved",
        decision_reason: "APPROVED_BY_OWNER_LINK",
        ...classificacao,
        enrichment_status: "pending",
        enriched_chars: 0,
        source_resolved: true,
        metadata_json: { origem: "link_do_dono", justificativa: "pedido do dono pelo link" },
        updated_at: agora,
      },
      { onConflict: "project_id,url", ignoreDuplicates: true },
    );
    if (e) throw new Error(`a candidata do link não foi gravada: ${e.message}`);
    return storyId;
  };
}
