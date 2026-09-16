import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleComments } from "@/components/ArticleComments";
import { RodapeDoPortal, TopoDoPortal } from "@/components/PortalChrome";
import { SubstackArticleRenderer } from "@/components/SubstackArticleRenderer";
import { articles as staticArticles } from "@/lib/editorial";
import { getArticleBySlug } from "@/lib/server/articles-service";
import { MARCA } from "@/lib/marca";

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
 * `getArticleBySlug` devolve dois formatos: o registro do banco, com
 * `cover_image` e `published_at`, e o artigo estático do código, com `image` e
 * `date`. Os dois campos querem dizer a mesma coisa e têm nomes diferentes.
 */
type ArtigoDaPagina = Awaited<ReturnType<typeof getArticleBySlug>>;

function capaDoArtigo(a: NonNullable<ArtigoDaPagina>): string {
  const r = a as { cover_image?: string | null; image?: string };
  return (r.cover_image || r.image || "").trim();
}

function dataDoArtigo(a: NonNullable<ArtigoDaPagina>): string {
  const r = a as { published_at?: string | null; date?: string };
  return (r.published_at || r.date || "").trim();
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
  const article = await getArticleBySlug(slug).catch(() => null);

  if (!article) return {};

  const descricao = descricaoDeBusca(article);
  const capa = capaDoArtigo(article);

  return {
    title: `${tituloDeBusca(article)} | ${MARCA.nome}`,
    description: descricao,
    alternates: { canonical: `${MARCA.site}/artigos/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: descricao,
      url: `${MARCA.site}/artigos/${article.slug}`,
      siteName: MARCA.nome,
      ...(capa ? { images: [{ url: capa }] } : {}),
    },
  };
}

export function generateStaticParams() {
  return staticArticles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  /*
   * NewsArticle em JSON-LD.
   *
   * É o que permite a matéria aparecer como notícia, e não como página
   * qualquer, no resultado de busca. O `dangerouslySetInnerHTML` aqui é o
   * caminho que a documentação do Next indica para JSON-LD, e o conteúdo é
   * serializado por `JSON.stringify` a partir de campos do nosso banco, não de
   * entrada de usuário.
   */
  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: descricaoDeBusca(article),
    datePublished: dataDoArtigo(article) || undefined,
    image: capaDoArtigo(article) ? [capaDoArtigo(article)] : undefined,
    mainEntityOfPage: `${MARCA.site}/artigos/${article.slug}`,
    publisher: {
      "@type": "Organization",
      name: MARCA.nome,
      logo: { "@type": "ImageObject", url: MARCA.logoClaro },
    },
    inLanguage: "pt-BR",
  };

  return (
    <main className="min-h-screen bg-white text-[#111827]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados) }}
      />
      <TopoDoPortal />

      <div className="mx-auto max-w-[720px] px-4 pb-20 pt-6 sm:px-6 md:pt-10">
        <div className="mb-6">
          <Link className="inline-flex items-center gap-1 text-xs font-semibold text-[#E4344A] hover:underline" href="/artigos">
            ← Voltar para todos os artigos
          </Link>
        </div>

        {/* Renderizador Estilo Substack Clean */}
        <SubstackArticleRenderer
          title={article.title}
          subtitle={article.description}
          date={article.published_at ? new Date(article.published_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "20 de Agosto de 2026"}
          category={article.category}
          readTime={`${article.reading_minutes || 5} min`}
          coverImage={article.cover_image}
          contentHtml={article.content_html}
          sections={article.content}
          quote={article.age_summary}
          author={article.author}
        />

        {/* Seção de Comentários do Leitor com Likes & Dislikes */}
        <ArticleComments articleSlug={slug} />
      </div>
      <RodapeDoPortal />
    </main>
  );
}
