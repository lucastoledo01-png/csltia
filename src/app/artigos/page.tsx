import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { articles } from "@/lib/editorial";

function ArticleCard({ article, featured = false }: { article: (typeof articles)[number]; featured?: boolean }) {
  return (
    <article className={featured ? "glass-panel grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1fr] lg:p-8" : "group rounded-[28px] bg-white p-5 ring-1 ring-[#e5e7eb] transition-transform duration-200 hover:-translate-y-1 sm:p-6"}>
      <Link aria-label={`Abrir capa de ${article.title}`} className="block overflow-hidden rounded-[24px]" href={`/artigos/${article.slug}`}>
        <Image
          alt={article.imageAlt}
          className="aspect-[5/3] h-auto w-full object-cover"
          height={720}
          src={article.image}
          width={1200}
        />
      </Link>
      <div className={featured ? "flex flex-col justify-center" : ""}>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#ff4a1c]">
          <span>{article.category}</span>
          <span>{article.date}</span>
        </div>
        <h2 className={featured ? "mt-4 text-[clamp(2.4rem,9vw,4.6rem)] font-black leading-[0.9] tracking-[-0.08em] text-black" : "article-title-hover mt-4 text-2xl font-black leading-7 tracking-[-0.05em] text-black"}>
          <Link href={`/artigos/${article.slug}`}>{article.title}</Link>
        </h2>
        <p className={featured ? "mt-5 text-xl leading-8 text-[#4b5563]" : "mt-3 line-clamp-3 text-base leading-7 text-[#667085]"}>{article.description}</p>
        <Link className="mt-6 inline-flex w-fit rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white" href={`/artigos/${article.slug}`}>
          Ler {article.title}
        </Link>
      </div>
    </article>
  );
}

export default function ArticlesPage() {
  const [featured, ...rest] = articles;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f5f7] text-black">
      <SiteHeader ctaHref="#inscrever" />
      <section aria-label="lista editorial de artigos" className="mx-auto grid max-w-6xl gap-5 px-4 pb-20 pt-6 sm:px-5 md:grid-cols-2 md:pt-10 lg:grid-cols-3" id="inscrever">
        <div className="md:col-span-2 lg:col-span-3">
          <ArticleCard article={featured} featured />
        </div>
        {rest.map((article) => (
          <ArticleCard article={article} key={article.slug} />
        ))}
      </section>
    </main>
  );
}
