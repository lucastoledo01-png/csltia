import Image from "next/image";
import Link from "next/link";
import { FooterBrandMark, SiteHeader } from "@/components/SiteHeader";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { articles as artigosDeBase, type Article } from "@/lib/editorial";
import { MARCA } from "@/lib/marca";

const faqs = [
  {
    q: "O que eu vou receber ao me inscrever?",
    a: `Uma edição diária da ${MARCA.nome} com o que mudou em imigração para os Estados Unidos: regras, prazos, decisões e o que isso significa para brasileiros — sempre com a fonte oficial ao lado.`,
  },
  {
    q: "A newsletter é gratuita?",
    a: `Sim, 100% gratuita. Você pode ler pelo e-mail ou aqui no portal ${MARCA.nome} a qualquer momento.`,
  },
  {
    q: "Com que frequência as edições são enviadas?",
    a: "Enviamos edições diárias nas primeiras horas da manhã, prontas para sua leitura matinal sem enrolação.",
  },
  {
    q: "Como o conteúdo é selecionado?",
    a: "Filtramos o barulho e o hype do mercado para destacar apenas o que realmente possui utilidade prática em rotinas de trabalho, criação e produtos.",
  },
];

function Hero() {
  return (
    <section className="mx-auto max-w-[760px] px-4 pb-16 pt-12 text-center sm:px-6 md:pb-24 md:pt-20" id="inscrever">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-1 text-xs font-semibold text-[#374151]">
        <span className="flex items-center gap-1.5 font-mono">
          <span className="flex h-4 w-4 items-center justify-center rounded-md bg-[#E4344A] text-[10px] font-black text-white">b.</span>
          {MARCA.nome}
        </span>
        <span className="text-gray-300">•</span>
        <span className="text-[#E4344A]">edição diária</span>
      </div>

      <h1 className="mx-auto mt-4 font-serif text-3xl font-bold leading-tight tracking-tight text-[#111827] sm:text-5xl">
        {MARCA.tagline}
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#4b5563] sm:text-lg">
        Um resumo diário sobre modelos, ferramentas, automação e o que realmente importa em IA, sem perder tempo com ruído.
      </p>

      <div className="mt-8 max-w-md mx-auto">
        <NewsletterSignup source="newsletter-home" />
      </div>

      <p className="mt-3 text-xs text-[#6b7280]">
        Sem spam. Cancele quando quiser com 1 clique.
      </p>
    </section>
  );
}

function RecentArticlesFeed({ listaDeArtigos }: { listaDeArtigos: Article[] }) {
  return (
    <section className="border-t border-[#f3f4f6] bg-[#fafafa] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-[760px]">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-[#111827]">Últimas Edições</h2>
            <p className="mt-0.5 text-xs text-[#6b7280]">Análises recentes publicadas no portal.</p>
          </div>
          <Link href="/artigos" className="text-xs font-semibold text-[#E4344A] hover:underline">
            Ver todas →
          </Link>
        </div>

        <div className="mt-4 divide-y divide-[#e5e7eb]">
          {listaDeArtigos.slice(0, 4).map((art) => (
            <article key={art.slug} className="group py-6">
              <div className="grid gap-6 md:grid-cols-[1fr_200px] items-center">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E4344A]">
                    <span>{art.category}</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-[#6b7280] font-normal lowercase">{art.readTime}</span>
                  </div>

                  <h3 className="mt-2 font-serif text-xl font-bold text-[#111827] group-hover:text-[#E4344A] transition-colors">
                    <Link href={`/artigos/${art.slug}`}>{art.title}</Link>
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#4b5563]">
                    {art.description}
                  </p>

                  <div className="mt-3 flex items-center gap-3 text-xs font-medium text-[#6b7280]">
                    <span>{art.date}</span>
                    <span>•</span>
                    <Link href={`/artigos/${art.slug}`} className="font-semibold text-[#111827] hover:text-[#E4344A]">
                      Ler edição →
                    </Link>
                  </div>
                </div>

                {art.image ? (
                  <Link href={`/artigos/${art.slug}`} className="block overflow-hidden rounded-xl border border-[#eaecf0]">
                    <Image
                      src={art.image}
                      alt={art.imageAlt || art.title}
                      width={400}
                      height={250}
                      className="aspect-[16/10] h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="px-4 py-16 sm:px-6" id="duvidas">
      <div className="mx-auto max-w-[760px]">
        <h2 className="font-serif text-2xl font-bold text-[#111827]">Perguntas Frequentes</h2>
        <div className="mt-6 divide-y divide-[#f3f4f6] border-t border-b border-[#f3f4f6]">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-[#111827]">
                <span>{faq.q}</span>
                <span className="text-gray-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#e5e7eb] bg-[#fafafa] px-4 py-12 text-[#6b7280] sm:px-6">
      <div className="mx-auto max-w-[760px] flex flex-wrap items-center justify-between gap-6">
        <div>
          <FooterBrandMark />
          <p className="mt-2 text-xs">{MARCA.nome} — {MARCA.descricao}</p>
        </div>

        <nav aria-label="Links do rodapé" className="flex flex-wrap gap-6 text-xs font-medium text-[#374151]">
          <Link href="/artigos" className="hover:text-[#E4344A]">Artigos</Link>
          <Link href="/ultraprompts" className="hover:text-[#E4344A]">UltraPrompts</Link>
          <Link href="/formacoes" className="hover:text-[#E4344A]">Formações</Link>
          <Link href="#duvidas" className="hover:text-[#E4344A]">Dúvidas</Link>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-[760px] border-t border-[#eaecf0] pt-6 text-xs text-[#9ca3af] flex justify-between">
        <span>© 2026 {MARCA.nome}. Todos os direitos reservados.</span>
        <div className="flex gap-4">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </div>
      </div>
    </footer>
  );
}

/**
 * A home listava só os artigos escritos no código.
 *
 * As edições diárias, que são o conteúdo vivo do site, nunca apareciam ali:
 * elas vivem no banco. A lista da vertical antiga ficou no ar depois da troca
 * porque nada nesta tela lia o banco.
 *
 * A busca acontece na página, que é server component de verdade, e chega aqui
 * por propriedade. Fazer este componente `async` seria mais curto e quebraria
 * todo teste de render: biblioteca de teste não monta server component
 * assíncrono. O padrão continua sendo buscar em cima e passar para baixo.
 */
export default function JournalIndex({
  listaDeArtigos = artigosDeBase,
}: {
  listaDeArtigos?: Article[];
}) {

  return (
    <main className="min-h-screen bg-white text-[#111827]">
      <SiteHeader />
      <Hero />
      <RecentArticlesFeed listaDeArtigos={listaDeArtigos} />
      <FaqSection />
      <Footer />
    </main>
  );
}
