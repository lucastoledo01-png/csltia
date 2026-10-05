import { articles as staticArticles, Article } from "@/lib/editorial";
import { getSupabaseAdminClient } from "./supabase-admin";
import { MARCA } from "@/lib/marca";

export type AdminArticleRecord = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  cover_image?: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  category: string;
  author: string;
  reading_minutes: number;
  view_count: number;
  published_at?: string | null;
  created_at?: string;
  content: Array<{ heading: string; paragraphs: string[] }>;
  content_html?: string;
  tags?: string[];
  source_urls?: string[];
  seo_title?: string;
  seo_description?: string;
  age_summary?: string;
  editorial_score?: number;
  manual_review_status?: string;
};

function sectionsToHtml(title: string, sections: Array<{ heading: string; paragraphs: string[] }>): string {
  if (!sections || sections.length === 0) return "";
  return sections
    .map(
      (sec) => `
      <section class="mb-6">
        <h2 class="font-serif text-2xl font-bold text-[#111827] tracking-tight mb-3">${sec.heading}</h2>
        <div class="space-y-4 text-base leading-relaxed text-[#374151]">
          ${sec.paragraphs.map((p) => `<p>${p}</p>`).join("")}
        </div>
      </section>
    `
    )
    .join("");
}

export async function getAllArticlesForAdmin(): Promise<AdminArticleRecord[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((row: any) => {
        const sections = Array.isArray(row.content) && row.content.length > 0
          ? row.content
          : [{ heading: "Visão Geral", paragraphs: [row.description || row.excerpt || "Conteúdo em atualização."] }];
        const html = row.content_html && row.content_html.trim().length > 0
          ? row.content_html
          : sectionsToHtml(row.title, sections);

        return {
          id: row.id,
          slug: row.slug,
          title: row.title,
          excerpt: row.excerpt || row.description || "",
          description: row.description || row.excerpt || "",
          cover_image: row.cover_image,
          status: row.status || "published",
          category: row.category || "IA",
          author: row.author || MARCA.nome,
          reading_minutes: row.reading_minutes || 5,
          view_count: Number(row.view_count || 0),
          published_at: row.published_at,
          created_at: row.created_at,
          content: sections,
          content_html: html,
          tags: row.tags || [],
          source_urls: row.source_urls || [],
          seo_title: row.seo_title || "",
          seo_description: row.seo_description || "",
          age_summary: row.age_summary || "",
          editorial_score: row.editorial_score || 85,
          manual_review_status: row.manual_review_status || "approved",
        };
      });
    }
  } catch (err) {
    console.error("Erro ao buscar artigos do Supabase:", err);
  }

  // Fallback estático sem valores fictícios (view_count 0 por padrão se ainda não registrado)
  return staticArticles.map((art) => ({
    slug: art.slug,
    title: art.title,
    excerpt: art.excerpt,
    description: art.description,
    cover_image: art.image,
    status: "published",
    category: art.category,
    author: MARCA.nome,
    reading_minutes: parseInt(art.readTime, 10) || 5,
    view_count: 0,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    content: art.sections,
    content_html: sectionsToHtml(art.title, art.sections),
    tags: ["IA", art.category],
    seo_title: art.title,
    seo_description: art.description,
    age_summary: art.quote,
    editorial_score: 90,
    manual_review_status: "approved",
  }));
}

export async function getPublishedArticles(): Promise<Article[]> {
  const all = await getAllArticlesForAdmin();
  const published = all.filter((a) => a.status === "published");

  return published.map((art) => ({
    slug: art.slug,
    category: art.category,
    title: art.title,
    excerpt: art.excerpt,
    description: art.description,
    date: art.published_at ? new Date(art.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "20 Ago 2026",
    readTime: `${art.reading_minutes || 5} min`,
    // Reserva do tema. A anterior era uma foto de codigo em laptop, da
    // vertical de IA, e aparecia em qualquer artigo de imigracao sem capa.
    image:
      art.cover_image ||
      "https://images.pexels.com/photos/1550337/pexels-photo-1550337.jpeg?auto=compress&cs=tinysrgb&w=1200",
    imageAlt: `capa do artigo ${art.title}`,
    quote: art.age_summary || art.excerpt || "Curadoria diária de inteligência artificial.",
    quoteBy: art.author || MARCA.nome,
    sections: art.content || [],
  }));
}

export async function getArticleBySlug(slug: string) {
  const all = await getAllArticlesForAdmin();
  const found = all.find((a) => a.slug === slug);
  /*
   * Só o publicado tem página (05/10/2026).
   *
   * Até aqui todo artigo do banco nascia `published`, e por isso a leitura
   * nunca perguntou o status. Com o portal como ramo próprio, a matéria nasce
   * `scheduled` e à espera de aprovação, e sem esta linha ela estaria no ar
   * pelo slug antes de alguém aprovar. Medido no banco nesta data: nenhum
   * artigo fora de `published`, então nada que estava no ar sai do ar.
   */
  if (found) return found.status === "published" ? found : null;

  const staticArt = staticArticles.find((a) => a.slug === slug);
  if (!staticArt) return null;

  return {
    slug: staticArt.slug,
    title: staticArt.title,
    excerpt: staticArt.excerpt,
    description: staticArt.description,
    cover_image: staticArt.image,
    status: "published" as const,
    category: staticArt.category,
    author: MARCA.nome,
    reading_minutes: parseInt(staticArt.readTime, 10) || 5,
    view_count: 0,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    content: staticArt.sections,
    content_html: sectionsToHtml(staticArt.title, staticArt.sections),
    age_summary: staticArt.quote,
  };
}

/**
 * Para onde vai o link antigo de uma edição (05/10/2026).
 *
 * As edições `edicao-AAAA-MM-DD` viraram uma matéria por pauta
 * (`src/scripts/artigos-por-pauta.ts`) e saíram da lista do portal. O link
 * delas está em e-mail enviado, em post e no Google, e não pode virar 404:
 * ele vai para a primeira matéria da edição, calculada pelo MESMO plano que o
 * script gravou, e só se ela estiver publicada. Sem isso, para a lista.
 *
 * `null` quando o slug não é de edição: aí a página segue para o 404 de
 * sempre. Falha de leitura também cai na lista, que existe, e não no 404.
 */
export async function destinoDoLinkDaEdicao(slug: string): Promise<string | null> {
  const { dataDaEdicao, destinoDaEdicao } = await import("./artigos-por-pauta");
  if (!dataDaEdicao(slug)) return null;
  try {
    const supabase = getSupabaseAdminClient();
    const { data: edicao, error } = await supabase
      .from("articles")
      .select("slug, project_id, published_at, cover_image, content, content_html")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !edicao) return "/artigos";
    const destino = destinoDaEdicao(edicao);
    if (!destino) return "/artigos";
    const { data: materia } = await supabase
      .from("articles")
      .select("slug")
      .eq("slug", destino)
      .eq("status", "published")
      .maybeSingle();
    return materia ? `/artigos/${destino}` : "/artigos";
  } catch {
    return "/artigos";
  }
}
