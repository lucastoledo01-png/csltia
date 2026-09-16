import Link from "next/link";
import { logoDoSite, MARCA } from "@/lib/marca";
import { EDITORIAS, nomeDaEditoria } from "@/lib/editorias";
import type { PautaDoPortal } from "@/lib/server/portal";
import { NewsletterSignup } from "@/components/NewsletterSignup";

/**
 * A home do portal, no formato de jornal.
 *
 * A referência de estrutura é o Not Journal: manchete com foto ocupando metade
 * da primeira dobra, coluna de chamadas ao lado, faixa de três, lista
 * cronológica com barra lateral, e blocos por editoria embaixo. É um formato
 * que resolve o problema de um portal diário: mostrar muita matéria sem que a
 * página vire uma lista uniforme onde nada se destaca.
 *
 * A identidade é nossa. Onde eles usam preto com acento em amarelo-neon, aqui
 * é o azul-marinho e o vermelho da bandeira, que já são as cores da marca no
 * e-mail e nos posts. Copiar a gramática do formato é normal; copiar a
 * vestimenta da marca alheia faria o produto parecer clone.
 */

function Chapeu({ texto, tom = "vermelho" }: { texto: string; tom?: "vermelho" | "claro" }) {
  return (
    <span
      className={`inline-block px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] ${
        tom === "vermelho" ? "bg-[#E4344A] text-white" : "bg-white/90 text-[#0A3161]"
      }`}
    >
      {texto}
    </span>
  );
}

function Data({ valor }: { valor: string }) {
  const [a, m, d] = valor.split("-");
  return (
    <time className="text-[11px] text-[#71717A]" dateTime={valor}>
      {d}/{m}/{a}
    </time>
  );
}

/** A manchete: foto grande com o título sobreposto. */
function Manchete({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group relative block overflow-hidden">
      {pauta.imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pauta.imagem}
          alt=""
          className="h-[320px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] sm:h-[420px]"
        />
      ) : (
        <div className="h-[320px] w-full bg-[#0A3161] sm:h-[420px]" />
      )}

      {/* O degradê existe para o título ter contraste sobre qualquer foto. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
        <Chapeu texto={pauta.rotulo} />
        <h2 className="mt-3 max-w-3xl text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] text-white sm:text-[34px]">
          {pauta.titulo}
        </h2>
        <p className="mt-2 text-[12px] text-white/70">
          {MARCA.nome} · {pauta.data.split("-").reverse().join("/")}
        </p>
      </div>
    </Link>
  );
}

/** Chamada de texto, sem foto, para a coluna ao lado da manchete. */
function Chamada({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group block border-b border-[#E4E4E7] py-3 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#E4344A]">
        {pauta.rotulo}
      </span>
      <h3 className="mt-1 text-[15px] font-semibold leading-[1.35] text-[#111111] group-hover:text-[#0A3161]">
        {pauta.titulo}
      </h3>
    </Link>
  );
}

/** Card com foto em cima e título embaixo. */
function Card({ pauta, alturaFoto = "h-[150px]" }: { pauta: PautaDoPortal; alturaFoto?: string }) {
  return (
    <Link href={pauta.href} className="group block">
      {pauta.imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pauta.imagem} alt="" className={`${alturaFoto} w-full object-cover`} />
      ) : (
        <div className={`${alturaFoto} w-full bg-[#F4F4F5]`} />
      )}
      <div className="pt-3">
        <Chapeu texto={pauta.rotulo} />
        <h3 className="mt-2 text-[16px] font-bold leading-[1.3] tracking-[-0.01em] text-[#111111] group-hover:text-[#0A3161]">
          {pauta.titulo}
        </h3>
      </div>
    </Link>
  );
}

/** Linha da lista cronológica: miniatura à esquerda, texto à direita. */
function Linha({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group flex gap-4 border-b border-[#E4E4E7] py-5 last:border-0">
      {pauta.imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pauta.imagem} alt="" className="h-[84px] w-[112px] shrink-0 object-cover" />
      ) : (
        <div className="h-[84px] w-[112px] shrink-0 bg-[#F4F4F5]" />
      )}
      <div className="min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#E4344A]">
          {pauta.rotulo}
        </span>
        <h3 className="mt-1 text-[17px] font-bold leading-[1.3] tracking-[-0.01em] text-[#111111] group-hover:text-[#0A3161]">
          {pauta.titulo}
        </h3>
        {pauta.resumo ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-[#52525B]">{pauta.resumo}</p>
        ) : null}
        <p className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-[#71717A]">{pauta.fonte || MARCA.nome}</span>
          <span className="text-[11px] text-[#D4D4D8]">·</span>
          <Data valor={pauta.data} />
        </p>
      </div>
    </Link>
  );
}

function TituloDeSecao({ texto }: { texto: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 border-b-2 border-[#0A3161] pb-2">
      <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#0A3161]">{texto}</h2>
    </div>
  );
}

/**
 * Barra de topo, escura, com as editorias.
 *
 * As editorias apontam para âncoras da própria home, e não para páginas de
 * editoria: elas ainda não existem, e link de menu que leva a 404 é pior que
 * menu curto. Quando a página de editoria existir, só o href muda.
 */
function TopoDoPortal() {
  return (
    <header className="bg-[#0A3161]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        <Link href="/" aria-label={MARCA.nome} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDoSite(true)} alt={MARCA.nome} className="h-7 w-auto" />
        </Link>

        <nav aria-label="Editorias" className="hidden items-center gap-6 md:flex">
          {EDITORIAS.map((e) => (
            <a
              key={e.id}
              href={`#editoria-${e.id}`}
              className="text-[13px] font-medium text-white/80 transition-colors hover:text-white"
            >
              {e.nome}
            </a>
          ))}
        </nav>

        <a
          href="#newsletter"
          className="shrink-0 bg-[#E4344A] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
        >
          Assinar
        </a>
      </div>
    </header>
  );
}

function RodapeDoPortal() {
  return (
    <footer className="mt-16 bg-[#0A3161] text-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDoSite(true)} alt={MARCA.nome} className="h-8 w-auto" />
          <p className="mt-4 max-w-sm text-[13px] leading-[1.6]">{MARCA.descricao}</p>
          <a
            href={MARCA.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-[13px] text-white/80 hover:text-white"
          >
            {MARCA.instagramHandle} no Instagram
          </a>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Editorias</p>
          <ul className="mt-3 space-y-2">
            {EDITORIAS.map((e) => (
              <li key={e.id}>
                <a href={`#editoria-${e.id}`} className="text-[13px] hover:text-white">
                  {e.nome}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Newsletter</p>
          <p className="mt-3 text-[13px] leading-[1.6]">
            Uma edição por dia, às 6h, de graça.
          </p>
          <a
            href="#newsletter"
            className="mt-3 inline-block bg-[#E4344A] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white hover:opacity-90"
          >
            Assinar
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-5 text-[12px] text-white/50 sm:px-6">
          © 2026 {MARCA.nome}. Conteúdo informativo, não orientação jurídica.
        </div>
      </div>
    </footer>
  );
}

export type DadosDaHome = {
  destaque: PautaDoPortal | null;
  chamadas: PautaDoPortal[];
  secundarias: PautaDoPortal[];
  ultimas: PautaDoPortal[];
  porEditoria: Array<{ editoria: (typeof EDITORIAS)[number]["id"]; itens: PautaDoPortal[] }>;
};

export function PortalHome({ dados }: { dados: DadosDaHome }) {
  const { destaque, chamadas, secundarias, ultimas, porEditoria } = dados;

  return (
    <>
      <TopoDoPortal />
      <main className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* ---- primeira dobra ---- */}
        {destaque ? (
          <section className="grid gap-6 lg:grid-cols-[1.9fr_1fr]">
            <Manchete pauta={destaque} />
            <div className="lg:border-l lg:border-[#E4E4E7] lg:pl-6">
              {chamadas.map((p) => (
                <Chamada key={p.id} pauta={p} />
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- faixa de três ---- */}
        {secundarias.length > 0 ? (
          <section className="mt-10 grid gap-6 border-t border-[#E4E4E7] pt-8 sm:grid-cols-3">
            {secundarias.map((p) => (
              <Card key={p.id} pauta={p} />
            ))}
          </section>
        ) : null}

        {/* ---- últimas + barra lateral ---- */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.9fr_1fr]">
          <section>
            <TituloDeSecao texto="Últimas notícias" />
            {ultimas.map((p) => (
              <Linha key={p.id} pauta={p} />
            ))}
          </section>

          <aside className="space-y-8">
            <div id="newsletter" className="scroll-mt-20 bg-[#0A3161] p-6 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
                Newsletter
              </p>
              <p className="mt-2 text-[19px] font-bold leading-[1.25]">
                O que muda para quem vai para os EUA, todo dia às 6h.
              </p>
              <div className="mt-4">
                <NewsletterSignup />
              </div>
            </div>

            {chamadas.length > 0 ? (
              <div>
                <TituloDeSecao texto="Mais lidas" />
                <ol className="space-y-4">
                  {chamadas.slice(0, 5).map((p, i) => (
                    <li key={p.id} className="flex gap-3">
                      <span className="text-[20px] font-extrabold leading-none text-[#E4344A]">
                        {i + 1}
                      </span>
                      <Link
                        href={p.href}
                        className="text-[14px] font-semibold leading-[1.35] text-[#111111] hover:text-[#0A3161]"
                      >
                        {p.titulo}
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </aside>
        </div>

        {/* ---- blocos por editoria ---- */}
        {porEditoria.map(({ editoria, itens }) => (
          <section key={editoria} id={`editoria-${editoria}`} className="mt-14 scroll-mt-20">
            <TituloDeSecao texto={nomeDaEditoria(editoria)} />
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card pauta={itens[0]} alturaFoto="h-[240px]" />
              <div>
                {itens.slice(1).map((p) => (
                  <Linha key={p.id} pauta={p} />
                ))}
              </div>
            </div>
          </section>
        ))}
        </div>
      </main>
      <RodapeDoPortal />
    </>
  );
}
