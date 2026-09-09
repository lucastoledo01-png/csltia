import JournalIndex from "@/components/JournalIndex";
import { articles as artigosDeBase, type Article } from "@/lib/editorial";
import { getPublishedArticles } from "@/lib/server/articles-service";

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
