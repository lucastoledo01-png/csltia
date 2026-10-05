import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleComments } from "@/components/ArticleComments";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { SubstackArticleRenderer } from "@/components/SubstackArticleRenderer";
import { articles as staticArticles } from "@/lib/editorial";
import { getArticleBySlug } from "@/lib/server/articles-service";
import { MARCA } from "@/lib/marca";
import { miniaturaDoCommons } from "@/components/PortalPecas";

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

/**
 * Tempo de leitura medido no texto, e não lido de `reading_minutes`.
 *
 * O campo do banco nasce com 5 quando ninguém o preenche, e a página
 * imprimia esse 5 como se fosse medida. Aqui é a contagem de palavras do
 * corpo que vai à tela, a 200 por minuto. Sem texto, sem linha.
 */
function minutosDeLeitura(a: NonNullable<ArtigoDaPagina>): number | null {
  const r = a as { content_html?: string; content?: Array<{ heading: string; paragraphs: string[] }> };
  const bruto = r.content_html?.trim()
    ? r.content_html
    : (r.content ?? []).map((s) => `${s.heading} ${s.paragraphs.join(" ")}`).join(" ");
  const texto = bruto
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const palavras = texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (palavras === 0) return null;
  return Math.max(1, Math.round(palavras / 200));
}

/** A data de publicação por extenso, no fuso do projeto, ou nada. */
function dataPorExtenso(a: NonNullable<ArtigoDaPagina>): string | undefined {
  const r = a as { published_at?: string | null };
  if (!r.published_at) return undefined;
  const d = new Date(r.published_at);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });
}

/**
 * As fotos do corpo e a capa pela miniatura do Commons, e não pelo original.
 * O motivo e o caminho estão em `miniaturaDoCommons`. Só a tela muda: o
 * JSON-LD e o Open Graph continuam com o endereço gravado.
 */
function corpoComMiniaturas(html: string | undefined): string | undefined {
  if (!html) return html;
  return html.replace(/(<img[^>]+src=")([^"]+)(")/g, (_, antes: string, src: string, depois: string) =>
    `${antes}${miniaturaDoCommons(src.replace(/&amp;/g, "&"), 1280)}${depois}`,
  );
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

  const minutos = minutosDeLeitura(article);

  return (
    <MolduraDoPortal>
      <main>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados) }}
        />

        <div className="mx-auto max-w-[720px] px-5 pb-20 pt-6 sm:px-6 md:pt-10">
          <div className="mb-2">
            <Link
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-marca-texto hover:underline"
              href="/artigos"
            >
              <span aria-hidden="true">←</span> Voltar para todos os artigos
            </Link>
          </div>

          <SubstackArticleRenderer
            title={article.title}
            subtitle={article.description}
            date={dataPorExtenso(article)}
            category={article.category}
            readTime={minutos ? `${minutos} min` : undefined}
            coverImage={article.cover_image ? miniaturaDoCommons(article.cover_image, 1280) : article.cover_image}
            contentHtml={corpoComMiniaturas(article.content_html)}
            sections={article.content}
            quote={article.age_summary}
            author={article.author}
          />

          <CaixaDeAssinatura origem="portal-artigo" className="my-12" />

          {/* Comentários do leitor */}
          <ArticleComments articleSlug={slug} />
        </div>
      </main>
    </MolduraDoPortal>
  );
}
