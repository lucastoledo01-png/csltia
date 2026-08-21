import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleComments } from "@/components/ArticleComments";
import { NewsletterRenderer } from "@/components/NewsletterRenderer";
import { SiteHeader } from "@/components/SiteHeader";
import { articles as staticArticles } from "@/lib/editorial";
import { getArticleBySlug } from "@/lib/server/articles-service";

export function generateStaticParams() {
  return staticArticles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-black">
      <SiteHeader ctaHref="/newsletter" />

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-5 md:pt-10">
        <div className="mb-6">
          <Link className="inline-flex items-center gap-1 text-sm font-bold text-[#ff4a1c] hover:underline" href="/artigos">
            ← Voltar para todos os artigos
          </Link>
        </div>

        {/* Renderizador no Padrão 100% The News */}
        <NewsletterRenderer
          title={article.title}
          subtitle={article.description}
          date={article.published_at ? new Date(article.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : "20 AGO 2026"}
          category={article.category}
          readTime={`${article.reading_minutes || 5} min`}
          coverImage={article.cover_image}
          contentHtml={article.content_html}
          sections={article.content}
          quote={article.age_summary}
        />

        {/* Seção de Comentários do Leitor com Likes & Dislikes */}
        <ArticleComments articleSlug={slug} />
      </div>
    </main>
  );
}
