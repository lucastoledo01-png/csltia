import Link from "next/link";
import { MARCA } from "@/lib/marca";
import { EDITORIAS, nomeDaEditoria } from "@/lib/editorias";
import type { PautaDoPortal } from "@/lib/server/portal";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { Chapeu, FotoDaPauta, Selo, corDaEditoria, dataCurta, textoCorrido } from "@/components/PortalPecas";

/**
 * A home do portal, no formato de jornal.
 *
 * A referência de estrutura era o Not Journal: manchete com foto ocupando
 * metade da primeira dobra, coluna de chamadas ao lado, faixa de três, lista
 * cronológica com barra lateral, e blocos por editoria embaixo.
 *
 * Em 05/10/2026 a página foi redesenhada sobre a referência que o dono fez no
 * Superdesign: letra Sora, página branca, foto de cantos arredondados, chapéu
 * vermelho. A estrutura de blocos continua a mesma, e cada vaga do desenho foi
 * casada com um bloco que `montarHome` já entrega:
 *
 *   manchete            destaque (a pauta mais nova com foto)
 *   Destaques           chamadas, as quatro primeiras
 *   grade de três       secundarias
 *   Últimas notícias    o resto das chamadas, depois ultimas
 *   Seções em foco      porEditoria
 *
 * O que o desenho tinha e não existe aqui ficou fora, em vez de inventado:
 * "Mais lidas" (não há contagem de leitura por pauta), tempo de leitura (a
 * pauta só tem o resumo), "Carregar mais" (não há paginação; no lugar, o link
 * para todas as edições) e o anúncio de assinatura paga.
 */

/** Meta da pauta: fonte e data, a linha de baixo dos cards. */
function Meta({ pauta, className = "" }: { pauta: PautaDoPortal; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#71717A] ${className}`}>
      <span>{pauta.fonte || MARCA.nome}</span>
      <span aria-hidden="true">•</span>
      <time dateTime={pauta.data}>{dataCurta(pauta.data)}</time>
    </p>
  );
}

/** A manchete: foto 16:9 (4:3 no celular), título grande, linha fina e meta. */
function Manchete({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group block">
      <div className="relative">
        <FotoDaPauta
          src={pauta.imagem}
          proporcao="aspect-[4/3] md:aspect-[16/9]"
          arredondado="rounded-2xl"
          rotulo={pauta.rotulo}
          editoria={pauta.editoria}
          prioridade
        />
        <div className="absolute left-4 top-4 md:left-6 md:top-6">
          <Selo texto={pauta.rotulo} />
        </div>
      </div>
      <h1 className="mt-5 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#0A0A0A] transition-colors group-hover:text-marca-texto md:mt-6 md:text-[40px] lg:text-[46px]">
        {pauta.titulo}
      </h1>
      {pauta.resumo ? (
        <p className="mt-3 line-clamp-3 max-w-3xl text-[15px] leading-relaxed text-[#52525B] md:mt-4 md:text-lg">
          {textoCorrido(pauta.resumo)}
        </p>
      ) : null}
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-[#71717A] md:text-sm">
        <span>Por Redação {MARCA.nome}</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D4D4D8]" />
        <span>{pauta.fonte || MARCA.nome}</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D4D4D8]" />
        <time dateTime={pauta.data}>{dataCurta(pauta.data)}</time>
      </p>
    </Link>
  );
}

/** Item da coluna "Destaques": chapéu cinza e título, sem foto. */
function Destaque({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group block">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#71717A]">{pauta.rotulo}</span>
      <h3 className="mt-1 text-[17px] font-medium leading-snug text-[#0A0A0A] decoration-[var(--portal-vermelho)] decoration-2 underline-offset-4 group-hover:underline">
        {pauta.titulo}
      </h3>
    </Link>
  );
}

/**
 * Card da grade de três: foto 4:3 em cima no computador, miniatura de 96px à
 * esquerda no celular, onde três fotos grandes empilhadas empurrariam o resto
 * da página para longe.
 */
function CardDaGrade({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group flex gap-4 md:block">
      <FotoDaPauta
        src={pauta.imagem}
        proporcao="aspect-square md:aspect-[4/3]"
        className="w-24 shrink-0 md:mb-4 md:w-full"
        rotulo={pauta.rotulo}
        editoria={pauta.editoria}
      />
      <div className="min-w-0">
        <Chapeu texto={pauta.rotulo} />
        <h3 className="mt-1 text-base font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-marca-texto md:mt-2 md:text-xl md:leading-tight">
          {pauta.titulo}
        </h3>
      </div>
    </Link>
  );
}

/**
 * Linha do feed: foto à esquerda, chapéu, manchete, duas linhas de resumo e
 * meta. No celular vira a linha compacta, com miniatura de 96px e sem resumo.
 *
 * As duas medidas da foto são fixas (96x96 e 224x160): a caixa não depende
 * do tamanho do arquivo.
 */
function LinhaDoFeed({ pauta, className = "" }: { pauta: PautaDoPortal; className?: string }) {
  return (
    <Link href={pauta.href} className={`group flex gap-4 md:gap-6 ${className}`}>
      <FotoDaPauta
        src={pauta.imagem}
        proporcao="h-24 w-24 md:h-40 md:w-56"
        className="shrink-0"
        rotulo={pauta.rotulo}
        editoria={pauta.editoria}
      />
      <div className="min-w-0 flex-1">
        <Chapeu texto={pauta.rotulo} />
        <h3 className="mt-1 text-base font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-marca-texto md:my-2 md:text-2xl md:leading-tight">
          {pauta.titulo}
        </h3>
        {pauta.resumo ? (
          <p className="hidden text-sm leading-relaxed text-[#52525B] md:line-clamp-2">{textoCorrido(pauta.resumo)}</p>
        ) : null}
        <Meta pauta={pauta} className="mt-2 md:mt-4" />
      </div>
    </Link>
  );
}

/** O primeiro item do feed no celular: foto 16:9 grande, como no desenho. */
function PrimeiroDoFeedMovel({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group block md:hidden">
      <FotoDaPauta
        src={pauta.imagem}
        proporcao="aspect-[16/9]"
        arredondado="rounded-2xl"
        rotulo={pauta.rotulo}
        editoria={pauta.editoria}
      />
      <Chapeu texto={pauta.rotulo} className="mt-4" />
      <h3 className="mt-2 text-xl font-semibold leading-snug text-[#0A0A0A]">{pauta.titulo}</h3>
      <Meta pauta={pauta} className="mt-2" />
    </Link>
  );
}

/** Item só de texto, da grade de dois dentro do feed. */
function NotaDoFeed({ pauta }: { pauta: PautaDoPortal }) {
  return (
    <Link href={pauta.href} className="group block">
      <Chapeu texto={pauta.rotulo} />
      <h4 className="mt-2 text-lg font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-marca-texto md:text-xl">
        {pauta.titulo}
      </h4>
      {pauta.resumo ? <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#52525B]">{textoCorrido(pauta.resumo)}</p> : null}
    </Link>
  );
}

function TituloDeSecao({ texto, id }: { texto: string; id?: string }) {
  return (
    <h2 id={id} className="mb-6 inline-block border-b-2 border-[#0A0A0A] pb-1 text-xl font-semibold text-[#0A0A0A] md:mb-10 md:text-2xl">
      {texto}
    </h2>
  );
}

/**
 * Bloco de uma editoria na faixa cinza. Até quatro pautas, a primeira com
 * foto maior. A âncora `editoria-<id>` é para onde aponta o menu.
 */
function BlocoDaEditoria({ editoria, itens }: { editoria: (typeof EDITORIAS)[number]["id"]; itens: PautaDoPortal[] }) {
  const nome = nomeDaEditoria(editoria);
  return (
    <section id={`editoria-${editoria}`} aria-labelledby={`titulo-editoria-${editoria}`} className="scroll-mt-24">
      <div className="mb-6 flex items-center gap-3 border-b border-[#E4E4E7] pb-3">
        <span aria-hidden="true" className="h-5 w-1.5 rounded-full" style={{ background: corDaEditoria(editoria) }} />
        <h3 id={`titulo-editoria-${editoria}`} className="text-xl font-semibold text-[#0A0A0A] md:text-2xl">
          {nome}
        </h3>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {itens.map((p) => (
          <Link key={p.id} href={p.href} className="group block rounded-2xl border border-[#F4F4F5] bg-white p-2">
            <FotoDaPauta src={p.imagem} proporcao="aspect-video" rotulo={p.rotulo} editoria={p.editoria} />
            <div className="p-3 pb-4">
              <Chapeu texto={p.rotulo} />
              <h4 className="mt-2 text-[15px] font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-marca-texto">
                {p.titulo}
              </h4>
              <Meta pauta={p} className="mt-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export type DadosDaHome = {
  destaque: PautaDoPortal | null;
  chamadas: PautaDoPortal[];
  secundarias: PautaDoPortal[];
  ultimas: PautaDoPortal[];
  porEditoria: Array<{ editoria: (typeof EDITORIAS)[number]["id"]; itens: PautaDoPortal[] }>;
};

/** Quantas chamadas vão para a coluna "Destaques"; o resto abre o feed. */
const NA_COLUNA = 4;
/** Linhas com foto no feed antes da grade de notas só de texto. */
const LINHAS_COM_FOTO = 10;
/** Notas só de texto, em duas colunas. */
const NOTAS = 6;

export function PortalHome({ dados }: { dados: DadosDaHome }) {
  const { destaque, chamadas, secundarias, ultimas, porEditoria } = dados;

  const naColuna = chamadas.slice(0, NA_COLUNA);
  /*
   * As chamadas que não cabem na coluna abrem o feed, antes das últimas: as
   * duas listas já vêm em ordem cronológica, as chamadas primeiro.
   */
  const feed = [...chamadas.slice(NA_COLUNA), ...ultimas];
  const comFoto = feed.slice(0, LINHAS_COM_FOTO);
  const notas = feed.slice(LINHAS_COM_FOTO, LINHAS_COM_FOTO + NOTAS);

  /*
   * No lugar de "Mais lidas", que pediria contagem de leitura que não
   * existe: a pauta mais nova de cada editoria, que é um índice real.
   */
  const recentesPorEditoria = porEditoria.map(({ editoria, itens }) => ({ editoria, pauta: itens[0] }));

  return (
    <MolduraDoPortal>
      <main>
        <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-6 md:py-8">
          {/* ---- primeira dobra ---- */}
          <section className="mb-12 grid grid-cols-1 gap-10 md:mb-16 lg:grid-cols-12">
            <div className="lg:col-span-8">
              {destaque ? (
                <Manchete pauta={destaque} />
              ) : (
                <h1 className="text-3xl font-semibold leading-tight text-[#0A0A0A] md:text-5xl">{MARCA.tagline}</h1>
              )}
            </div>

            <div className="flex flex-col gap-8 lg:col-span-4">
              {naColuna.length > 0 ? (
                <div className="border-t border-[#F4F4F5] pt-6 lg:border-t-0 lg:pt-0">
                  <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-marca-texto">Destaques</h2>
                  <div className="flex flex-col gap-6 border-b border-[#F4F4F5] pb-8">
                    {naColuna.map((p) => (
                      <Destaque key={p.id} pauta={p} />
                    ))}
                  </div>
                </div>
              ) : null}

              <CaixaDeAssinatura origem="portal-home" />
            </div>
          </section>

          {/* ---- grade de três ---- */}
          {secundarias.length > 0 ? (
            <section aria-label="Mais notícias com foto" className="mb-12 grid grid-cols-1 gap-6 border-t border-[#F4F4F5] pt-8 md:mb-16 md:grid-cols-3 md:gap-8 md:border-t-0 md:pt-0">
              {secundarias.map((p) => (
                <CardDaGrade key={p.id} pauta={p} />
              ))}
            </section>
          ) : null}

          {/* ---- últimas + barra lateral ---- */}
          {feed.length > 0 ? (
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
              <section aria-labelledby="titulo-ultimas" className="lg:col-span-8">
                <TituloDeSecao texto="Últimas notícias" id="titulo-ultimas" />
                <div className="flex flex-col gap-6 md:gap-10">
                  <PrimeiroDoFeedMovel pauta={comFoto[0]} />
                  {comFoto.map((p, i) => (
                    <LinhaDoFeed
                      key={p.id}
                      pauta={p}
                      className={i === 0 ? "hidden md:flex" : "border-t border-[#F4F4F5] pt-6 md:border-t-0 md:pt-0"}
                    />
                  ))}

                  {notas.length > 0 ? (
                    <div className="grid grid-cols-1 gap-8 border-t border-[#F4F4F5] pt-8 sm:grid-cols-2">
                      {notas.map((p) => (
                        <NotaDoFeed key={p.id} pauta={p} />
                      ))}
                    </div>
                  ) : null}

                  <Link
                    href="/artigos"
                    className="block w-full rounded-lg border-2 border-[#0A0A0A] py-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#0A0A0A] transition-colors hover:bg-[#0A0A0A] hover:text-white"
                  >
                    Ver todas as edições
                  </Link>
                </div>
              </section>

              <aside aria-label="Por editoria" className="lg:col-span-4">
                <div className="lg:sticky lg:top-28">
                  {recentesPorEditoria.length > 0 ? (
                    <>
                      <h2 className="mb-6 text-xl font-semibold text-[#0A0A0A] md:mb-8">O mais novo de cada editoria</h2>
                      <ol className="flex flex-col gap-6">
                        {recentesPorEditoria.map(({ editoria, pauta }, i) => (
                          <li key={editoria} className="flex gap-4">
                            <span aria-hidden="true" className="w-10 shrink-0 text-3xl font-semibold leading-none text-[#E4E4E7]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <a
                                href={`#editoria-${editoria}`}
                                className="text-[10px] font-bold uppercase tracking-[0.14em] text-marca-texto hover:underline"
                              >
                                {nomeDaEditoria(editoria)}
                              </a>
                              <Link
                                href={pauta.href}
                                className="mt-1 block text-sm font-bold leading-snug text-[#0A0A0A] transition-colors hover:text-marca-texto"
                              >
                                {pauta.titulo}
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : null}

                  <a
                    href={MARCA.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-12 block rounded-2xl bg-black p-8 text-center"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-marca-noite">Instagram</span>
                    <span className="mt-3 block text-xl font-semibold text-white">{MARCA.instagramHandle}</span>
                    <span className="mt-2 block text-sm text-[#A1A1AA]">As notícias do dia em peças para o feed.</span>
                    <span className="mt-6 inline-block rounded-full bg-white px-8 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black transition-colors group-hover:bg-[var(--portal-vermelho)] group-hover:text-white">
                      Seguir
                    </span>
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                </div>
              </aside>
            </div>
          ) : null}
        </div>

        {/* ---- seções em foco: os blocos por editoria ---- */}
        {porEditoria.length > 0 ? (
          <section aria-labelledby="titulo-secoes" className="mt-16 bg-[#F4F4F5] px-5 py-14 sm:px-6 md:mt-20 md:py-20">
            <div className="mx-auto max-w-7xl">
              <h2 id="titulo-secoes" className="mb-10 text-2xl font-semibold text-[#0A0A0A] md:text-3xl">
                Seções em foco
              </h2>
              <div className="flex flex-col gap-14">
                {porEditoria.map(({ editoria, itens }) => (
                  <BlocoDaEditoria key={editoria} editoria={editoria} itens={itens} />
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="h-16" />
        )}
      </main>
    </MolduraDoPortal>
  );
}
