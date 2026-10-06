import type { SupabaseClient } from "@supabase/supabase-js";
import type { Autor, AutorDaAssinatura, CamposDoAutor, RedesDoAutor } from "@/lib/autores";
import { getSupabaseAdminClient } from "./supabase-admin";

/**
 * A leitura e a escrita dos autores (06/10/2026).
 *
 * Toda escrita filtra por `project_id` além do id, como os perfis de
 * referência: um id de outro projeto nunca é alterado por engano a partir do
 * painel deste.
 *
 * As leituras do PORTAL degradam: antes de o dono rodar a migration, a tabela
 * e a coluna `articles.author_id` não existem, e a matéria tem que continuar
 * abrindo com a assinatura da Redação, como sempre. Falha de leitura vira
 * "sem autor", nunca página quebrada.
 */

export const TABELA_DE_AUTORES = "autores";

const COLUNAS = "id, project_id, slug, nome, cargo, minibio, foto_url, area, redes, ativo, criado_em";

function redes(v: unknown): RedesDoAutor {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as RedesDoAutor) : {};
}

export function autorDaLinha(l: Record<string, unknown>): Autor {
  return {
    id: String(l.id),
    project_id: String(l.project_id),
    slug: String(l.slug ?? ""),
    nome: String(l.nome ?? ""),
    cargo: String(l.cargo ?? ""),
    minibio: String(l.minibio ?? ""),
    foto_url: typeof l.foto_url === "string" && l.foto_url ? l.foto_url : null,
    area: String(l.area ?? ""),
    redes: redes(l.redes),
    ativo: l.ativo !== false,
    criado_em: typeof l.criado_em === "string" ? l.criado_em : undefined,
  };
}

export function assinaturaDoAutor(a: Autor): AutorDaAssinatura {
  return { slug: a.slug, nome: a.nome, cargo: a.cargo, foto_url: a.foto_url, redes: a.redes };
}

export function criarAutoresStore(client: SupabaseClient) {
  return {
    async listar(projectId: string): Promise<Autor[]> {
      const { data, error } = await client
        .from(TABELA_DE_AUTORES)
        .select(COLUNAS)
        .eq("project_id", projectId)
        .order("ativo", { ascending: false })
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((l) => autorDaLinha(l as Record<string, unknown>));
    },

    async criar(projectId: string, campos: Partial<CamposDoAutor>): Promise<Autor> {
      const { data, error } = await client
        .from(TABELA_DE_AUTORES)
        .insert({ ...campos, project_id: projectId })
        .select(COLUNAS)
        .single();
      if (error || !data) throw new Error(error?.message ?? "sem resposta do banco");
      return autorDaLinha(data as Record<string, unknown>);
    },

    async atualizar(projectId: string, id: string, campos: Partial<CamposDoAutor>): Promise<Autor | null> {
      const { data, error } = await client
        .from(TABELA_DE_AUTORES)
        .update(campos)
        .eq("project_id", projectId)
        .eq("id", id)
        .select(COLUNAS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? autorDaLinha(data as Record<string, unknown>) : null;
    },

    async porId(projectId: string, id: string): Promise<Autor | null> {
      const { data, error } = await client
        .from(TABELA_DE_AUTORES)
        .select(COLUNAS)
        .eq("project_id", projectId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? autorDaLinha(data as Record<string, unknown>) : null;
    },
  };
}

/** O autor ATIVO de uma matéria, para a assinatura e o JSON-LD. `null` é a Redação. */
export async function autorDaMateria(
  materia: { author_id?: string | null; project_id?: string | null },
): Promise<AutorDaAssinatura | null> {
  if (!materia.author_id) return null;
  try {
    let consulta = getSupabaseAdminClient()
      .from(TABELA_DE_AUTORES)
      .select(COLUNAS)
      .eq("id", materia.author_id)
      .eq("ativo", true);
    if (materia.project_id) consulta = consulta.eq("project_id", materia.project_id);
    const { data, error } = await consulta.maybeSingle();
    if (error || !data) return null;
    return assinaturaDoAutor(autorDaLinha(data as Record<string, unknown>));
  } catch {
    return null;
  }
}

/** O autor ativo pelo slug, para a página `/autor/<slug>`. `null` é 404. */
export async function autorPeloSlug(projectId: string, slug: string): Promise<Autor | null> {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from(TABELA_DE_AUTORES)
      .select(COLUNAS)
      .eq("project_id", projectId)
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) return null;
    return autorDaLinha(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** A linha da matéria que a página do autor lista, no formato que a home já junta. */
export type MateriaDoAutor = {
  slug: string;
  title: string | null;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  published_at: string | null;
  source_urls: string[] | null;
};

/** As matérias publicadas do autor, mais recente primeiro. Falha de leitura é lista vazia. */
export async function materiasDoAutor(projectId: string, autorId: string, limite = 60): Promise<MateriaDoAutor[]> {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from("articles")
      .select("slug, title, excerpt, cover_image, category, published_at, source_urls")
      .eq("project_id", projectId)
      .eq("author_id", autorId)
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(limite);
    if (error) return [];
    return (data ?? []) as MateriaDoAutor[];
  } catch {
    return [];
  }
}
