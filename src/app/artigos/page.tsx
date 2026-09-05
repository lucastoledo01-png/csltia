import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Article } from "@/lib/editorial";
import { getPublishedArticles } from "@/lib/server/articles-service";

function SubstackFeedCard({ article }: { article: Article }) {
  return (
    <article className="group border-b border-[#f3f4f6] pb-8 pt-6 transition-all">
      <div className="grid gap-6 md:grid-cols-[1fr_240px] items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E4344A]">
            <span>{article.category}</span>
            <span className="text-gray-300">•</span>
            <span className="text-[#6b7280] font-normal lowercase">{article.readTime}</span>
          </div>

          <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight text-[#111827] group-hover:text-[#E4344A] transition-colors">
            <Link href={`/artigos/${article.slug}`}>{article.title}</Link>
          </h2>

          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#4b5563]">
            {article.description}
          </p>

          <div className="mt-4 flex items-center gap-4 text-xs font-medium text-[#6b7280]">
            <span>{article.date}</span>
            <span>•</span>
            <Link className="font-semibold text-[#111827] hover:text-[#E4344A]" href={`/artigos/${article.slug}`}>
              Ler artigo →
            </Link>
          </div>
        </div>

        {article.image ? (
          <Link className="block overflow-hidden rounded-xl border border-[#eaecf0]" href={`/artigos/${article.slug}`}>
            <Image
              alt={article.imageAlt || article.title}
              className="aspect-[16/10] h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
              height={480}
              src={article.image}
              width={720}
            />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default async function ArticlesPage() {
  const publishedArticles = await getPublishedArticles();

  return (
    <main className="min-h-screen bg-white text-[#111827]">
      <SiteHeader ctaHref="#inscrever" />
      <section aria-label="lista editorial de artigos" className="mx-auto max-w-[760px] px-4 pb-20 pt-6 sm:px-6 md:pt-10" id="inscrever">
        <div className="border-b border-[#111827] pb-4">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#111827]">Artigos & Análises</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Leitura quinzenal sobre IA, produtos e tecnologia sem hype.</p>
        </div>

        <div className="mt-4 divide-y divide-[#f3f4f6]">
          {publishedArticles.map((article) => (
            <SubstackFeedCard article={article} key={article.slug} />
          ))}
        </div>
      </section>
    </main>
  );
}
