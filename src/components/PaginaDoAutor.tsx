import Link from "next/link";
import type { Autor } from "@/lib/autores";
import { areaDoAutor, linksDasRedes } from "@/lib/autores";
import type { PautaDoPortal } from "@/lib/server/portal";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { LinhaDoFeed, PrimeiroDoFeedMovel, TituloDeSecao } from "@/components/PortalHome";

/**
 * O corpo da página de um autor (06/10/2026), separado da rota para o teste
 * montar sem banco. As matérias usam as linhas do feed, as mesmas da página
 * de editoria, para a pauta ter a mesma cara onde quer que apareça.
 *
 * Nada aqui é inventado: sem foto, a inicial; sem cargo, sem linha; sem rede,
 * sem fileira. Link para o que não existe é pior que link nenhum.
 */
export function PaginaDoAutor({ autor, pautas }: { autor: Autor; pautas: PautaDoPortal[] }) {
  const redes = linksDasRedes(autor.redes);
  const area = areaDoAutor(autor.area);
  const inicial = autor.nome.trim().charAt(0).toUpperCase();

  return (
    <MolduraDoPortal>
      <main>
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 md:py-12">
          <header className="mb-10 flex flex-col gap-6 border-b-2 border-[#0A0A0A] pb-8 sm:flex-row sm:items-start md:mb-12 md:gap-8">
            {autor.foto_url ? (
              // O endereço da foto é colado no painel ou sobe para o Storage: <img>, como as fotos do portal.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={autor.foto_url}
                alt={`Foto de ${autor.nome}`}
                width={128}
                height={128}
                className="h-24 w-24 shrink-0 rounded-full bg-[#F4F4F5] object-cover md:h-32 md:w-32"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-[#0A0A0A] text-4xl font-semibold text-white md:h-32 md:w-32 md:text-5xl"
              >
                {inicial}
              </span>
            )}

            <div className="min-w-0">
              <p className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-marca-texto">
                <span aria-hidden="true" className="h-4 w-1.5 rounded-full bg-[var(--portal-vermelho)]" />
                Autor
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] md:text-5xl">{autor.nome}</h1>
              {autor.cargo || area ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-[#52525B] md:text-base">
                  {autor.cargo ? <span>{autor.cargo}</span> : null}
                  {autor.cargo && area ? <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D4D4D8]" /> : null}
                  {area ? (
                    area.href ? (
                      <Link href={area.href} className="font-semibold text-marca-texto underline-offset-4 hover:underline">
                        {area.nome}
                      </Link>
                    ) : (
                      <span>{area.nome}</span>
                    )
                  ) : null}
                </p>
              ) : null}
              {autor.minibio ? (
                <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-relaxed text-[#3F3F46] md:text-lg">{autor.minibio}</p>
              ) : null}
              {redes.length ? (
                <ul aria-label={`Redes de ${autor.nome}`} className="mt-5 flex flex-wrap gap-2">
                  {redes.map((r) => (
                    <li key={r.id}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="me noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-[#E4E4E7] px-4 py-2 text-xs font-semibold text-[#0A0A0A] transition-colors hover:border-[#0A0A0A]"
                      >
                        {r.rotulo}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            <section aria-label={`Matérias de ${autor.nome}`} className="lg:col-span-8">
              <TituloDeSecao texto={`Matérias de ${autor.nome}`} />
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
                  <p className="text-lg font-semibold text-[#0A0A0A]">Ainda não há matérias assinadas por {autor.nome}.</p>
                  <p className="mt-2 text-sm text-[#52525B]">
                    As matérias aparecem nesta página assim que forem publicadas.{" "}
                    <Link href="/" className="font-semibold text-marca-texto underline underline-offset-4">
                      Ver a página inicial
                    </Link>
                  </p>
                </div>
              )}
            </section>

            <aside aria-label="Assinatura" className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <CaixaDeAssinatura origem="portal-autor" />
              </div>
            </aside>
          </div>
        </div>
      </main>
    </MolduraDoPortal>
  );
}
