import Link from "next/link";
import { EDITORIAS, editoriaPeloId, hrefDaEditoria, type EditoriaId } from "@/lib/editorias";
import type { PautaDoPortal } from "@/lib/server/portal";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { corDaEditoria } from "@/components/PortalPecas";
import { LinhaDoFeed, PrimeiroDoFeedMovel } from "@/components/PortalHome";

/**
 * O corpo da página de uma editoria, separado da rota para o teste montar sem
 * banco. As linhas são as do feed "Últimas notícias" da home, para a pauta ter
 * a mesma cara onde quer que apareça.
 */
export function PaginaDaEditoria({ editoria, pautas }: { editoria: EditoriaId; pautas: PautaDoPortal[] }) {
  const dados = editoriaPeloId(editoria);
  if (!dados) return null;
  const outras = EDITORIAS.filter((e) => e.id !== editoria);

  return (
    <MolduraDoPortal>
      <main>
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 md:py-12">
          <header className="mb-10 border-b-2 border-[#0A0A0A] pb-6 md:mb-12">
            <p className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-marca-texto">
              <span aria-hidden="true" className="h-4 w-1.5 rounded-full" style={{ background: corDaEditoria(editoria) }} />
              Editoria
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] md:text-5xl">{dados.nome}</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#52525B] md:text-lg">{dados.descricao}</p>
          </header>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            <section aria-label={`Notícias de ${dados.nome}`} className="lg:col-span-8">
              {pautas.length > 0 ? (
                <div className="flex flex-col gap-6 md:gap-10">
                  <PrimeiroDoFeedMovel pauta={pautas[0]} />
                  {pautas.map((p, i) => (
                    <LinhaDoFeed
                      key={p.id}
                      pauta={p}
                      className={i === 0 ? "hidden md:flex" : "border-t border-[#F4F4F5] pt-6 md:border-t-0 md:pt-0"}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#F4F4F5] bg-[#FAFAFA] p-8">
                  <p className="text-lg font-semibold text-[#0A0A0A]">Ainda não há notícias de {dados.nome} por aqui.</p>
                  <p className="mt-2 text-sm text-[#52525B]">
                    As matérias novas aparecem nesta página assim que forem publicadas.{" "}
                    <Link href="/" className="font-semibold text-marca-texto underline underline-offset-4">
                      Ver a página inicial
                    </Link>
                  </p>
                </div>
              )}
            </section>

            <aside aria-label="Outras editorias" className="lg:col-span-4">
              <div className="flex flex-col gap-10 lg:sticky lg:top-28">
                <CaixaDeAssinatura origem={`portal-editoria-${editoria}`} />
                <nav aria-label="Outras editorias">
                  <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-marca-texto">Outras editorias</h2>
                  <ul className="flex flex-col divide-y divide-[#F4F4F5] border-y border-[#F4F4F5]">
                    {outras.map((e) => (
                      <li key={e.id}>
                        <Link href={hrefDaEditoria(e.id)} className="group flex items-center gap-3 py-3">
                          <span aria-hidden="true" className="h-4 w-1 rounded-full" style={{ background: corDaEditoria(e.id) }} />
                          <span className="text-[15px] font-semibold text-[#0A0A0A] transition-colors group-hover:text-marca-texto">{e.nome}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </MolduraDoPortal>
  );
}
