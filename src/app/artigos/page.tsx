import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { MARCA } from "@/lib/marca";
import { Article } from "@/lib/editorial";
import { getPublishedArticles } from "@/lib/server/articles-service";
import { recorteDaFoto } from "@/lib/imagem-da-capa";

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
 *
 * Por requisição desde 06/10/2026, pelo motivo da home ("O portal nascia vazio
 * a cada deploy", em `aprendizados-e-incidentes.md`): com `revalidate` a lista
 * era gerada no BUILD, e o build na VPS não tem as variáveis do banco. A
 * leitura falhava e a página nascia com os três artigos estáticos da vertical
 * de imigração, por cinco minutos depois de cada deploy. A consulta agora é só
 * das publicadas e sem o corpo, e custa pouco a cada visita.
 */
export const dynamic = "force-dynamic";

/*
 * Título, descrição e canônico próprios (auditoria de SEO, 05/10/2026): a
 * lista herdava o título da home, e duas páginas com o mesmo título disputam
 * o mesmo resultado de busca.
 */
export const metadata: Metadata = {
  title: `Todas as matérias | ${MARCA.nome}`,
  description: `Todas as matérias do ${MARCA.nome}, da mais recente para a mais antiga: economia, trabalho, tecnologia, custo de vida, política e Brasil.`,
  alternates: { canonical: `${MARCA.site}/artigos` },
  openGraph: {
    type: "website",
    title: `Todas as matérias | ${MARCA.nome}`,
    url: `${MARCA.site}/artigos`,
    siteName: MARCA.nome,
    locale: "pt_BR",
  },
};

/**
 * O card da lista, na mesma gramática da linha do feed da home: foto à
 * esquerda numa caixa de medida fixa, chapéu vermelho, título, duas linhas
 * de resumo e a data. No celular a foto vai para cima, em 16:9.
 */
function SubstackFeedCard({ article }: { article: Article }) {
  return (
    <article className="group py-8 first:pt-4">
      <Link href={`/artigos/${article.slug}`} className="flex flex-col gap-5 md:flex-row md:gap-6">
        {article.image ? (
          <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-xl bg-[#F4F4F5] md:aspect-auto md:h-40 md:w-56">
            <Image
              alt={article.imageAlt || article.title}
              className={`object-cover ${recorteDaFoto(article.image).classe} transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none`}
              fill
              sizes="(min-width: 768px) 224px, 100vw"
              src={article.image}
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-marca-texto">{article.category}</span>
          <h2 className="mt-2 text-xl font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover:text-marca-texto md:text-2xl md:leading-tight">
            {article.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#52525B]">{article.description}</p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#71717A]">{article.date}</p>
        </div>
      </Link>
    </article>
  );
}

export default async function ArticlesPage() {
  const publishedArticles = await getPublishedArticles();

  return (
    <MolduraDoPortal>
      <main>
        <section aria-label="lista editorial de artigos" className="mx-auto max-w-[760px] px-5 pb-16 pt-8 sm:px-6 md:pt-12" id="inscrever">
          <div className="border-b-2 border-[#0A0A0A] pb-4">
            {/*
              O título e a linha de apoio eram da vertical anterior: "Leitura
              quinzenal sobre IA, produtos e tecnologia sem hype" num portal de
              imigração para os Estados Unidos.
            */}
            <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] md:text-4xl">Edições</h1>
            <p className="mt-2 text-sm text-[#52525B]">
              Todas as edições do {MARCA.nome}, da mais recente para a mais antiga.
            </p>
          </div>

          <div className="divide-y divide-[#F4F4F5]">
            {publishedArticles.map((article) => (
              <SubstackFeedCard article={article} key={article.slug} />
            ))}
          </div>

          <CaixaDeAssinatura origem="portal-edicoes" className="mt-8" />
        </section>
      </main>
    </MolduraDoPortal>
  );
}
