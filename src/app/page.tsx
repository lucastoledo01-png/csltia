import type { Metadata } from "next";
import { PortalHome } from "@/components/PortalHome";
import { MARCA, TITULO_DO_SITE } from "@/lib/marca";
import { dadosEstruturadosDaHome, jsonLdSeguro } from "@/lib/server/dados-estruturados-do-artigo";
import { comDestaqueFixado, montarHome, pautasRecentes } from "@/lib/server/portal";
import { DEFAULT_PROJECT_ID, getProjectById } from "@/lib/server/projects";
import { modoDosRamos } from "@/lib/server/ramos/modo";

/**
 * A home não é pré-renderizada, e a razão é concreta.
 *
 * Com `revalidate = 300` ela era gerada no build e revalidada a cada cinco
 * minutos. O problema não é a janela: é que **o build não tem as variáveis do
 * banco**. O EasyPanel injeta o ambiente em execução, não na construção, então
 * a leitura falhava, o `catch` devolvia lista vazia, e a página nascia sem
 * notícia nenhuma. Em 16/09 o dono abriu o site depois de um deploy e viu
 * exatamente isso: portal no ar, zero matérias.
 *
 * Ela se curava sozinha na primeira visita depois dos cinco minutos, o que é
 * pior que falhar: o defeito aparecia para quem chegasse primeiro e sumia
 * antes de alguém conseguir olhar.
 *
 * O custo de renderizar por requisição é uma consulta de 0,3s numa página que
 * publica uma edição por dia. Um site de notícia vazio custa mais.
 */
export const dynamic = "force-dynamic";

/*
 * Canônico, Open Graph e JSON-LD da home (auditoria de SEO, 05/10/2026).
 * Ela herdava só título e descrição do layout: sem canônico, e
 * `www.casaloti.ia.br` respondia 200 com a mesma página, sem dizer qual das
 * duas é a original.
 */
export const metadata: Metadata = {
  title: { absolute: TITULO_DO_SITE },
  description: MARCA.descricao,
  alternates: { canonical: MARCA.site },
  openGraph: {
    type: "website",
    title: TITULO_DO_SITE,
    description: MARCA.descricao,
    url: MARCA.site,
    siteName: MARCA.nome,
    locale: "pt_BR",
    images: [{ url: MARCA.avatar, alt: MARCA.nome }],
  },
};

/**
 * A home é um jornal, e a unidade dela é a pauta.
 *
 * Antes era uma landing de newsletter com um índice de edições. Quem chega
 * procurando "o que mudou no H1B" não encontrava nada: o assunto estava dentro
 * de uma edição chamada "edicao-2026-09-12", a quatro cliques de distância.
 *
 * Banco fora do ar não deixa a página em branco: sem pauta, o corpo não
 * renderiza os blocos e o cabeçalho, o rodapé e a inscrição continuam de pé.
 */
export default async function Home() {
  /*
   * Com os ramos em `enforce` (integração de 05/10/2026) a home junta as
   * matérias próprias do portal às pautas das edições. Projeto ilegível cai na
   * home de antes, e não na página vazia.
   */
  const projeto = await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  const pautas = await pautasRecentes(DEFAULT_PROJECT_ID, 40, {
    incluirArtigosDosRamos: modoDosRamos(process.env, projeto) === "enforce",
    timezone: projeto?.timezone,
  }).catch(() => []);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(dadosEstruturadosDaHome()) }} />
      <PortalHome dados={montarHome(await comDestaqueFixado(pautas, projeto))} />
    </>
  );
}
