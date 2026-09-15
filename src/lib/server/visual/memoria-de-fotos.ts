import type { SupabaseClient } from "@supabase/supabase-js";
import { identidadeDaFoto } from "../prompt-system/stock";

/**
 * Quais fotos já saíram, para nenhuma sair de novo.
 *
 * A biblioteca interna (`visual_assets`) guarda foto por ENTIDADE, e a janela
 * dela responde "esta foto do juiz X saiu há quanto tempo". Isso não alcança o
 * caso que apareceu no feed: a foto do banco conceitual é escolhida por
 * conceito, não por entidade, então a mesma imagem ilustra assuntos diferentes
 * sem nunca disputar a mesma chave.
 *
 * Entre 13 e 15/09/2026 a foto `pexels-photo-3751006` saiu em quatro posts, e
 * a `pexels-photo-6358834` em dois. A busca é determinística, pedia um único
 * resultado e ninguém lembrava do anterior.
 *
 * A memória não precisa de tabela nova: `social_posts.content_json.visual`
 * guarda a URL da imagem de todo post que foi ao ar, dos dois caminhos. Quem
 * pergunta o que já saiu pergunta ao mesmo lugar que registra o que saiu, que
 * é o mesmo princípio do histórico do evergreen.
 */
export async function fotosUsadasRecentemente(
  client: SupabaseClient,
  projectId: string,
  desdeIso: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("social_posts")
    .select("content_json")
    .eq("project_id", projectId)
    .gte("created_at", desdeIso);

  if (error || !data) return [];

  const identidades = new Set<string>();
  for (const linha of data) {
    const visual = (linha as { content_json?: { visual?: { imageUrl?: unknown } } }).content_json?.visual;
    const url = visual?.imageUrl;
    if (typeof url !== "string" || !url) continue;
    const id = identidadeDaFoto(url);
    if (id) identidades.add(id);
  }

  return [...identidades];
}
