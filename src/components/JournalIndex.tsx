import Image from "next/image";
import Link from "next/link";
import { articles } from "@/lib/editorial";

const navItems = [
  { href: "/artigos", label: "app" },
  { href: "/automacao", label: "streak" },
  { href: "/newsletter", label: "podcast" },
  { href: "#marcas", label: "marcas" },
  { href: "#duvidas", label: "dúvidas" },
];

const faqs = [
  "O que eu vou receber ao me inscrever?",
  "A newsletter é realmente gratuita?",
  "O Casaloti IA tem viés político?",
  "Vou receber spam ou propagandas indesejadas?",
  "Como os emails não vão parar em promoções?",
  "Posso compartilhar a newsletter com amigos?",
  "Por que essa newsletter é diferente das outras?",
];

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link aria-label="Casaloti IA" className="flex items-center gap-2" href="/">
      <span className="relative grid size-7 place-items-center rounded-full bg-[linear-gradient(135deg,#ffd21a,#ff4d1f)]">
        <span className="absolute -left-1 h-1.5 w-3 rounded-full bg-[#ffd21a]" />
      </span>
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
      <button className="rounded-full bg-[linear-gradient(135deg,#ffc400,#ff7a45)] px-6 py-3 text-base font-medium text-black shadow-[0_12px_24px_rgba(255,122,69,0.26)] transition-transform duration-200 ease-in-out hover:-translate-y-0.5" type="button">
        inscreva-se
      </button>
    </form>
  );
}

function Header() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-7 text-base md:px-8">
      <BrandMark />
      <nav aria-label="Navegação principal" className="hidden items-center gap-9 md:flex">
        {navItems.map((item) => (
          <Link className="font-medium text-black transition-colors hover:text-[#ff8a2a]" href={item.href} key={item.href}>
            {item.label}
            {item.label === "app" || item.label === "streak" || item.label === "podcast" ? <span className="ml-1 text-sm">↗</span> : null}
          </Link>
        ))}
      </nav>
      <Link className="rounded-full bg-[linear-gradient(135deg,#ffc400,#ff7a45)] px-6 py-3 font-medium text-black shadow-[0_12px_24px_rgba(255,122,69,0.28)] transition-transform hover:-translate-y-0.5" href="#inscrever">
        inscreva-se
      </Link>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-5 pb-24 pt-20 text-center md:pb-32 md:pt-28" id="inscrever">
      <h1 className="mx-auto max-w-4xl text-[clamp(4.5rem,11vw,8.5rem)] font-black leading-[0.88] tracking-[-0.08em] text-black">
        o_ jornal digital da IA
      </h1>
      <p className="mx-auto mt-10 max-w-2xl text-xl leading-8 text-black md:text-2xl">
        as principais notícias de inteligência artificial, benchmarks e prompts, diariamente no seu email <strong>totalmente grátis.</strong>
      </p>
      <div className="mt-9">
        <SignupForm />
      </div>
      <div className="mx-auto mt-4 grid h-14 w-[300px] place-items-center border border-[#dedede] bg-white text-sm text-[#111827]">
        <span><span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-[#22a05a] text-white">✓</span> Sucesso! <span className="ml-7 font-black text-[#ff7a1a]">CLOUDFLARE</span></span>
      </div>
      <Link className="mt-8 inline-flex items-center gap-2 text-base text-[#9ca3af] transition-colors hover:text-black" href="/artigos">
        ou leia nossas edições primeiro <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function IntelligenceSection() {
  return (
    <section className="px-5 py-24 text-center md:py-32">
      <h2 className="text-[clamp(2.6rem,6vw,4.7rem)] font-black leading-none tracking-[-0.07em] text-black">
        mais inteligente <span className="bg-[linear-gradient(135deg,#ffc400,#ff7a45)] bg-clip-text text-transparent">em 5 minutos</span>
      </h2>
      <div className="mx-auto mt-9 grid min-h-[440px] max-w-4xl items-center rounded-[42px] border border-[#cfd4dc] bg-white p-10 text-left md:min-h-[520px] md:grid-cols-[1fr_0.75fr] md:p-20">
        <div>
          <p className="text-[clamp(5rem,12vw,8rem)] font-black leading-none tracking-[-0.08em] text-[#ffcf22]">3.</p>
          <h3 className="mt-2 max-w-sm text-[clamp(2rem,4vw,3.25rem)] font-black leading-[0.9] tracking-[-0.06em] text-black">
            indique e ganhe inteligência
          </h3>
          <p className="mt-4 max-w-sm text-lg leading-7 text-[#667085]">
            leia todos os dias, aumente seu streak e use IA melhor com notícias úteis, não barulho.
          </p>
        </div>
        <div className="hidden justify-center md:flex">
          <span className="size-16 rounded-full bg-[#ffed91]" />
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
          criando bons hábitos e te deixando <span className="bg-[linear-gradient(135deg,#ffc400,#ff7a45)] bg-clip-text text-transparent">mais inteligente</span>
        </h2>
        <p className="mt-4 text-2xl leading-8 text-[#667085]">nos comprometemos a entregar IA da forma mais inteligente.</p>
        <div className="mt-16 grid gap-5 md:grid-cols-5">
          {articles.slice(0, 5).map((article, index) => (
            <article className="min-h-[360px] rounded-[24px] bg-white p-5 shadow-none ring-1 ring-[#e5e7eb]" key={article.slug}>
              <p className="text-xs font-semibold text-[#6b7280]">@casaloti.ia</p>
              <div className="mt-20 flex justify-center">
                <span className="grid size-16 place-items-center rounded-full bg-[linear-gradient(135deg,#ffc400,#ff7a45)] text-2xl font-black">{index + 1}</span>
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
                Você recebe uma curadoria diária com fontes, contexto, aplicação prática e próximos passos. O sistema começa com guardrails e revisão para evitar spam, hype e informação sem origem.
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
            <span className="bg-[linear-gradient(135deg,#ffc400,#ff7a45)] bg-clip-text text-transparent">+ inteligente</span><br />em 5 minutos
          </h2>
          <p className="mt-5 text-2xl leading-8 text-[#667085]">
            notícias relevantes e imparciais, direto no seu email gratuitamente, <strong className="text-black">todo dia, às 06:06</strong>
          </p>
          <div className="mt-8"><SignupForm compact /></div>
        </div>
        <div className="relative min-h-[420px]">
          <div className="absolute bottom-0 right-2 h-[430px] w-[360px] rounded-t-full bg-[#ffde59]" />
          <div className="absolute bottom-[-60px] right-16 h-[520px] w-[245px] rotate-[-10deg] rounded-[42px] border-[12px] border-black bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
            <div className="mx-auto mb-5 h-7 w-24 rounded-full bg-black" />
            <div className="rounded-2xl bg-[#fff3c4] p-4 text-center text-xl font-black">casaloti ia</div>
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
          <p className="mt-7 max-w-xs text-lg leading-7 text-white/85">tudo que você precisa saber para usar IA melhor todo dia.</p>
        </div>
        <nav className="grid gap-4 text-lg text-white/85 md:grid-cols-2" aria-label="Links do rodapé">
          <Link href="/newsletter">newsletter casaloti</Link>
          <Link href="#marcas">nossas marcas</Link>
          <Link href="/automacao">automação 06:06</Link>
          <Link href="#duvidas">perguntas frequentes</Link>
        </nav>
        <Link className="h-fit rounded-full bg-[linear-gradient(135deg,#ffc400,#ff7a45)] px-8 py-4 text-center text-lg font-medium text-black shadow-[0_12px_24px_rgba(255,122,69,0.28)]" href="#inscrever">
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
