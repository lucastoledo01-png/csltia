import Link from "next/link";
import { logoDoSite, MARCA } from "@/lib/marca";
import { EDITORIAS } from "@/lib/editorias";

/**
 * O cromo do portal: a barra de topo e o rodapé.
 *
 * Vive fora da home porque não é da home. Enquanto estava lá dentro, `/artigos`
 * continuava com o cabeçalho branco da landing anterior, e o site tinha dois
 * menus diferentes conforme a página: foi assim que o dono viu "menu com texto
 * preto e fundo branco" num produto cujo topo é azul-marinho.
 */

/**
 * Barra de topo, escura, com as editorias.
 *
 * As editorias apontam para âncoras da própria home, e não para páginas de
 * editoria: elas ainda não existem, e link de menu que leva a 404 é pior que
 * menu curto. Quando a página de editoria existir, só o href muda.
 */
export function TopoDoPortal() {
  return (
    <header className="bg-[#0A3161] text-white">
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
              className="text-[13px] font-medium text-white/75 transition-colors hover:text-white"
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

export function RodapeDoPortal() {
  return (
    <footer className="mt-16 bg-[#0A3161] text-white/75">
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
