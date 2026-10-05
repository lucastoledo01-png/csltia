import { BotaoVoltar } from "@/components/BotaoVoltar";
import { ArticleComments } from "@/components/ArticleComments";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { SubstackArticleRenderer } from "@/components/SubstackArticleRenderer";
import { miniaturaDoCommons } from "@/components/PortalPecas";
import { semImagemDaCapaNoCorpo } from "@/lib/imagem-da-capa";
import { indexacaoValidadaDoArtigo } from "@/lib/indexacao-do-artigo";
import {
  corpoComPerguntas,
  dadosEstruturadosDoArtigo,
  jsonLdSeguro,
  perguntasDoArtigo,
  perguntasVisiveisDoArtigo,
  urlDoArtigo,
} from "@/lib/server/dados-estruturados-do-artigo";

/**
 * O corpo da página da matéria, separado da rota (05/10/2026).
 *
 * A rota `/artigos/[slug]` busca a matéria e chama isto. Separado para a
 * página e qualquer prévia desenharem a MESMA coisa, com o mesmo JSON-LD, sem
 * uma segunda cópia do molde.
 */

/** A matéria como a página recebe, nos dois formatos que `getArticleBySlug` devolve. */
export type MateriaDaPagina = {
  slug: string;
  title: string;
  description?: string;
  excerpt?: string;
  seo_title?: string;
  seo_description?: string;
  category: string;
  author?: string;
  cover_image?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  content?: Array<{ heading: string; paragraphs: string[] }>;
  content_html?: string;
  age_summary?: string;
  aeo_questions?: unknown;
  /** Inclui os assuntos e as entidades, no formato de `indexacao-do-artigo.ts`. */
  tags?: string[] | null;
};

/**
 * Tempo de leitura medido no texto, e não lido de `reading_minutes`.
 *
 * O campo do banco nasce com 5 quando ninguém o preenche, e a página
 * imprimia esse 5 como se fosse medida. Aqui é a contagem de palavras do
 * corpo que vai à tela, a 200 por minuto. Sem texto, sem linha.
 */
function minutosDeLeitura(a: MateriaDaPagina): number | null {
  const bruto = a.content_html?.trim()
    ? a.content_html
    : (a.content ?? []).map((s) => `${s.heading} ${s.paragraphs.join(" ")}`).join(" ");
  const texto = bruto
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const palavras = texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (palavras === 0) return null;
  return Math.max(1, Math.round(palavras / 200));
}

/** A data de publicação por extenso, no fuso do projeto, ou nada. */
function dataPorExtenso(a: MateriaDaPagina): string | undefined {
  if (!a.published_at) return undefined;
  const d = new Date(a.published_at);
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

function semMarcas(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * A linha fina só aparece quando acrescenta (05/10/2026). No desmonte das
 * edições a descrição É a primeira frase do lide, e a página imprimia a mesma
 * frase duas vezes, uma embaixo da outra. É a régua "cada linha acrescenta"
 * do `decisoes.md`, aplicada à página.
 */
function linhaFinaQueAcrescenta(descricao: string | undefined, corpo: string | undefined): string | undefined {
  const fina = semMarcas(descricao ?? "");
  if (!fina) return undefined;
  const primeiro = semMarcas(corpo?.match(/<p\b(?![^>]*class="(?:fonte|credito-da-foto|legenda-da-capa)")[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  return primeiro.startsWith(fina) ? undefined : descricao;
}

export function PaginaDaMateria({ article, comComentarios = true }: { article: MateriaDaPagina; comComentarios?: boolean }) {
  const capa = (article.cover_image ?? "").trim();

  /*
   * A capa não se repete no corpo (05/10/2026). A edição antiga publicada
   * como artigo traz a foto da primeira pauta dentro do HTML do e-mail, e a
   * página desenhava a mesma foto como capa logo acima. O crédito que vinha
   * colado na foto passa para baixo da capa, que é onde a obra está agora.
   */
  const { html: corpoSemCapa, creditoDaCapa, legendaDaCapa } = semImagemDaCapaNoCorpo(article.content_html, capa);

  /*
   * Perguntas e respostas VISÍVEIS, e só então o FAQPage. As gravadas em
   * `aeo_questions` entram como seção antes do crédito da fonte; quando o
   * corpo já traz a seção (o ramo a escreve no HTML), nada é acrescentado.
   */
  const perguntasGravadas = perguntasDoArtigo(article.aeo_questions);
  const corpo = corpoSemCapa ? corpoComPerguntas(corpoSemCapa, perguntasGravadas) : corpoSemCapa;
  const perguntasNaPagina = perguntasVisiveisDoArtigo({ aeo_questions: article.aeo_questions, content_html: corpo });

  /*
   * NewsArticle, organização, caminho de navegação e, com pergunta visível,
   * FAQPage, num `@graph` só. O `<` é escapado como a documentação do Next
   * indica para JSON-LD: o conteúdo vem do banco, e um título com
   * `</script>` fecharia a tag.
   */
  const dadosEstruturados = dadosEstruturadosDoArtigo(article, { perguntasVisiveis: perguntasNaPagina });
  const minutos = minutosDeLeitura(article);

  return (
    <MolduraDoPortal>
      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSeguro(dadosEstruturados) }}
        />

        <div className="mx-auto max-w-[720px] px-5 pb-20 pt-6 sm:px-6 md:pt-10">
          <div className="mb-2">
            <BotaoVoltar className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-marca-texto hover:underline" />
          </div>

          <SubstackArticleRenderer
            title={article.title}
            subtitle={linhaFinaQueAcrescenta(article.description, corpo)}
            date={dataPorExtenso(article)}
            category={article.category}
            readTime={minutos ? `${minutos} min` : undefined}
            coverImage={capa ? miniaturaDoCommons(capa, 1280) : null}
            coverCredit={creditoDaCapa}
            coverDescription={legendaDaCapa}
            shareUrl={urlDoArtigo(article.slug)}
            topics={indexacaoValidadaDoArtigo(article).assuntos}
            contentHtml={corpoComMiniaturas(corpo)}
            sections={article.content}
            quote={article.age_summary}
            author={article.author}
          />

          <CaixaDeAssinatura origem="portal-artigo" className="my-12" />

          {comComentarios ? <ArticleComments articleSlug={article.slug} /> : null}
        </div>
      </main>
    </MolduraDoPortal>
  );
}
