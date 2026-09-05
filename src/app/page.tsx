import JournalIndex from "@/components/JournalIndex";
import { articles as artigosDeBase, type Article } from "@/lib/editorial";
import { getPublishedArticles } from "@/lib/server/articles-service";

/**
 * As edições diárias vivem no banco; os artigos de base, no código. A home
 * mostra os dois, com o do banco primeiro, que é o conteúdo do dia.
 *
 * Banco fora do ar não deixa a página vazia: os de base seguram.
 */
export default async function Home() {
  const doBanco = await getPublishedArticles().catch(() => [] as Article[]);

  // Um artigo de base que também exista no banco aparece uma vez só.
  const slugsDoBanco = new Set(doBanco.map((a) => a.slug));
  const listaDeArtigos = [
    ...doBanco,
    ...artigosDeBase.filter((a) => !slugsDoBanco.has(a.slug)),
  ];

  return <JournalIndex listaDeArtigos={listaDeArtigos} />;
}
