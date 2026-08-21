import { articles as staticArticles, Article } from "@/lib/editorial";
import { getSupabaseAdminClient } from "./supabase-admin";

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
  tags?: string[];
  source_urls?: string[];
  seo_title?: string;
  seo_description?: string;
  aeo_questions?: any;
  age_summary?: string;
  editorial_score?: number;
  manual_review_status?: string;
};

export async function getAllArticlesForAdmin(): Promise<AdminArticleRecord[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt || row.description || "",
        description: row.description || row.excerpt || "",
        cover_image: row.cover_image,
        status: row.status || "published",
        category: row.category || "IA",
        author: row.author || "Casaloti IA",
        reading_minutes: row.reading_minutes || 5,
        view_count: Number(row.view_count || 0),
        published_at: row.published_at,
        created_at: row.created_at,
        content: Array.isArray(row.content) && row.content.length > 0
          ? row.content
          : [{ heading: "Visão Geral", paragraphs: [row.description || row.excerpt || "Conteúdo em atualização."] }],
        tags: row.tags || [],
        source_urls: row.source_urls || [],
        seo_title: row.seo_title || "",
        seo_description: row.seo_description || "",
        age_summary: row.age_summary || "",
        editorial_score: row.editorial_score || 85,
        manual_review_status: row.manual_review_status || "approved",
      }));
    }
  } catch (err) {
    console.error("Erro ao buscar artigos do Supabase:", err);
  }

  // Fallback estático caso o banco ainda não possua registros
  return staticArticles.map((art) => ({
    slug: art.slug,
    title: art.title,
    excerpt: art.excerpt,
    description: art.description,
    cover_image: art.image,
    status: "published",
    category: art.category,
    author: "Casaloti IA",
    reading_minutes: parseInt(art.readTime, 10) || 5,
    view_count: 142,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    content: art.sections,
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
    date: art.published_at ? new Date(art.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : "20 AGO 2026",
    readTime: `${art.reading_minutes || 5} min`,
    image: art.cover_image || "/articles/radar-semana.svg",
    imageAlt: `capa do artigo ${art.title}`,
    quote: art.age_summary || art.excerpt || "IA em evolução contínua.",
    quoteBy: art.author || "Casaloti IA",
    sections: art.content || [],
  }));
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const all = await getPublishedArticles();
  const found = all.find((a) => a.slug === slug);
  if (found) return found;

  const staticArt = staticArticles.find((a) => a.slug === slug);
  return staticArt || null;
}
