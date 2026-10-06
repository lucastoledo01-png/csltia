import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";
import { EDITORIAS, hrefDaEditoria } from "@/lib/editorias";
import { autoresDoSitemap, materiasDoSitemap } from "@/lib/server/arquivos-para-maquinas";
import { urlDoAutor } from "@/lib/autores";
import { dataDeModificacao } from "@/lib/server/dados-estruturados-do-artigo";

/**
 * O mapa do site, montado a partir do que está publicado.
 *
 * `/sitemap.xml` respondia 404. Para um portal que publica uma edição por dia
 * e nasce sem link de fora, o sitemap é o caminho pelo qual o Google descobre
 * que a matéria de hoje existe.
 *
 * Dinâmico, e não gerado no build, pelo mesmo motivo da home: o build na VPS
 * não tem as variáveis do banco, então um sitemap gerado ali sairia com as
 * páginas fixas e nenhuma matéria. Seria pior que não ter, porque teria cara
 * de completo.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixas: MetadataRoute.Sitemap = [
    { url: MARCA.site, changeFrequency: "daily", priority: 1 },
    { url: `${MARCA.site}/artigos`, changeFrequency: "daily", priority: 0.8 },
    { url: `${MARCA.site}/newsletter`, changeFrequency: "monthly", priority: 0.5 },
    // As páginas de editoria (05/10/2026): fixas, uma por editoria do menu.
    ...EDITORIAS.map((e) => ({
      url: `${MARCA.site}${hrefDaEditoria(e.id)}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];

  /*
   * Falha de leitura devolve só as fixas, e não derruba a rota.
   *
   * Sitemap que responde 500 é tratado pelo rastreador como erro do site
   * inteiro. Um sitemap incompleto é recuperável na próxima passada; um
   * sitemap quebrado custa confiança.
   */
  const artigos = await materiasDoSitemap().catch(() => []);
  // Páginas de autor (06/10/2026): só quem tem matéria publicada.
  const autores = await autoresDoSitemap().catch(() => []);

  return [
    ...fixas,
    ...artigos.map((a) => ({
      url: `${MARCA.site}/artigos/${a.slug}`,
      ...dataValida(dataDeModificacao(a.published_at, a.updated_at)),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...autores.map((a) => ({
      url: urlDoAutor(a.slug),
      ...dataValida(a.ultima ?? undefined),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}

/**
 * `lastModified` só entra quando a data é uma data.
 *
 * A primeira versão lia a data formatada para leitura ("16 de set. de 2026"),
 * `new Date()` disso devolvia Invalid Date, e o Next chama `toISOString()` em
 * cima ao montar o XML: a rota inteira respondia 500. Desde a auditoria de
 * 05/10/2026 a data vem crua do banco, e é a MESMA modificação honesta do
 * `dateModified` do NewsArticle (`dataDeModificacao`). A conferência fica:
 * data ausente no sitemap é omissão aceitável, sitemap quebrado não é.
 */
function dataValida(bruta: string | undefined): { lastModified?: Date } {
  if (!bruta) return {};
  const d = new Date(bruta);
  return Number.isFinite(d.getTime()) ? { lastModified: d } : {};
}
