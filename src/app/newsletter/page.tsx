import Link from "next/link";
import { newsletterBenefits } from "@/lib/editorial";

export default function NewsletterPage() {
  return (
    <main className="editorial-shell">
      <div className="editorial-container max-w-3xl">
        <header className="mb-16 text-center">
          <div className="mb-10 flex items-center justify-between text-sm text-[var(--casaloti-secondary)]">
            <Link className="font-semibold text-[var(--casaloti-primary)]" href="/">Casaloti IA</Link>
            <Link className="smooth-link hover:text-[var(--casaloti-primary)]" href="/artigos">Blog</Link>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--casaloti-meta)]">Newsletter</p>
          <h1 className="journal-title mt-4">A news de IA para criar rotina</h1>
          <div className="mx-auto mt-6 h-1 w-20 bg-[var(--casaloti-primary)]" />
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-[var(--casaloti-secondary)]">
            Notícias buscadas automaticamente, transformadas em artigo, resumidas em newsletter e preparadas para virar post no Instagram.
          </p>
        </header>

        <form className="border border-[var(--casaloti-border)] p-4 sm:flex sm:gap-3">
          <input aria-label="Email para newsletter" className="mb-3 w-full px-4 py-3 text-sm outline-none sm:mb-0" placeholder="seu@email.com" type="email" />
          <button className="w-full bg-[var(--casaloti-primary)] px-5 py-3 text-sm font-semibold text-white sm:w-auto" type="button">Assinar newsletter</button>
        </form>

        <section className="mt-12 border-t border-[var(--casaloti-line)] pt-10">
          <h2 className="text-2xl font-medium tracking-[-0.025em]">O que entra na edição</h2>
          <ul className="mt-6 space-y-4 leading-7 text-[var(--casaloti-secondary)]">
            {newsletterBenefits.map((benefit) => <li key={benefit}>• {benefit}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
