import { PortalHome } from "@/components/PortalHome";
import { montarHome, pautasRecentes } from "@/lib/server/portal";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";

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
  const pautas = await pautasRecentes(DEFAULT_PROJECT_ID).catch(() => []);

  return <PortalHome dados={montarHome(pautas)} />;
}
