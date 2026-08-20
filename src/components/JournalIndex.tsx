import Image from "next/image";
import Link from "next/link";
import { articles } from "@/lib/editorial";

const navItems = [
  { href: "/ultraprompts", label: "UltraPrompts" },
  { href: "/artigos", label: "Artigos" },
  { href: "/formacoes", label: "Formações" },
];

const rotatingWords = ["aprende", "cria", "vende"];

const faqs = [
  "O que eu vou receber ao me inscrever?",
  "A newsletter é gratuita mesmo?",
  "O Casaloti IA vai me mandar spam?",
  "Por que esse jornal é diferente dos outros?",
  "Posso mandar para os amigos do grupo?",
  "Que horas chega?",
];

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link aria-label="Casaloti IA" className="flex items-center gap-2" href="/">
      <span className="grid size-7 place-items-center rounded-full brand-dot" />
      <span className={`text-xl font-black tracking-[-0.06em] ${dark ? "text-white" : "text-black"}`}>casaloti</span>
      <Image alt="IA" className="h-7 w-auto rounded-[8px] object-contain" height={42} priority src="/brand/casaloti-ia-badge.png" width={48} />
    </Link>
  );
}

function SignupForm({ compact = false }: { compact?: boolean }) {
  return (
    <form className={`mx-auto flex w-full max-w-[520px] items-center gap-2 rounded-full border border-black bg-white p-1.5 ${compact ? "mx-0" : ""}`}>
      <label className="sr-only" htmlFor={compact ? "footer-email" : "hero-email"}>Email para newsletter</label>
      <svg aria-hidden="true" className="ml-3 size-5 shrink-0 text-black" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect height="16" rx="2" width="20" x="2" y="4" />
        <path d="m22 7-10 6L2 7" />
      </svg>
      <input className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-[#6b7280]" id={compact ? "footer-email" : "hero-email"} placeholder="coloque seu email" type="email" />
      <button className="cta-gradient rounded-full px-6 py-3 text-base font-medium text-white shadow-[0_12px_24px_rgba(255,74,28,0.26)] transition-transform duration-200 ease-in-out hover:-translate-y-0.5" type="button">
        inscreva-se
      </button>
    </form>
  );
}

function Header() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-7 text-base md:px-8">
      <BrandMark />
      <nav aria-label="Navegação principal" className="hidden items-center gap-10 md:flex">
        {navItems.map((item) => (
          <Link className="font-medium text-black transition-colors hover:text-[#ff4a1c]" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="cta-gradient rounded-full px-6 py-3 font-medium text-white shadow-[0_12px_24px_rgba(255,74,28,0.28)] transition-transform hover:-translate-y-0.5" href="#inscrever">
        inscreva-se
      </Link>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-5 pb-24 pt-20 text-center md:pb-32 md:pt-28" id="inscrever">
      <h1 className="mx-auto max-w-5xl text-[clamp(3.9rem,10vw,8rem)] font-black leading-[0.9] tracking-[-0.08em] text-black">
        <span className="font-mono text-[0.45em] font-black tracking-[-0.08em] text-[#ff4a1c]">while IA atualiza()</span>
        <br />
        <span>você </span>
        <span className="inline-grid min-w-[0.9em] overflow-hidden align-baseline">
          {rotatingWords.map((word) => (
            <span className="headline-word row-start-1 col-start-1" key={word}>{word}</span>
          ))}
        </span>
      </h1>
      <p className="mx-auto mt-10 max-w-2xl text-xl leading-8 text-black md:text-2xl">
        todo dia, um resumo esperto sobre IA no seu email. Sem palestra de LinkedIn. Sem robô falando bonito. Coisa útil para abrir junto com o café.
      </p>
      <div className="mt-9">
        <SignupForm />
      </div>
      <div className="mx-auto mt-4 grid min-h-14 w-[300px] place-items-center border border-[#dedede] bg-white px-4 text-sm text-[#111827]">
        <span><span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-[#22a05a] text-white">✓</span> anti-spam entra aqui</span>
      </div>
      <Link className="mt-8 inline-flex items-center gap-2 text-base text-[#9ca3af] transition-colors hover:text-black" href="/artigos">
        ou leia as edições primeiro <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function IntelligenceSection() {
  return (
    <section className="px-5 py-24 text-center md:py-32">
      <h2 className="text-[clamp(2.6rem,6vw,4.7rem)] font-black leading-none tracking-[-0.07em] text-black">
        mais inteligente <span className="gradient-text">em 5 minutos</span>
      </h2>
      <div className="mx-auto mt-9 grid min-h-[440px] max-w-4xl items-center rounded-[42px] border border-[#cfd4dc] bg-white p-10 text-left md:min-h-[520px] md:grid-cols-[1fr_0.75fr] md:p-20">
        <div>
          <p className="text-[clamp(5rem,12vw,8rem)] font-black leading-none tracking-[-0.08em] text-[#ff4a1c]">3.</p>
          <h3 className="mt-2 max-w-sm text-[clamp(2rem,4vw,3.25rem)] font-black leading-[0.9] tracking-[-0.06em] text-black">
            leia, use e mande no grupo
          </h3>
          <p className="mt-4 max-w-sm text-lg leading-7 text-[#667085]">
            um ritualzinho diário para não se perder no feed. Pensa num MSN piscando, só que com coisa boa de IA.
          </p>
        </div>
        <div className="hidden justify-center md:flex">
          <span className="size-16 rounded-full bg-[#ffe1d8]" />
        </div>
      </div>
      <div className="mt-6 flex justify-center gap-2">
        <span className="size-3 rounded-full bg-[#d7dce3]" />
        <span className="size-3 rounded-full bg-[#c8cdd5]" />
        <span className="size-3 rounded-full bg-[#d7dce3]" />
      </div>
    </section>
  );
}

function HabitsSection() {
  return (
    <section className="bg-[#f7f7f7] px-5 py-24 md:py-32" id="marcas">
      <div className="mx-auto max-w-5xl">
        <h2 className="max-w-4xl text-[clamp(3rem,6vw,5rem)] font-black leading-[0.96] tracking-[-0.07em] text-black">
          criando bons hábitos e deixando a IA <span className="gradient-text">menos chata</span>
        </h2>
        <p className="mt-4 text-2xl leading-8 text-[#667085]">notícia boa, prompt de bolso e aquele clima de internet boa. Orkut, MSN, Windows XP, tudo no coração.</p>
        <div className="mt-16 grid gap-5 md:grid-cols-5">
          {articles.slice(0, 5).map((article, index) => (
            <article className="min-h-[360px] rounded-[24px] bg-white p-5 shadow-none ring-1 ring-[#e5e7eb]" key={article.slug}>
              <p className="text-xs font-semibold text-[#6b7280]">@casaloti.ia</p>
              <div className="mt-20 flex justify-center">
                <span className="cta-gradient grid size-16 place-items-center rounded-full text-2xl font-black text-white">{index + 1}</span>
              </div>
              <h3 className="mt-16 text-lg font-black leading-5 tracking-[-0.04em]">{article.category}</h3>
              <p className="mt-2 text-sm leading-5 text-[#667085]">{article.title}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="px-5 py-24 md:py-32" id="duvidas">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-[clamp(3rem,6vw,5rem)] font-black tracking-[-0.07em] text-black">dúvidas</h2>
        <div className="mt-3 border-y border-black">
          {faqs.map((faq) => (
            <details className="group border-b border-black py-6 last:border-b-0" key={faq}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-xl font-medium">
                <span><span className="mr-5 inline-block size-4 rounded-[3px] border-2 border-black align-[-1px]" />{faq}</span>
                <span className="text-2xl transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <p className="mt-4 max-w-3xl pl-10 leading-7 text-[#667085]">
                Você recebe um resumo com fonte, opinião honesta e um jeito prático de usar aquilo. Nada de spam. Nada de texto com cara de robô recém saído do Windows Movie Maker.
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section className="overflow-hidden px-5 pb-0 pt-10">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-[clamp(3rem,6vw,5rem)] font-black leading-[0.95] tracking-[-0.07em] text-black">
            <span className="gradient-text">+ esperto</span><br />em 5 minutos
          </h2>
          <p className="mt-5 text-2xl leading-8 text-[#667085]">
            IA relevante, direto no email, <strong className="text-black">todo dia às 06:06</strong>. Igual abrir o MSN de manhã, só que sem nudges.
          </p>
          <div className="mt-8"><SignupForm compact /></div>
        </div>
        <div className="relative min-h-[420px]">
          <div className="absolute bottom-0 right-2 h-[430px] w-[360px] rounded-t-full bg-[#ffe1d8]" />
          <div className="absolute bottom-[-60px] right-16 h-[520px] w-[245px] rotate-[-10deg] rounded-[42px] border-[12px] border-black bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
            <div className="mx-auto mb-5 h-7 w-24 rounded-full bg-black" />
            <div className="rounded-2xl bg-[#fff0eb] p-4 text-center text-xl font-black">casaloti ia</div>
            <div className="mt-5 rounded-2xl border border-[#e5e7eb] p-4">
              <p className="text-xl font-black leading-6">o que é seu, te encontra</p>
              <p className="mt-3 text-sm leading-5 text-[#667085]">bom dia. a IA mudou, mas sua rotina não precisa virar bagunça.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#101010] px-5 py-20 text-white">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1fr_1fr_220px]">
        <div>
          <BrandMark dark />
          <p className="mt-7 max-w-xs text-lg leading-7 text-white/85">um jornal de IA para quem sente saudade da internet com alma.</p>
        </div>
        <nav className="grid gap-4 text-lg text-white/85 md:grid-cols-2" aria-label="Links do rodapé">
          <Link href="/ultraprompts">UltraPrompts</Link>
          <Link href="/artigos">Artigos</Link>
          <Link href="/formacoes">Formações</Link>
          <Link href="#duvidas">perguntas frequentes</Link>
        </nav>
        <Link className="cta-gradient h-fit rounded-full px-8 py-4 text-center text-lg font-medium text-white shadow-[0_12px_24px_rgba(255,74,28,0.28)]" href="#inscrever">
          inscreva-se
        </Link>
      </div>
      <div className="mx-auto mt-20 flex max-w-6xl gap-10 text-sm text-white/35">
        <span>© 2026 Casaloti IA</span>
        <span>Políticas de Privacidade</span>
        <span>Termos de Uso</span>
      </div>
    </footer>
  );
}

export default function JournalIndex() {
  return (
    <main className="the-news-shell">
      <Header />
      <Hero />
      <IntelligenceSection />
      <HabitsSection />
      <FaqSection />
      <BottomCta />
      <Footer />
    </main>
  );
}
