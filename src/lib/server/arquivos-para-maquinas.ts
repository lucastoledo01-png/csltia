import { MARCA } from "@/lib/marca";
import { EDITORIAS, hrefDaEditoria } from "@/lib/editorias";
import { getSupabaseAdminClient } from "./supabase-admin";

/**
 * Os dois arquivos que só máquina lê (05/10/2026): o sitemap de notícias do
 * Google News e o `/llms.txt`.
 *
 * Os dois são montados por requisição a partir do banco, pelo mesmo motivo do
 * sitemap: o build na VPS não alcança o banco, e um arquivo gerado ali sairia
 * vazio com cara de completo. E os dois degradam em vez de cair: falha de
 * leitura devolve o arquivo sem matéria, nunca 500 (incidente "Sitemap que
 * responde 500 é pior que sitemap ausente").
 *
 * A leitura é direta no banco, e não por `getAllArticlesForAdmin`, porque
 * aquela cai nos artigos estáticos do código quando o banco falha, com
 * `published_at` de AGORA: no sitemap de notícias isso anunciaria ao Google
 * matérias velhas como publicadas há um minuto.
 */

export type MateriaParaMaquina = {
  slug: string;
  title: string;
  seo_description?: string | null;
  description?: string | null;
  published_at: string;
};

/** As matérias publicadas mais recentes, opcionalmente desde uma data. Vazio se o banco falhar. */
export async function materiasRecentes(limite: number, desde?: Date): Promise<MateriaParaMaquina[]> {
  try {
    let consulta = getSupabaseAdminClient()
      .from("articles")
      .select("slug, title, seo_description, description, published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(limite);
    if (desde) consulta = consulta.gte("published_at", desde.toISOString());
    const { data, error } = await consulta;
    if (error) return [];
    return (data ?? []) as MateriaParaMaquina[];
  } catch {
    return [];
  }
}

/** Uma linha do sitemap: o slug e as duas datas, em ISO, como o banco guarda. */
export type MateriaDoSitemap = { slug: string; published_at: string | null; updated_at: string | null };

/**
 * As matérias publicadas para o `sitemap.xml`, com as datas cruas (auditoria
 * de SEO, 05/10/2026). O sitemap lia `getPublishedArticles`, que entrega a
 * data já formatada ("05 de out. de 2026"): a conversão falhava e NENHUMA das
 * 62 matérias saía com `lastmod`. E aquela leitura cai nos artigos estáticos
 * da vertical antiga quando o banco falha. Aqui é direto no banco, e falha é
 * lista vazia.
 */
export async function materiasDoSitemap(): Promise<MateriaDoSitemap[]> {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from("articles")
      .select("slug, published_at, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);
    if (error) return [];
    return (data ?? []) as MateriaDoSitemap[];
  } catch {
    return [];
  }
}

/** Uma página de autor no sitemap: o slug e a data da matéria mais recente dele. */
export type AutorDoSitemap = { slug: string; ultima: string | null };

/**
 * Só entra autor ATIVO com pelo menos uma matéria publicada (06/10/2026).
 * Página de autor sem matéria é página rala, e anunciar ao rastreador uma
 * página sem conteúdo próprio é pedir que ele a classifique como tal. Pura,
 * para o teste.
 */
export function autoresComMateriaPublicada(
  autores: Array<{ id: string; slug: string; ativo: boolean }>,
  materias: Array<{ author_id: string | null; published_at: string | null }>,
): AutorDoSitemap[] {
  const ultima = new Map<string, string | null>();
  for (const m of materias) {
    if (!m.author_id) continue;
    const atual = ultima.get(m.author_id);
    if (!ultima.has(m.author_id) || (m.published_at && (!atual || m.published_at > atual))) {
      ultima.set(m.author_id, m.published_at);
    }
  }
  return autores.filter((a) => a.ativo && ultima.has(a.id)).map((a) => ({ slug: a.slug, ultima: ultima.get(a.id) ?? null }));
}

/** As páginas de autor do `sitemap.xml`. Vazio antes da migration e quando o banco falha. */
export async function autoresDoSitemap(): Promise<AutorDoSitemap[]> {
  try {
    const client = getSupabaseAdminClient();
    const { data: autores, error } = await client.from("autores").select("id, slug, ativo").eq("ativo", true);
    if (error || !autores?.length) return [];
    const { data: materias, error: e2 } = await client
      .from("articles")
      .select("author_id, published_at")
      .eq("status", "published")
      .in(
        "author_id",
        autores.map((a) => a.id),
      )
      .limit(5000);
    if (e2) return [];
    return autoresComMateriaPublicada(
      autores as Array<{ id: string; slug: string; ativo: boolean }>,
      (materias ?? []) as Array<{ author_id: string | null; published_at: string | null }>,
    );
  } catch {
    return [];
  }
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** A janela do Google News: só o que foi publicado nas últimas 48 horas entra. */
export const JANELA_DO_GOOGLE_NEWS_MS = 48 * 60 * 60 * 1000;

/**
 * O sitemap de notícias, no formato do Google News: publicação, idioma `pt`,
 * data e título de cada matéria das últimas 48 horas. Matéria com data
 * inválida ou fora da janela fica de fora, mesmo que a consulta a traga.
 */
export function sitemapDeNoticias(materias: MateriaParaMaquina[], agora: Date): string {
  const limite = agora.getTime() - JANELA_DO_GOOGLE_NEWS_MS;
  const urls = materias
    .filter((m) => {
      const t = Date.parse(m.published_at);
      return Number.isFinite(t) && t >= limite && t <= agora.getTime() + 60_000;
    })
    .map(
      (m) =>
        `<url><loc>${xml(`${MARCA.site}/artigos/${m.slug}`)}</loc><news:news><news:publication><news:name>${xml(MARCA.nome)}</news:name><news:language>pt</news:language></news:publication><news:publication_date>${new Date(Date.parse(m.published_at)).toISOString()}</news:publication_date><news:title>${xml(m.title)}</news:title></news:news></url>`,
    );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
    urls.join("\n") +
    (urls.length ? "\n" : "") +
    `</urlset>\n`
  );
}

function linhaMarkdown(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").trim();
}

/**
 * O `/llms.txt`: o que o site é, as editorias, as matérias mais recentes e a
 * newsletter, no formato de llmstxt.org (título, resumo em citação, seções de
 * links). Curto de propósito: é índice, não o texto inteiro.
 */
export function llmsTxt(materias: MateriaParaMaquina[]): string {
  const linhas: string[] = [];
  linhas.push(`# ${MARCA.nome}`, "");
  linhas.push(`> ${MARCA.descricao}`, "");
  linhas.push(
    "Publicação diária sobre os Estados Unidos, em português, para brasileiros. Cada matéria trata de uma pauta, cita a fonte com link e traz a data de publicação.",
    "",
  );
  linhas.push("## Editorias", "");
  for (const e of EDITORIAS) linhas.push(`- [${e.nome}](${MARCA.site}${hrefDaEditoria(e.id)}): ${e.descricao}`);
  linhas.push("", "## Matérias", "");
  if (materias.length === 0) linhas.push(`- [Todas as matérias](${MARCA.site}/artigos)`);
  for (const m of materias) {
    const resumo = (m.seo_description || m.description || "").trim();
    linhas.push(`- [${linhaMarkdown(m.title)}](${MARCA.site}/artigos/${m.slug})${resumo ? `: ${linhaMarkdown(resumo)}` : ""}`);
  }
  linhas.push("", "## Newsletter", "");
  linhas.push(`- [Assine a newsletter](${MARCA.site}/newsletter): uma edição por dia, por e-mail, com as pautas do dia.`);
  linhas.push("", "## Optional", "");
  linhas.push(`- [Todas as matérias](${MARCA.site}/artigos)`);
  linhas.push(`- [Mapa do site](${MARCA.site}/sitemap.xml)`);
  linhas.push(`- [Notícias das últimas 48 horas](${MARCA.site}/sitemap-noticias.xml)`);
  return `${linhas.join("\n")}\n`;
}
