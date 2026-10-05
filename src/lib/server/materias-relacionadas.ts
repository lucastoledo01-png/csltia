import type { SupabaseClient } from "@supabase/supabase-js";
import { indexacaoDasTags } from "@/lib/indexacao-do-artigo";
import type { MateriaRelacionada } from "./ramos/artigo";

/**
 * O "Leia também" da matéria (06/10/2026): de duas a três matérias PUBLICADAS
 * da mesma editoria, as mais parecidas primeiro e, no empate, as mais novas.
 *
 * Só `published`, conferido duas vezes: no filtro da consulta e de novo aqui,
 * porque link interno para matéria agendada, arquivada ou rascunho é link
 * quebrado para quem clica (a edição antiga arquivada redireciona, mas é um
 * salto a mais, e rascunho dá 404). A edição inteira (`edicao-*`) também não
 * entra: ela não é matéria de um assunto.
 */

export type LinhaParaRelacionar = {
  slug: string;
  title: string;
  status: string;
  category: string | null;
  published_at: string | null;
  tags?: string[] | null;
};

export type AlvoDaRelacao = {
  slug: string;
  categoria: string;
  /** Título, assuntos e o que mais descrever a matéria, para medir parentesco. */
  texto: string;
};

const POUCO_SIGNIFICADO = new Set([
  "sobre", "entre", "depois", "antes", "ainda", "mesmo", "cidade", "estados", "unidos", "proposta", "quando", "porque", "partir",
]);

/** Radicais de cinco letras das palavras com algum peso: "data centers" e "data center" contam igual. */
function radicais(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length >= 4 && !POUCO_SIGNIFICADO.has(p))
      .map((p) => p.slice(0, 5)),
  );
}

export function escolherRelacionadas(linhas: LinhaParaRelacionar[], alvo: AlvoDaRelacao, limite = 3): MateriaRelacionada[] {
  const chaveDoAlvo = radicais(alvo.texto);
  const categoria = alvo.categoria.trim().toLowerCase();
  return linhas
    .filter(
      (l) =>
        l.status === "published" &&
        l.slug !== alvo.slug &&
        !l.slug.startsWith("edicao-") &&
        (l.category ?? "").trim().toLowerCase() === categoria &&
        l.title.trim().length > 0,
    )
    .map((l) => {
      const texto = [l.title, ...indexacaoDasTags(l.tags).assuntos].join(" ");
      let comuns = 0;
      for (const r of radicais(texto)) if (chaveDoAlvo.has(r)) comuns += 1;
      return { l, comuns, quando: Date.parse(l.published_at ?? "") || 0 };
    })
    .sort((a, b) => b.comuns - a.comuns || b.quando - a.quando)
    .slice(0, limite)
    .map(({ l }) => ({ slug: l.slug, titulo: l.title }));
}

/** As relacionadas, lidas do banco. Falha de leitura devolve lista vazia, e a matéria sai sem o bloco. */
export async function buscarRelacionadas(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  alvo: AlvoDaRelacao,
  limite = 3,
): Promise<MateriaRelacionada[]> {
  const { data, error } = await client
    .from("articles")
    .select("slug, title, status, category, published_at, tags")
    .eq("project_id", projectId)
    .eq("status", "published")
    .eq("category", alvo.categoria)
    .order("published_at", { ascending: false })
    .limit(80);
  if (error || !data) return [];
  return escolherRelacionadas(data as LinhaParaRelacionar[], alvo, limite);
}
