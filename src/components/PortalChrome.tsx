import Link from "next/link";
import { logoDoSite, MARCA } from "@/lib/marca";
import { EDITORIAS, hrefDaEditoria } from "@/lib/editorias";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { PortalMenuMovel } from "@/components/PortalMenuMovel";

/**
 * O cromo do portal: a barra de topo e o rodapé.
 *
 * Vive fora da home porque não é da home. Enquanto estava lá dentro, `/artigos`
 * continuava com o cabeçalho branco da landing anterior, e o site tinha dois
 * menus diferentes conforme a página: foi assim que o dono viu "menu com texto
 * preto e fundo branco" num produto cujo topo é azul-marinho.
 *
 * Redesenho de 05/10/2026, sobre a referência do dono feita no Superdesign:
 * letra Sora, página branca, barra preta com a data, cabeçalho branco fixo no
 * computador e preto no celular, rodapé preto. O que a referência tinha e o
 * produto não tem (entrar, assinatura paga, busca, redes que não usamos,
 * páginas institucionais) ficou de fora, em vez de virar link morto.
 */

/** O fuso do projeto. A data da barra é a de Brasília, não a do servidor. */
const FUSO = "America/Sao_Paulo";

/**
 * A data de hoje, por extenso, no fuso do projeto.
 *
 * Calculada a cada renderização, e a home é dinâmica por requisição. O
 * servidor roda em UTC: com `new Date()` formatado sem fuso, das 21h à
 * meia-noite de Brasília a barra mostraria o dia seguinte, que é a mesma
 * armadilha da data da edição registrada em `aprendizados-e-incidentes.md`.
 */
export function dataDeHoje(agora: Date = new Date()): { longa: string; curta: string; iso: string } {
  const longa = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(agora);
  const curta = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(agora);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return { longa: longa.charAt(0).toUpperCase() + longa.slice(1), curta, iso: partes };
}

/**
 * Barra de topo e cabeçalho.
 *
 * As editorias apontam para âncoras da home (`/#editoria-...`), e não para
 * páginas de editoria: elas ainda não existem, e link de menu que leva a 404 é
 * pior que menu curto. Com a barra na frente, o mesmo link funciona de dentro
 * de um artigo, que antes apontava para uma âncora inexistente na própria
 * página do artigo.
 *
 * Depois, no mesmo 05/10/2026: as páginas de editoria passaram a existir
 * (`/editoria/<id>`), e o menu e o rodapé apontam para elas. As âncoras
 * `editoria-<id>` continuam nos cards de "Seções em foco" da home, para um
 * link antigo cair no card certo em vez de no topo.
 *
 * O logotipo segue a regra da marca: a versão é escolhida pela cor do fundo.
 * Fundo branco no computador, versão de fundo claro; fundo preto no celular,
 * versão de fundo escuro. A referência punha a versão de fundo escuro no
 * cabeçalho branco, o que deixaria o "eua" branco invisível.
 */
export function TopoDoPortal() {
  const hoje = dataDeHoje();

  return (
    <>
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] sm:px-6">
          <time dateTime={hoje.iso}>
            <span className="hidden sm:inline">{hoje.longa}</span>
            <span className="sm:hidden">{hoje.curta}</span>
          </time>
          <a href="#newsletter" className="text-marca-noite transition-colors hover:text-white">
            Assine a newsletter
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black text-white md:border-[#F4F4F5] md:bg-white md:text-[#0A0A0A]">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 md:h-20">
          <div className="flex items-center gap-10 lg:gap-12">
            <Link href="/" aria-label={`${MARCA.nome}, página inicial`} className="block shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDoSite(true)} alt={MARCA.nome} width={800} height={143} className="h-7 w-auto md:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDoSite(false)} alt={MARCA.nome} width={800} height={142} className="hidden h-8 w-auto md:block" />
            </Link>

            <nav aria-label="Editorias" className="hidden items-center gap-6 md:flex lg:gap-8">
              {EDITORIAS.map((e) => (
                <a
                  key={e.id}
                  href={hrefDaEditoria(e.id)}
                  className="text-sm font-semibold text-[#52525B] transition-colors hover:text-[#0A0A0A]"
                >
                  {e.nome}
                </a>
              ))}
            </nav>
          </div>

          <Link
            href="/artigos"
            className="hidden shrink-0 text-sm font-semibold text-[#0A0A0A] underline decoration-[var(--portal-vermelho)] decoration-2 underline-offset-[6px] md:block"
          >
            Edições
          </Link>

          <PortalMenuMovel />
        </div>
      </header>
    </>
  );
}

/**
 * A caixa de assinatura do portal.
 *
 * Toda página do portal tem UMA, com `id="newsletter"`, e é para ela que
 * apontam a barra de topo e o rodapé. Uma só por página porque cada uma traz
 * o próprio captcha.
 */
export function CaixaDeAssinatura({ origem, className = "" }: { origem: string; className?: string }) {
  return (
    <div id="newsletter" className={`scroll-mt-28 rounded-2xl border border-[#F4F4F5] bg-[#FAFAFA] p-6 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-marca-texto">Newsletter</p>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-[#0A0A0A]">
        Os Estados Unidos no seu e-mail, todo dia às 6h
      </h2>
      <p className="mb-4 mt-2 text-sm leading-relaxed text-[#52525B]">
        Uma edição por manhã, de graça, com a fonte ao lado de cada notícia.
      </p>
      <NewsletterSignup aparencia="portal" source={origem} />
    </div>
  );
}

function IconeInstagram() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RodapeDoPortal() {
  const ano = dataDeHoje().iso.slice(0, 4);

  return (
    <footer className="bg-black text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-5 pb-12 pt-14 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1.4fr] lg:gap-12 lg:py-16">
        <div className="col-span-2 lg:col-span-1">
          <Link href="/" aria-label={`${MARCA.nome}, página inicial`} className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDoSite(true)} alt={MARCA.nome} width={800} height={143} className="h-8 w-auto lg:h-9" />
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#A1A1AA]">{MARCA.descricao}</p>
          <a
            href={MARCA.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-marca-noite"
          >
            <IconeInstagram />
            {MARCA.instagramHandle}
            <span className="sr-only">no Instagram (abre em nova aba)</span>
          </a>
        </div>

        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-marca-noite">Editorias</h2>
          <nav aria-label="Editorias no rodapé">
            <ul className="mt-5 flex flex-col gap-3">
              {EDITORIAS.map((e) => (
                <li key={e.id}>
                  <a href={hrefDaEditoria(e.id)} className="text-sm text-[#A1A1AA] transition-colors hover:text-white">
                    {e.nome}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-marca-noite">O portal</h2>
          <ul className="mt-5 flex flex-col gap-3">
            <li>
              <Link href="/" className="text-sm text-[#A1A1AA] transition-colors hover:text-white">
                Página inicial
              </Link>
            </li>
            <li>
              <Link href="/artigos" className="text-sm text-[#A1A1AA] transition-colors hover:text-white">
                Todas as edições
              </Link>
            </li>
            <li>
              <a href={MARCA.instagram} target="_blank" rel="noopener noreferrer" className="text-sm text-[#A1A1AA] transition-colors hover:text-white">
                Instagram
              </a>
            </li>
          </ul>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-marca-noite">Newsletter</h2>
          <p className="mt-5 text-sm leading-relaxed text-[#A1A1AA]">
            Uma edição por dia, às 6h, de graça. Economia, trabalho, custo de vida e o que mais mexe com quem olha para os EUA.
          </p>
          <a
            href="#newsletter"
            className="mt-5 inline-block rounded-lg bg-[var(--portal-vermelho)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--portal-vermelho-texto)]"
          >
            Assinar
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-[10px] font-bold uppercase tracking-[0.14em] text-[#A1A1AA] sm:px-6 md:flex-row md:justify-between">
          <span>© {ano} {MARCA.nome}</span>
          <span>Conteúdo informativo, não orientação jurídica.</span>
        </div>
      </div>
    </footer>
  );
}

/**
 * A moldura de toda página do portal: letra, cor de fundo, topo e rodapé.
 *
 * A classe `portal` é o escopo do foco visível em `globals.css`, e
 * `font-portal` troca a letra só aqui: o painel continua em Inter.
 */
export function MolduraDoPortal({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal min-h-screen bg-white font-portal text-[#0A0A0A]">
      <TopoDoPortal />
      {children}
      <RodapeDoPortal />
    </div>
  );
}
