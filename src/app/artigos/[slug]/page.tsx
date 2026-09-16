import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleComments } from "@/components/ArticleComments";
import { RodapeDoPortal, TopoDoPortal } from "@/components/PortalChrome";
import { SubstackArticleRenderer } from "@/components/SubstackArticleRenderer";
import { articles as staticArticles } from "@/lib/editorial";
import { getArticleBySlug } from "@/lib/server/articles-service";

/**
 * A listagem sai do banco, e o banco muda depois do build.
 *
 * Sem isto a página é pré-renderizada uma vez e servida com
 * `s-maxage=31536000`: um ano. A edição de 09/09 foi criada às 09:08, o build
 * era das 03:01, e o artigo existia, abria pela URL direta e simplesmente não
 * aparecia na lista — o que de fora é indistinguível de não ter sido escrito.
 *
 * Cinco minutos é folga suficiente para uma edição diária e ainda mantém a
 * página em cache na quase totalidade dos acessos.
 */
export const revalidate = 300;

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
    <main className="min-h-screen bg-white text-[#111827]">
      <TopoDoPortal />

      <div className="mx-auto max-w-[720px] px-4 pb-20 pt-6 sm:px-6 md:pt-10">
        <div className="mb-6">
          <Link className="inline-flex items-center gap-1 text-xs font-semibold text-[#E4344A] hover:underline" href="/artigos">
            ← Voltar para todos os artigos
          </Link>
        </div>

        {/* Renderizador Estilo Substack Clean */}
        <SubstackArticleRenderer
          title={article.title}
          subtitle={article.description}
          date={article.published_at ? new Date(article.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "20 de Agosto de 2026"}
          category={article.category}
          readTime={`${article.reading_minutes || 5} min`}
          coverImage={article.cover_image}
          contentHtml={article.content_html}
          sections={article.content}
          quote={article.age_summary}
          author={article.author}
        />

        {/* Seção de Comentários do Leitor com Likes & Dislikes */}
        <ArticleComments articleSlug={slug} />
      </div>
      <RodapeDoPortal />
    </main>
  );
}
