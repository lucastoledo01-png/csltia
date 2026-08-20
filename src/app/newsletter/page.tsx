import Link from "next/link";
import { newsletterBenefits } from "@/lib/editorial";

export default function NewsletterPage() {
  return (
    <main className="the-news-shell">
      <div className="mx-auto min-h-screen max-w-3xl px-5 py-16 text-center">
        <header>
          <div className="mb-16 flex items-center justify-between text-sm">
            <Link className="font-black tracking-[-0.05em] text-black" href="/">Casaloti IA</Link>
            <Link className="font-medium hover:text-[#ff4a1c]" href="/artigos">Artigos</Link>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff4a1c]">Newsletter</p>
          <h1 className="mt-4 text-[clamp(3.5rem,9vw,6rem)] font-black leading-[0.9] tracking-[-0.08em] text-black">a news de IA para criar rotina</h1>
          <p className="mx-auto mt-8 max-w-2xl text-xl leading-8 text-[#667085]">
            Notícias de IA, prompts e ideias para abrir todo dia. Leitura rápida, tom humano e zero enrolação de robô.
          </p>
        </header>

        <form className="mx-auto mt-10 flex w-full max-w-[520px] items-center gap-2 rounded-full border border-black bg-white p-1.5">
          <input aria-label="Email para newsletter" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base outline-none" placeholder="seu@email.com" type="email" />
          <button className="cta-gradient rounded-full px-6 py-3 text-base font-medium text-white" type="button">inscreva-se</button>
        </form>

        <section className="mt-16 border-y border-black py-8 text-left">
          <h2 className="text-3xl font-black tracking-[-0.05em]">o que vem na edição</h2>
          <ul className="mt-6 space-y-4 leading-7 text-[#667085]">
            {newsletterBenefits.map((benefit) => <li key={benefit}>• {benefit}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
