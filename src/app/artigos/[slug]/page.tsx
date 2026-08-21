import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleComments } from "@/components/ArticleComments";
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
    <main className="min-h-screen bg-white text-black">
      <SiteHeader ctaHref="/newsletter" />
      <article className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-5 md:pt-14">
        <Link className="text-sm font-semibold text-[#ff4a1c]" href="/artigos">Voltar para artigos</Link>
        <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#ff4a1c]">
          <span>{article.category}</span>
          <span>{article.date}</span>
          <span>{article.readTime}</span>
        </div>
        <h1 className="mt-5 text-[clamp(3rem,13vw,5.8rem)] font-black leading-[0.88] tracking-[-0.08em] text-black">
          {article.title}
        </h1>
        <p className="mt-6 text-xl leading-8 text-[#4b5563] md:text-2xl md:leading-9">{article.description}</p>
        <Image
          alt={article.imageAlt || article.title}
          className="mt-10 aspect-[5/3] h-auto w-full rounded-[32px] object-cover ring-1 ring-[#e5e7eb]"
          height={720}
          priority
          src={article.image || "/articles/radar-semana.svg"}
          width={1200}
        />
        <blockquote className="my-12 border-l-4 border-[#ff4a1c] pl-6 text-2xl font-black leading-8 tracking-[-0.04em] text-black">
          <p>{`"${article.quote}"`}</p>
          <footer className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#667085]">{article.quoteBy}</footer>
        </blockquote>
        <div className="space-y-12">
          {article.sections.map((section, idx) => (
            <section key={section.heading || idx}>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-black">{section.heading}</h2>
              <div className="mt-5 space-y-5 text-lg leading-8 text-[#344054]">
                {section.paragraphs.map((paragraph, pIdx) => (
                  <p key={pIdx}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Seção de Comentários dos Leitores */}
        <ArticleComments articleSlug={slug} />
      </article>
    </main>
  );
}
