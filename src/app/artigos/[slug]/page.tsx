import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { PaginaDaMateria } from "@/components/PaginaDaMateria";
import { destinoDoLinkDaEdicao, getArticleBySlug } from "@/lib/server/articles-service";
import { MARCA } from "@/lib/marca";
import { imagemParaCompartilhar } from "@/lib/imagem-da-capa";
import { dataDeModificacao, tituloDaAba } from "@/lib/server/dados-estruturados-do-artigo";
import { buscarRelacionadas } from "@/lib/server/materias-relacionadas";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { fetchComCacheDeUmDia, resolverCreditoDaCapa } from "@/lib/server/capa-da-materia";
import { autorDaMateria } from "@/lib/server/autores";
import { urlDoAutor } from "@/lib/autores";

/**
 * A listagem sai do banco, e o banco muda depois do build.
 *
 * Sem isto a página é pré-renderizada uma vez e servida com
 * `s-maxage=31536000`: um ano. A edição de 09/09 foi criada às 09:08, o build
 * era das 03:01, e o artigo existia, abria pela URL direta e simplesmente não
 * aparecia na lista — o que de fora é indistinguível de não ter sido escrito.
 *
 * Cinco minutos é folga suficiente para uma edição diária e ainda mantém a
 * página em cache na quase totalidade dos acessos.
 */
export const revalidate = 300;

/*
 * A metadata e a página pedem a mesma matéria. Com `cache` a leitura é uma por
 * renderização, e não duas (06/10/2026).
 */
const lerMateria = cache((slug: string) => getArticleBySlug(slug));

/*
 * `getArticleBySlug` devolve dois formatos: o registro do banco, com
 * `cover_image` e `published_at`, e o artigo estático do código, com `image` e
 * `date`. Os dois campos querem dizer a mesma coisa e têm nomes diferentes.
 */
type ArtigoDaPagina = Awaited<ReturnType<typeof getArticleBySlug>>;

function capaDoArtigo(a: NonNullable<ArtigoDaPagina>): string {
  const r = a as { cover_image?: string | null; image?: string };
  // Limpa e, no Commons, a miniatura de 1280: o original chega a 9 MB, e a
  // prévia do WhatsApp e do Facebook não carrega isso (auditoria de 05/10/2026).
  return imagemParaCompartilhar(r.cover_image || r.image || "");
}

/** O que vai para a aba e para o resultado de busca, com o SEO na frente. */
function tituloDeBusca(a: NonNullable<ArtigoDaPagina>): string {
  const r = a as { seo_title?: string; title: string };
  return (r.seo_title || r.title || "").trim();
}

function descricaoDeBusca(a: NonNullable<ArtigoDaPagina>): string {
  const r = a as { seo_description?: string; description?: string; excerpt?: string };
  return (r.seo_description || r.description || r.excerpt || MARCA.tagline).trim();
}

/**
 * Título e descrição por matéria.
 *
 * Sem isto toda matéria herdava o `metadata` do layout: a mesma linha no
 * resultado de busca, na aba do navegador e no cartão do WhatsApp, para
 * conteúdos diferentes. Num portal de notícia é o que decide o clique.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await lerMateria(slug).catch(() => null);

  if (!article) return {};

  const descricao = descricaoDeBusca(article);
  const capa = capaDoArtigo(article);
  const datas = article as { published_at?: string | null; updated_at?: string | null };
  const publicada = datas.published_at ?? undefined;
  // A mesma regra do JSON-LD: só muda quando o conteúdo mudou.
  const modificada = dataDeModificacao(datas.published_at, datas.updated_at);
  const autor = await autorDaMateria(article as { author_id?: string | null; project_id?: string | null });

  return {
    title: { absolute: tituloDaAba(tituloDeBusca(article)) },
    description: descricao,
    ...(autor ? { authors: [{ name: autor.nome, url: urlDoAutor(autor.slug) }] } : {}),
    alternates: { canonical: `${MARCA.site}/artigos/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: descricao,
      url: `${MARCA.site}/artigos/${article.slug}`,
      siteName: MARCA.nome,
      locale: "pt_BR",
      ...(publicada ? { publishedTime: publicada } : {}),
      ...(modificada ? { modifiedTime: modificada } : {}),
      ...(article.category ? { section: article.category } : {}),
      ...(autor ? { authors: [urlDoAutor(autor.slug)] } : {}),
      ...(capa ? { images: [{ url: capa }] } : {}),
    },
  };
}

/*
 * Sem `generateStaticParams` desde a auditoria de SEO de 05/10/2026. Ele
 * pré-gerava os três artigos estáticos de `editorial.ts`, da vertical de
 * imigração, e um deles ("o-que-pesa-na-decisao-de-sair-do-brasil") estava no
 * ar com `datePublished` de AGORA a cada build, fora do sitemap e fora da
 * linha editorial. A página agora só serve o que o banco publicou.
 *
 * A lista vazia mantém a página em cache incremental (cinco minutos, o
 * `revalidate` acima), gerada na primeira visita: sem a função o Next a
 * trataria como dinâmica e leria o banco a cada visita.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

/** O "Leia também" da matéria que nasceu sem ele. Falha de leitura é lista vazia, nunca página quebrada. */
async function relacionadasDaMateria(article: NonNullable<ArtigoDaPagina>) {
  const a = article as { slug: string; title: string; category?: string | null; content_html?: string; tags?: string[] | null };
  if (!a.category || /<section[^>]*class="leia-tambem"/i.test(a.content_html ?? "")) return [];
  try {
    return await buscarRelacionadas(getSupabaseAdminClient(), DEFAULT_PROJECT_ID, { slug: a.slug, categoria: a.category, texto: a.title });
  } catch {
    return [];
  }
}

/**
 * O crédito da capa que a linha não gravou, resolvido na origem (06/10/2026).
 * Com crédito gravado no corpo, nada é perguntado. Falha é `null`, e a página
 * cai no crédito que o endereço permite saber.
 */
async function creditoDaCapaSemRegistro(article: NonNullable<ArtigoDaPagina>) {
  const a = article as { cover_image?: string | null; content_html?: string };
  if (!a.cover_image || /class="credito-da-foto"/.test(a.content_html ?? "")) return null;
  try {
    return await resolverCreditoDaCapa(a.cover_image, { fetcher: fetchComCacheDeUmDia, tempoLimiteMs: 3000 });
  } catch {
    return null;
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await lerMateria(slug);

  if (!article) {
    /*
     * A edição antiga que virou matéria por pauta não some: o link dela
     * redireciona, de forma permanente, para a primeira matéria da edição.
     */
    const destino = await destinoDoLinkDaEdicao(slug);
    if (destino) permanentRedirect(destino);
    notFound();
  }

  /*
   * O autor cadastrado (06/10/2026). A leitura degrada: sem a coluna, sem a
   * tabela ou com o autor desativado, a matéria assina como a Redação.
   */
  const [relacionadas, creditoResolvido, autor] = await Promise.all([
    relacionadasDaMateria(article),
    creditoDaCapaSemRegistro(article),
    autorDaMateria(article as { author_id?: string | null; project_id?: string | null }),
  ]);
  return <PaginaDaMateria article={article} relacionadas={relacionadas} creditoResolvido={creditoResolvido} autor={autor} />;
}
