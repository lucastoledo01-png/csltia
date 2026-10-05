import { MARCA } from "@/lib/marca";
import { editoriaPeloNome, hrefDaEditoria } from "@/lib/editorias";
import { escapeHtml } from "./html";
import { camposDeIndexacaoNoJsonLd, indexacaoDasTags } from "@/lib/indexacao-do-artigo";

/**
 * O que a busca e os assistentes leem da matéria, montado num lugar só
 * (05/10/2026).
 *
 * Até aqui a página escrevia um `NewsArticle` mínimo à mão: sem autor, sem
 * `dateModified`, sem editoria, sem caminho de navegação, e com o
 * `JSON.stringify` cru, que a documentação do Next manda escapar (`<` vira
 * `<`) para um título com `</script>` não fechar a tag. A auditoria de
 * artigos e a página usam ESTA função, para o relatório medir o que a página
 * de fato publica, e não uma cópia da regra (a lição da "mesma regra em três
 * cópias").
 *
 * O que é decisão, e não descuido:
 *
 * - **Autor é a Redação, como Organization.** Não existe repórter com nome; o
 *   texto é da casa. Inventar pessoa seria o tipo de dado com cara de medida
 *   que o projeto recusa.
 * - **`dateModified` só muda quando o conteúdo mudou.** Vem de `updated_at`, e
 *   só quando ele é posterior à publicação por mais que a folga abaixo; senão
 *   é a própria data de publicação. Atualizar a data sem mudar o texto é o
 *   "atualizar todo mês" que o `PROCEDENCIA.md` registra como conselho que não
 *   vale para notícia.
 * - **`FAQPage` só com pergunta VISÍVEL.** A skill `ai-seo` diz o mesmo:
 *   marcação de pergunta que o leitor não vê é marcação enganosa.
 * - **Sem capa, sem `image`.** O logotipo não representa a matéria, e pôr ele
 *   ali só para o campo existir é preencher por obrigação. A auditoria aponta.
 */

/** A matéria como a página a recebe, nos nomes do banco. */
export type ArtigoParaBusca = {
  slug: string;
  title: string;
  seo_title?: string | null;
  seo_description?: string | null;
  description?: string | null;
  excerpt?: string | null;
  category?: string | null;
  cover_image?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  content_html?: string | null;
  aeo_questions?: unknown;
  /** Assuntos e entidades (`assunto:`, `sobre:`, `menciona:`), de `indexacao-do-artigo.ts`. */
  tags?: string[] | null;
};

export type PerguntaVisivel = { pergunta: string; resposta: string };

/** Folga entre publicar e "modificar": gravações da mesma rodada não contam. */
const FOLGA_DE_MODIFICACAO_MS = 10 * 60 * 1000;

/**
 * As perguntas gravadas, nos dois formatos que existem no banco: o do ramo
 * (`pergunta`, `resposta`) e o do painel antigo (`question`, `answer`).
 */
export function perguntasDoArtigo(aeo: unknown): PerguntaVisivel[] {
  if (!Array.isArray(aeo)) return [];
  return aeo
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const pergunta = String(r.pergunta ?? r.question ?? "").trim();
      const resposta = String(r.resposta ?? r.answer ?? "").trim();
      return pergunta && resposta ? { pergunta, resposta } : null;
    })
    .filter((p): p is PerguntaVisivel => p !== null);
}

/** O corpo já traz a seção de perguntas (o ramo do portal a escreve no HTML). */
export function corpoJaTemPerguntas(html: string | null | undefined): boolean {
  return /<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>/i.test(html ?? "");
}

function textoSimples(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[e] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As perguntas que o leitor VÊ na página: as gravadas em `aeo_questions`, ou,
 * sem elas, as que o ramo já escreveu dentro do corpo. É a mesma lista que
 * decide o `FAQPage` e que a auditoria confere.
 */
export function perguntasVisiveisDoArtigo(a: { aeo_questions?: unknown; content_html?: string | null }): PerguntaVisivel[] {
  const gravadas = perguntasDoArtigo(a.aeo_questions);
  if (gravadas.length > 0) return gravadas;
  const html = a.content_html ?? "";
  if (!corpoJaTemPerguntas(html)) return [];
  const secao = html.match(/<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>([\s\S]*?)<\/section>/i)?.[1] ?? "";
  return [...secao.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({
    pergunta: textoSimples(m[1]),
    resposta: textoSimples(m[2]),
  }));
}

function semNegrito(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "");
}

/**
 * O corpo com a seção "Perguntas e respostas" visível, antes do crédito da
 * fonte, no mesmo molde que `renderizarArtigoHtml` usa. Quando o corpo já tem
 * a seção, nada muda: duas seções iguais na mesma página é defeito.
 */
export function corpoComPerguntas(html: string, perguntas: PerguntaVisivel[]): string {
  if (perguntas.length === 0 || corpoJaTemPerguntas(html)) return html;
  const secao = `<section class="perguntas"><h2>Perguntas e respostas</h2>${perguntas
    .map((p) => `<h3>${escapeHtml(semNegrito(p.pergunta))}</h3><p>${escapeHtml(semNegrito(p.resposta))}</p>`)
    .join("")}</section>`;
  const fonte = html.search(/<p[^>]*class="fonte"|<section[^>]*class="fontes"/i);
  return fonte >= 0 ? `${html.slice(0, fonte)}${secao}${html.slice(fonte)}` : `${html}${secao}`;
}

function iso(d: string | null | undefined): string | undefined {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** A data de modificação honesta: `updated_at` só quando houve mudança depois de publicar. */
export function dataDeModificacao(publicada: string | null | undefined, atualizada: string | null | undefined): string | undefined {
  const p = iso(publicada);
  const u = iso(atualizada);
  if (!p) return u;
  if (!u) return p;
  return Date.parse(u) - Date.parse(p) > FOLGA_DE_MODIFICACAO_MS ? u : p;
}

export function urlDoArtigo(slug: string): string {
  return `${MARCA.site}/artigos/${slug}`;
}

export function descricaoParaBusca(a: ArtigoParaBusca): string {
  return (a.seo_description || a.description || a.excerpt || MARCA.tagline || "").trim();
}

/**
 * O grafo da matéria: NewsArticle, a organização, o caminho de navegação e,
 * quando há pergunta visível, o FAQPage.
 */
export function dadosEstruturadosDoArtigo(
  a: ArtigoParaBusca,
  opcoes: { perguntasVisiveis: PerguntaVisivel[] },
): Record<string, unknown> {
  const url = urlDoArtigo(a.slug);
  const editoria = editoriaPeloNome(a.category);
  const secao = editoria?.nome ?? (a.category || undefined);
  const capa = (a.cover_image ?? "").trim();
  const publicada = iso(a.published_at);
  const idOrganizacao = `${MARCA.site}/#organizacao`;

  const caminho: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Início", item: MARCA.site },
    ...(editoria
      ? [{ "@type": "ListItem", position: 2, name: editoria.nome, item: `${MARCA.site}${hrefDaEditoria(editoria.id)}` }]
      : []),
  ];
  caminho.push({ "@type": "ListItem", position: caminho.length + 1, name: a.title, item: url });

  const grafo: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": idOrganizacao,
      name: MARCA.nome,
      url: MARCA.site,
      logo: { "@type": "ImageObject", url: MARCA.logoClaro },
    },
    {
      "@type": "NewsArticle",
      "@id": `${url}#materia`,
      headline: a.title,
      description: descricaoParaBusca(a),
      ...(publicada ? { datePublished: publicada } : {}),
      ...(publicada ? { dateModified: dataDeModificacao(a.published_at, a.updated_at) } : {}),
      ...(capa ? { image: [capa] } : {}),
      ...(secao ? { articleSection: secao } : {}),
      // `keywords`, `about` e `mentions` só com o que a matéria gravou; nunca
      // meta keywords, que nenhum buscador lê.
      ...camposDeIndexacaoNoJsonLd(indexacaoDasTags(a.tags)),
      author: { "@type": "Organization", name: `Redação ${MARCA.nome}`, url: MARCA.site },
      publisher: { "@id": idOrganizacao },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      inLanguage: "pt-BR",
      isAccessibleForFree: true,
    },
    { "@type": "BreadcrumbList", "@id": `${url}#caminho`, itemListElement: caminho },
  ];

  if (opcoes.perguntasVisiveis.length > 0) {
    grafo.push({
      "@type": "FAQPage",
      "@id": `${url}#perguntas`,
      mainEntity: opcoes.perguntasVisiveis.map((p) => ({
        "@type": "Question",
        name: semNegrito(p.pergunta),
        acceptedAnswer: { "@type": "Answer", text: semNegrito(p.resposta) },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": grafo };
}

/**
 * O JSON-LD pronto para ir dentro de `<script>`: `<` vira `<`, como a
 * documentação do Next indica, para nenhum texto do banco fechar a tag.
 */
export function jsonLdSeguro(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}
