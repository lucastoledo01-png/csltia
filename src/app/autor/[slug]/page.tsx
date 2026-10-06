import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaDoAutor } from "@/components/PaginaDoAutor";
import { MARCA } from "@/lib/marca";
import { urlDoAutor } from "@/lib/autores";
import { dadosEstruturadosDoAutor, jsonLdSeguro } from "@/lib/server/dados-estruturados-do-artigo";
import { autorPeloSlug, materiasDoAutor } from "@/lib/server/autores";
import { juntarPautasEArtigos } from "@/lib/server/portal";
import { DEFAULT_PROJECT_ID, getProjectById } from "@/lib/server/projects";

/**
 * A página de um autor (06/10/2026): foto, nome, cargo, minibio, redes e as
 * matérias publicadas que ele assina, no card das páginas de editoria.
 *
 * Por requisição, como a home e as editorias: o build na VPS não alcança o
 * banco, e a página gerada ali nasceria vazia a cada deploy. Autor desativado
 * ou inexistente é 404, e a assinatura das matérias dele volta a ser a
 * Redação, para nenhum link apontar para cá.
 */
export const dynamic = "force-dynamic";

function descricaoDoAutor(a: { nome: string; cargo: string; minibio: string }): string {
  const bio = a.minibio.replace(/\s+/g, " ").trim();
  if (bio) return bio.length > 160 ? `${bio.slice(0, 157).replace(/\s+\S*$/, "")}...` : bio;
  return a.cargo ? `${a.nome}, ${a.cargo} no ${MARCA.nome}.` : `Matérias de ${a.nome} no ${MARCA.nome}.`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const autor = await autorPeloSlug(DEFAULT_PROJECT_ID, slug);
  if (!autor) return {};
  const url = urlDoAutor(autor.slug);
  const descricao = descricaoDoAutor(autor);
  const temMateria = (await materiasDoAutor(DEFAULT_PROJECT_ID, autor.id, 1)).length > 0;
  return {
    title: { absolute: `${autor.nome} | ${MARCA.nome}` },
    description: descricao,
    alternates: { canonical: url },
    // Sem matéria publicada a página é rala: fica fora do índice e do sitemap até a primeira.
    ...(temMateria ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "profile",
      title: `${autor.nome} | ${MARCA.nome}`,
      description: descricao,
      url,
      siteName: MARCA.nome,
      locale: "pt_BR",
      ...(autor.foto_url ? { images: [{ url: autor.foto_url }] } : {}),
    },
  };
}

export default async function AutorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const autor = await autorPeloSlug(DEFAULT_PROJECT_ID, slug);
  if (!autor) notFound();

  const projeto = await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  const materias = await materiasDoAutor(DEFAULT_PROJECT_ID, autor.id);
  // O mesmo formato de card da home e das editorias, pela mesma função que junta as matérias do portal.
  const pautas = juntarPautasEArtigos([], materias, projeto?.timezone);

  const dados = dadosEstruturadosDoAutor(
    autor,
    pautas.map((p) => ({ url: `${MARCA.site}${p.href}`, titulo: p.titulo })),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(dados) }} />
      <PaginaDoAutor autor={autor} pautas={pautas} />
    </>
  );
}
