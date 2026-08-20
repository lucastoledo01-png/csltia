import Image from "next/image";
import Link from "next/link";
import { articles } from "@/lib/editorial";

const navItems = [
  { href: "/ultraprompts", label: "UltraPrompts" },
  { href: "/artigos", label: "Artigos" },
  { href: "/formacoes", label: "Formações" },
];

function BrandMark() {
  return (
    <Link aria-label="Casaloti IA" className="flex items-center" href="/">
      <Image alt="Casaloti IA" className="h-9 w-auto object-contain" height={72} priority src="/brand/casaloti-logo-original.png" width={210} />
    </Link>
  );
}

function ArticlesHeader() {
  return (
    <header className="liquid-nav sticky top-3 z-20 mx-auto mt-3 flex w-[calc(100%-24px)] max-w-6xl items-center justify-between gap-4 px-4 py-3 text-sm sm:w-[calc(100%-32px)] md:px-5">
      <BrandMark />
      <nav aria-label="Navegação principal" className="hidden items-center gap-8 md:flex">
        {navItems.map((item) => (
          <Link className="font-medium text-black/75 transition-colors hover:text-[#ff4a1c]" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="cta-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-white sm:px-5" href="/newsletter">
        assinar
      </Link>
    </header>
  );
}

function FeaturedArticle() {
  const article = articles[0];

  return (
    <article className="glass-panel grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
      <div className="flex min-h-[420px] flex-col justify-between rounded-[28px] bg-[#050505] p-6 text-white sm:p-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/55">edição em destaque</p>
          <h2 className="mt-8 max-w-2xl text-[clamp(2.8rem,12vw,5.4rem)] font-black leading-[0.9] tracking-[-0.08em]">
            {article.title}
          </h2>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3 text-sm text-white/70">
          <span>{article.category}</span>
          <span>{article.date}</span>
          <span>{article.readTime}</span>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-8">
        <div aria-label="placeholder visual do artigo" className="article-glass-cover min-h-[260px] rounded-[32px] p-5">
          <div className="flex h-full min-h-[220px] flex-col justify-between rounded-[24px] bg-white/72 p-5 ring-1 ring-white/70">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-[#ff4a1c]">casaloti.log</span>
            <p className="text-5xl font-black tracking-[-0.08em] text-black">01</p>
          </div>
        </div>
        <p className="text-xl leading-8 text-[#4b5563]">{article.excerpt}</p>
        <Link className="inline-flex w-fit items-center rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white" href="/newsletter">
          comece por aqui
        </Link>
      </div>
    </article>
  );
}

function ArticleList() {
  return (
    <section aria-label="lista editorial de artigos" className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:px-5 md:grid-cols-2 lg:grid-cols-3">
      {articles.slice(1).map((article, index) => (
        <article className="group rounded-[28px] bg-white p-5 ring-1 ring-[#e5e7eb] transition-transform duration-200 hover:-translate-y-1 sm:p-6" key={article.slug}>
          <div aria-label="placeholder visual do artigo" className="article-mini-cover grid min-h-[180px] place-items-end rounded-[24px] p-4">
            <span className="rounded-full bg-white/80 px-3 py-1 font-mono text-xs font-semibold text-black ring-1 ring-white/80">0{index + 2}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#ff4a1c]">
            <span>{article.category}</span>
            <span>{article.date}</span>
          </div>
          <h3 className="article-title-hover mt-4 text-2xl font-black leading-7 tracking-[-0.05em] text-black">{article.title}</h3>
          <p className="mt-3 line-clamp-3 text-base leading-7 text-[#667085]">{article.excerpt}</p>
          <p className="mt-6 font-mono text-xs text-[#98a2b3]">{article.readTime} de leitura</p>
        </article>
      ))}
    </section>
  );
}

export default function ArticlesPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f5f7] text-black">
      <ArticlesHeader />
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-5 md:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#ff4a1c]">artigos</p>
        <div className="mt-5 grid gap-7 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-[clamp(3.2rem,16vw,7.5rem)] font-black leading-[0.86] tracking-[-0.09em] text-black">
              artigos com alma de Substack e tempero de lan house
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5563] sm:text-xl">
              edições, ensaios e prompts para entender IA sem virar refém do feed. Leitura boa, visual limpo e um pouco de nostalgia para lembrar que a internet já foi mais divertida.
            </p>
          </div>
          <form className="glass-strip flex flex-col gap-3 p-3 sm:flex-row lg:flex-col" id="assinar-artigos">
            <label className="sr-only" htmlFor="articles-email">Email para artigos</label>
            <input className="min-h-12 flex-1 rounded-full border border-black/10 bg-white px-4 outline-none placeholder:text-[#98a2b3]" id="articles-email" placeholder="seu email" type="email" />
            <button className="cta-gradient min-h-12 rounded-full px-6 font-semibold text-white" type="button">assinar</button>
          </form>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-5">
        <FeaturedArticle />
      </section>
      <ArticleList />
    </main>
  );
}
