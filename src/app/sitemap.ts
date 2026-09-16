import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";
import { getPublishedArticles } from "@/lib/server/articles-service";

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
  ];

  /*
   * Falha de leitura devolve só as fixas, e não derruba a rota.
   *
   * Sitemap que responde 500 é tratado pelo rastreador como erro do site
   * inteiro. Um sitemap incompleto é recuperável na próxima passada; um
   * sitemap quebrado custa confiança.
   */
  const artigos = await getPublishedArticles().catch(() => []);

  return [
    ...fixas,
    ...artigos.map((a) => ({
      url: `${MARCA.site}/artigos/${a.slug}`,
      ...dataValida(a.date),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

/**
 * `lastModified` só entra quando a data é uma data.
 *
 * O campo `date` do artigo vem formatado para leitura, no estilo
 * "16 de set. de 2026". `new Date()` disso devolve Invalid Date, e o Next chama
 * `toISOString()` em cima ao montar o XML: a rota inteira responde 500, e um
 * sitemap que responde 500 é lido pelo rastreador como erro do site.
 *
 * Data ausente no sitemap é omissão aceitável. Sitemap quebrado não é.
 */
function dataValida(bruta: string | undefined): { lastModified?: Date } {
  if (!bruta) return {};
  const d = new Date(bruta);
  return Number.isFinite(d.getTime()) ? { lastModified: d } : {};
}
