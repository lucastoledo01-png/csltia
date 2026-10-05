import { JANELA_DO_GOOGLE_NEWS_MS, materiasRecentes, sitemapDeNoticias } from "@/lib/server/arquivos-para-maquinas";

/**
 * O sitemap do Google News (05/10/2026), ao lado do `sitemap.ts`.
 *
 * O `MetadataRoute.Sitemap` do Next não tem o namespace `news:`, então este
 * é um Route Handler que devolve o XML pronto. Por requisição, porque a janela
 * é de 48 horas e o build não alcança o banco. O `robots.txt` aponta para ele.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const agora = new Date();
  // O Google aceita até mil URLs por sitemap de notícias; o portal publica três por dia.
  const materias = await materiasRecentes(1000, new Date(agora.getTime() - JANELA_DO_GOOGLE_NEWS_MS));
  return new Response(sitemapDeNoticias(materias, agora), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
